import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import {
  alunoDoPortal,
  autenticarAluno,
  criarSessaoAluno,
  enviarLinkAcessoPorEmail,
  gerarLinkAcessoAluno,
  validarLinkAcesso,
} from '../lib/acessoAluno';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { criarLimitador } from '../lib/rateLimit';
import { calcularSemaforo, documentosObrigatorios } from '../lib/semaforo';
import { cpfSchema, emailSchema, idParams } from '../lib/validation';
import { receberDocumento, responderArquivo } from '../services/documentos';

const limitarPedidoLink = criarLimitador({ max: 5, janelaMs: 15 * 60 * 1000 });

/** Portal do aluno: acesso por link pessoal, sem senha. */
export const portalRoutes: FastifyPluginAsync = async (app) => {
  /** Troca o link recebido por uma sessão do portal. */
  app.post('/acesso', async (request) => {
    const { token } = z.object({ token: z.string().min(10, 'Link de acesso inválido') }).parse(request.body ?? {});

    const aluno = await validarLinkAcesso(token);
    if (!aluno) throw new HttpError(401, 'Link de acesso inválido ou expirado. Peça um novo link.');

    await registrarAuditoria({ acao: 'ACESSO_PORTAL', entidade: 'Aluno', entidadeId: aluno.id });
    return { sessao: criarSessaoAluno(aluno.id), aluno: { nome: aluno.nome } };
  });

  /** O aluno pede um novo link informando CPF e e-mail do cadastro. */
  app.post('/solicitar-link', async (request) => {
    const { cpf, email } = z.object({ cpf: cpfSchema, email: emailSchema }).parse(request.body ?? {});
    limitarPedidoLink(`${request.ip}:${cpf}`);

    const aluno = await prisma.aluno.findUnique({ where: { cpf }, select: { id: true, nome: true, email: true } });
    if (aluno && aluno.email.trim().toLowerCase() === email) {
      const { link, expiraEm } = await gerarLinkAcessoAluno(aluno.id);
      await enviarLinkAcessoPorEmail(aluno, link, expiraEm);
      await registrarAuditoria({ acao: 'LINK_PORTAL_SOLICITADO', entidade: 'Aluno', entidadeId: aluno.id });
    }

    // Mesma resposta sempre, para não revelar quem tem cadastro
    return { message: 'Se os dados conferirem com o cadastro, você receberá o link de acesso por e-mail em instantes.' };
  });

  await app.register(async (privado) => {
    privado.addHook('onRequest', autenticarAluno);

    privado.get('/eu', async (request) => {
      const aluno = await prisma.aluno.findUnique({
        where: { id: alunoDoPortal(request).id },
        include: {
          documentos: {
            orderBy: { criadoEm: 'desc' },
            select: { id: true, tipo: true, nomeArquivo: true, tamanho: true, status: true, motivoRejeicao: true, criadoEm: true },
          },
          notas: { select: { disciplinaId: true, media: true, frequencia: true } },
          matriculas: {
            orderBy: { dataInclusao: 'desc' },
            select: { turma: { select: { nome: true, dataInicio: true, dataFim: true, disciplinas: { select: { id: true } } } } },
          },
        },
      });
      if (!aluno) throw new HttpError(404, 'Cadastro não encontrado');

      const { pendencias } = calcularSemaforo(
        {
          condicaoGraduacao: aluno.condicaoGraduacao,
          documentos: aluno.documentos,
          turmas: aluno.matriculas.map((matricula) => matricula.turma),
          notas: aluno.notas,
          dadosPessoais: aluno,
        },
        config.regras,
      );

      return {
        nome: aluno.nome,
        email: aluno.email,
        condicaoGraduacao: aluno.condicaoGraduacao,
        statusSemaforo: aluno.statusSemaforo,
        pendencias,
        documentosObrigatorios: documentosObrigatorios(aluno.condicaoGraduacao),
        documentos: aluno.documentos,
        turmas: aluno.matriculas.map(({ turma }) => ({ nome: turma.nome, dataInicio: turma.dataInicio, dataFim: turma.dataFim })),
      };
    });

    /** Upload pelo aluno: campo "tipo" antes do campo "arquivo". */
    privado.post('/documentos', async (request, reply) => {
      const documento = await receberDocumento(request, { alunoIdFixo: alunoDoPortal(request).id, enviadoPorId: null });
      return reply.code(201).send(documento);
    });

    privado.get('/documentos/:id/arquivo', async (request, reply) => {
      const { id } = idParams.parse(request.params);
      // Só os documentos do próprio aluno
      const documento = await prisma.documento.findFirst({ where: { id, alunoId: alunoDoPortal(request).id } });
      if (!documento) throw new HttpError(404, 'Documento não encontrado');
      return responderArquivo(reply, documento);
    });
  });
};
