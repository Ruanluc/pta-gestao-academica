import type { FastifyPluginAsync } from 'fastify';
import { CondicaoGraduacao, Prisma, StatusSemaforo } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { autenticar, EQUIPE, exigirPerfil, SO_ADMIN, usuarioLogado } from '../lib/auth';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { calcularSemaforo, documentosObrigatorios } from '../lib/semaforo';
import { removerArquivo } from '../lib/storage';
import { enviarLinkAcessoPorEmail, gerarLinkAcessoAluno } from '../lib/acessoAluno';
import { driveHabilitado } from '../lib/googleDrive';
import { exportarPastaAluno } from '../services/exportacaoDrive';
import {
  cpfSchema,
  dataOpcional,
  emailSchema,
  idParams,
  idSchema,
  somenteDigitos,
  textoObrigatorio,
  textoOpcional,
} from '../lib/validation';
import { sincronizarAluno } from '../services/academico';

export const alunoSchema = z.object({
  nome: textoObrigatorio(3, 200),
  cpf: cpfSchema,
  email: emailSchema,
  telefone: textoOpcional(30),
  dataNascimento: dataOpcional,
  nacionalidade: textoOpcional(80),
  naturalidade: textoOpcional(120),
  filiacao: textoOpcional(300),
  rgNumero: textoOpcional(30),
  rgOrgaoEmissor: textoOpcional(30),
  condicaoGraduacao: z.nativeEnum(CondicaoGraduacao).default('CURSANDO'),
  // Vazio: é preenchido na primeira importação da Cademi, casando por CPF ou e-mail
  cademiId: textoOpcional(100),
});

/** Remove campos internos (hash do link do portal) antes de responder. */
const publicarAluno = <T extends { acessoTokenHash: string | null }>({ acessoTokenHash: _hash, ...aluno }: T) => aluno;

export const alunoRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', autenticar());

  app.get('/', async (request) => {
    const { busca, status, turmaId } = z
      .object({
        busca: textoOpcional(100),
        status: z.nativeEnum(StatusSemaforo).optional(),
        turmaId: idSchema.optional(),
      })
      .parse(request.query);

    const digitos = busca ? somenteDigitos(busca) : '';
    const filtros: Prisma.AlunoWhereInput[] = [];

    if (busca) {
      filtros.push({
        OR: [
          { nome: { contains: busca, mode: 'insensitive' } },
          { email: { contains: busca, mode: 'insensitive' } },
          ...(digitos ? [{ cpf: { contains: digitos } }] : []),
        ],
      });
    }
    if (status) filtros.push({ statusSemaforo: status });
    if (turmaId) filtros.push({ matriculas: { some: { turmaId } } });

    const alunos = await prisma.aluno.findMany({
      where: { AND: filtros },
      orderBy: { nome: 'asc' },
      take: 500,
      include: { matriculas: { select: { id: true, turma: { select: { id: true, nome: true } } } } },
    });
    return alunos.map(publicarAluno);
  });

  app.get('/:id', async (request) => {
    const { id } = idParams.parse(request.params);

    const aluno = await prisma.aluno.findUnique({
      where: { id },
      include: {
        matriculas: {
          orderBy: { dataInclusao: 'desc' },
          include: { turma: { include: { disciplinas: { orderBy: { ordem: 'asc' } } } } },
        },
        documentos: {
          orderBy: { criadoEm: 'desc' },
          include: { enviadoPor: { select: { nome: true } }, analisadoPor: { select: { nome: true } } },
        },
        notas: true,
        notificacoes: { orderBy: { criadoEm: 'desc' }, take: 10 },
      },
    });

    if (!aluno) throw new HttpError(404, 'Aluno não encontrado');

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

    // Professores não veem os documentos pessoais do aluno
    const documentos =
      usuarioLogado(request).role === 'PROFESSOR' ? [] : aluno.documentos.map(({ arquivoRef: _ref, ...documento }) => documento);

    return {
      ...publicarAluno(aluno),
      documentos,
      pendencias,
      documentosObrigatorios: documentosObrigatorios(aluno.condicaoGraduacao),
      regras: config.regras,
      driveConfigurado: driveHabilitado(),
    };
  });

  app.post('/', { preHandler: exigirPerfil(EQUIPE) }, async (request, reply) => {
    const dados = alunoSchema.parse(request.body ?? {});
    const aluno = await prisma.aluno.create({ data: dados });

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'CRIAR',
      entidade: 'Aluno',
      entidadeId: aluno.id,
      detalhes: { nome: aluno.nome, cpf: aluno.cpf },
    });

    await sincronizarAluno(aluno.id);
    const criado = await prisma.aluno.findUnique({ where: { id: aluno.id } });
    return reply.code(201).send(criado && publicarAluno(criado));
  });

  app.put('/:id', { preHandler: exigirPerfil(EQUIPE) }, async (request) => {
    const { id } = idParams.parse(request.params);
    const dados = alunoSchema.parse(request.body ?? {});
    await prisma.aluno.update({ where: { id }, data: dados });

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'ATUALIZAR',
      entidade: 'Aluno',
      entidadeId: id,
      detalhes: dados,
    });

    // A condição de graduação altera os documentos exigidos
    await sincronizarAluno(id);
    const atualizado = await prisma.aluno.findUnique({ where: { id } });
    return atualizado && publicarAluno(atualizado);
  });

  /** Exporta (manualmente) a pasta do aluno para o Google Drive: documentos e histórico ainda não enviados. */
  app.post('/:id/exportar-drive', { preHandler: exigirPerfil(EQUIPE) }, async (request) => {
    const { id } = idParams.parse(request.params);
    return exportarPastaAluno(id, usuarioLogado(request).id);
  });

  /** Gera um novo link de acesso ao portal (invalida o anterior), envia por e-mail e devolve para copiar. */
  app.post('/:id/link-acesso', { preHandler: exigirPerfil(EQUIPE) }, async (request) => {
    const { id } = idParams.parse(request.params);

    const aluno = await prisma.aluno.findUnique({ where: { id }, select: { id: true, nome: true, email: true } });
    if (!aluno) throw new HttpError(404, 'Aluno não encontrado');

    const { link, expiraEm } = await gerarLinkAcessoAluno(aluno.id);

    let emailEnviado = false;
    try {
      emailEnviado = await enviarLinkAcessoPorEmail(aluno, link, expiraEm);
    } catch (erro) {
      request.log.warn(erro, 'falha ao enviar link do portal por e-mail');
    }

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'LINK_PORTAL_GERADO',
      entidade: 'Aluno',
      entidadeId: aluno.id,
      detalhes: { emailEnviado },
    });

    return { link, expiraEm, emailEnviado };
  });

  app.delete('/:id', { preHandler: exigirPerfil(SO_ADMIN) }, async (request, reply) => {
    const { id } = idParams.parse(request.params);

    const aluno = await prisma.aluno.findUnique({
      where: { id },
      include: { documentos: { select: { arquivoRef: true } }, matriculas: { select: { historicoRef: true } } },
    });
    if (!aluno) throw new HttpError(404, 'Aluno não encontrado');

    await prisma.aluno.delete({ where: { id } });

    const arquivos = [
      ...aluno.documentos.map((documento) => documento.arquivoRef),
      ...aluno.matriculas.map((matricula) => matricula.historicoRef),
    ];
    await Promise.all(arquivos.map((ref) => removerArquivo(ref)));

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'EXCLUIR',
      entidade: 'Aluno',
      entidadeId: id,
      detalhes: { nome: aluno.nome, cpf: aluno.cpf },
    });

    return reply.code(204).send();
  });
};
