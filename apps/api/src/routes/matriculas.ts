import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { autenticar, EQUIPE, exigirPerfil, usuarioLogado } from '../lib/auth';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { gerarPdfHistorico } from '../lib/historico';
import { contentDisposition, slugificar } from '../lib/http';
import { abrirArquivo, removerArquivo } from '../lib/storage';
import { idParams, idSchema } from '../lib/validation';
import { montarDadosHistorico, sincronizarAluno } from '../services/academico';

const SELECAO_ALUNO = { id: true, nome: true, cpf: true, email: true, statusSemaforo: true } as const;
const SELECAO_TURMA = { id: true, nome: true, ativa: true } as const;

export const matriculaRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', autenticar());

  app.get('/', async (request) => {
    const { turmaId, alunoId } = z
      .object({ turmaId: idSchema.optional(), alunoId: idSchema.optional() })
      .parse(request.query);

    return prisma.matricula.findMany({
      where: { turmaId, alunoId },
      orderBy: { dataInclusao: 'desc' },
      include: { aluno: { select: SELECAO_ALUNO }, turma: { select: SELECAO_TURMA } },
    });
  });

  app.post('/', { preHandler: exigirPerfil(EQUIPE) }, async (request, reply) => {
    const { alunoId, turmaId } = z.object({ alunoId: idSchema, turmaId: idSchema }).parse(request.body ?? {});

    const [aluno, turma, existente] = await Promise.all([
      prisma.aluno.findUnique({ where: { id: alunoId }, select: { id: true } }),
      prisma.turma.findUnique({ where: { id: turmaId }, select: { id: true } }),
      prisma.matricula.findUnique({ where: { alunoId_turmaId: { alunoId, turmaId } }, select: { id: true } }),
    ]);

    if (!aluno) throw new HttpError(404, 'Aluno não encontrado');
    if (!turma) throw new HttpError(404, 'Turma não encontrada');
    if (existente) throw new HttpError(409, 'Este aluno já está matriculado nesta turma');

    const matricula = await prisma.matricula.create({
      data: { alunoId, turmaId },
      include: { aluno: { select: SELECAO_ALUNO }, turma: { select: SELECAO_TURMA } },
    });

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'CRIAR',
      entidade: 'Matricula',
      entidadeId: matricula.id,
      detalhes: { alunoId, turmaId },
    });

    await sincronizarAluno(alunoId);
    return reply.code(201).send(matricula);
  });

  /** Remove a matrícula e as notas do aluno nas disciplinas desta turma. */
  app.delete('/:id', { preHandler: exigirPerfil(EQUIPE) }, async (request, reply) => {
    const { id } = idParams.parse(request.params);

    const matricula = await prisma.matricula.findUnique({
      where: { id },
      include: { turma: { select: { disciplinas: { select: { id: true } } } } },
    });
    if (!matricula) throw new HttpError(404, 'Matrícula não encontrada');

    const disciplinaIds = matricula.turma.disciplinas.map((disciplina) => disciplina.id);
    const [notasRemovidas] = await prisma.$transaction([
      prisma.nota.deleteMany({ where: { alunoId: matricula.alunoId, disciplinaId: { in: disciplinaIds } } }),
      prisma.matricula.delete({ where: { id } }),
    ]);

    await removerArquivo(matricula.historicoRef);

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'EXCLUIR',
      entidade: 'Matricula',
      entidadeId: id,
      detalhes: { alunoId: matricula.alunoId, turmaId: matricula.turmaId, notasRemovidas: notasRemovidas.count },
    });

    await sincronizarAluno(matricula.alunoId);
    return reply.code(204).send();
  });

  /** PDF final salvo na pasta do aluno (gerado quando ele conclui todos os módulos). */
  app.get('/:id/historico-final', async (request, reply) => {
    const { id } = idParams.parse(request.params);

    const matricula = await prisma.matricula.findUnique({
      where: { id },
      include: { aluno: { select: { nome: true } }, turma: { select: { nome: true } } },
    });
    if (!matricula) throw new HttpError(404, 'Matrícula não encontrada');
    if (!matricula.historicoRef) {
      throw new HttpError(404, 'O histórico final ainda não foi gerado: o aluno precisa concluir todos os módulos.');
    }

    const stream = await abrirArquivo(matricula.historicoRef);
    const nome = `historico-${slugificar(matricula.aluno.nome)}-${slugificar(matricula.turma.nome)}.pdf`;

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', contentDisposition(nome))
      .header('Cache-Control', 'private, no-store')
      .send(stream);
  });

  /** Gera o histórico na hora (parcial se o curso ainda não estiver concluído). */
  app.get('/:id/historico', async (request, reply) => {
    const { id } = idParams.parse(request.params);

    const resultado = await montarDadosHistorico(id);
    if (!resultado) throw new HttpError(404, 'Matrícula não encontrada');

    const pdf = await gerarPdfHistorico(resultado.dados);
    const nome = `historico-${slugificar(resultado.dados.aluno.nome)}-${slugificar(resultado.dados.turma.nome)}.pdf`;

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', contentDisposition(nome))
      .header('Cache-Control', 'private, no-store')
      .send(pdf);
  });
};
