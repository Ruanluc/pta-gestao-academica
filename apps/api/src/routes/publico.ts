import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { criarSessaoAluno, enviarLinkAcessoPorEmail, gerarLinkAcessoAluno } from '../lib/acessoAluno';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { criarLimitador } from '../lib/rateLimit';
import { dataObrigatoria, textoObrigatorio } from '../lib/validation';
import { sincronizarAluno } from '../services/academico';
import { alunoSchema } from './alunos';

const limitarInscricao = criarLimitador({ max: 10, janelaMs: 60 * 60 * 1000 });
const codigoParams = z.object({ codigo: z.string().min(10, 'Link de inscrição inválido').max(64) });
// Na inscrição online, os dados que aparecem no histórico da certificadora são obrigatórios
const inscricaoSchema = alunoSchema.omit({ cademiId: true }).extend({
  dataNascimento: dataObrigatoria,
  nacionalidade: textoObrigatorio(2, 80),
  naturalidade: textoObrigatorio(2, 120),
  filiacao: textoObrigatorio(3, 300),
  rgNumero: textoObrigatorio(3, 30),
  rgOrgaoEmissor: textoObrigatorio(2, 30),
});

const turmaComInscricaoAberta = async (codigo: string) => {
  const turma = await prisma.turma.findUnique({
    where: { codigoInscricao: codigo },
    select: { id: true, nome: true, dataInicio: true, dataFim: true, ativa: true, inscricoesAbertas: true },
  });
  if (!turma || !turma.ativa || !turma.inscricoesAbertas) {
    throw new HttpError(404, 'Link de inscrição inválido ou inscrições encerradas para esta turma.');
  }
  return turma;
};

/** Rotas sem login: inscrição do aluno pelo link da turma. */
export const publicoRoutes: FastifyPluginAsync = async (app) => {
  app.get('/inscricao/:codigo', async (request) => {
    const { codigo } = codigoParams.parse(request.params);
    const turma = await turmaComInscricaoAberta(codigo);
    return { turma: { nome: turma.nome, dataInicio: turma.dataInicio, dataFim: turma.dataFim } };
  });

  app.post('/inscricao/:codigo', async (request, reply) => {
    const { codigo } = codigoParams.parse(request.params);
    limitarInscricao(request.ip);

    const turma = await turmaComInscricaoAberta(codigo);
    const dados = inscricaoSchema.parse(request.body ?? {});

    const existente = await prisma.aluno.findUnique({ where: { cpf: dados.cpf }, select: { id: true, nome: true, email: true } });

    if (existente) {
      // CPF já cadastrado: matricula na turma, mas não mostra nem altera os dados e
      // manda o acesso só para o e-mail que já estava no cadastro.
      await prisma.matricula.upsert({
        where: { alunoId_turmaId: { alunoId: existente.id, turmaId: turma.id } },
        create: { alunoId: existente.id, turmaId: turma.id },
        update: {},
      });
      const { link, expiraEm } = await gerarLinkAcessoAluno(existente.id);
      await enviarLinkAcessoPorEmail(existente, link, expiraEm).catch((erro) => request.log.warn(erro, 'falha ao enviar link do portal'));

      await registrarAuditoria({
        acao: 'INSCRICAO_ONLINE',
        entidade: 'Aluno',
        entidadeId: existente.id,
        detalhes: { turmaId: turma.id, cadastroExistente: true },
      });
      await sincronizarAluno(existente.id);

      return reply.code(202).send({
        message:
          'Inscrição registrada. Se você já tinha cadastro conosco, enviamos o link de acesso ao portal para o e-mail informado naquele cadastro.',
      });
    }

    const aluno = await prisma.aluno.create({
      data: { ...dados, inscricaoOnline: true, matriculas: { create: { turmaId: turma.id } } },
      select: { id: true, nome: true, email: true },
    });

    await registrarAuditoria({
      acao: 'INSCRICAO_ONLINE',
      entidade: 'Aluno',
      entidadeId: aluno.id,
      detalhes: { turmaId: turma.id, nome: aluno.nome },
    });
    await sincronizarAluno(aluno.id);

    // O link também vai por e-mail, para o aluno voltar ao portal depois
    const { link, expiraEm } = await gerarLinkAcessoAluno(aluno.id);
    await enviarLinkAcessoPorEmail(aluno, link, expiraEm).catch((erro) => request.log.warn(erro, 'falha ao enviar link do portal'));

    // Quem acabou de preencher os próprios dados já entra direto no portal
    return reply.code(201).send({ message: 'Inscrição concluída!', sessao: criarSessaoAluno(aluno.id) });
  });
};
