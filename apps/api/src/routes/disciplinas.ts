import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { autenticar, EQUIPE, exigirPerfil, usuarioLogado } from '../lib/auth';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { idParams, idSchema, textoObrigatorio, textoOpcional } from '../lib/validation';
import { sincronizarTurma } from '../services/academico';

const camposDisciplina = {
  nome: textoObrigatorio(2, 200),
  cargaHoraria: z.coerce.number().int().min(0).max(2000).default(0),
  docente: textoOpcional(150),
  titulacao: textoOpcional(100),
  // ID do módulo/avaliação na Cademi, usado na importação de notas
  cademiId: textoOpcional(100),
};

const criarSchema = z.object({
  turmaId: idSchema,
  ...camposDisciplina,
  ordem: z.coerce.number().int().positive().optional(),
});

const atualizarSchema = z.object(camposDisciplina);

/** Renumera as disciplinas da turma em 1, 2, 3... mantendo a ordem atual. */
const renumerar = async (turmaId: string) => {
  const disciplinas = await prisma.disciplina.findMany({
    where: { turmaId },
    orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }],
    select: { id: true },
  });

  await prisma.$transaction(
    disciplinas.map((disciplina, indice) => prisma.disciplina.update({ where: { id: disciplina.id }, data: { ordem: indice + 1 } })),
  );
};

export const disciplinaRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', autenticar());

  app.get('/', async (request) => {
    const { turmaId } = z.object({ turmaId: idSchema.optional() }).parse(request.query);
    return prisma.disciplina.findMany({ where: { turmaId }, orderBy: [{ turmaId: 'asc' }, { ordem: 'asc' }] });
  });

  app.post('/', { preHandler: exigirPerfil(EQUIPE) }, async (request, reply) => {
    const dados = criarSchema.parse(request.body ?? {});

    const turma = await prisma.turma.findUnique({ where: { id: dados.turmaId }, select: { id: true } });
    if (!turma) throw new HttpError(404, 'Turma não encontrada');

    const { modulosPorTurma } = config.regras;
    if (modulosPorTurma > 0 && (await prisma.disciplina.count({ where: { turmaId: dados.turmaId } })) >= modulosPorTurma) {
      throw new HttpError(409, `A turma já tem os ${modulosPorTurma} módulos previstos`);
    }

    const { _max } = await prisma.disciplina.aggregate({ where: { turmaId: dados.turmaId }, _max: { ordem: true } });
    const disciplina = await prisma.disciplina.create({
      data: { ...dados, ordem: dados.ordem ?? (_max.ordem ?? 0) + 1 },
    });

    if (dados.ordem) await renumerar(dados.turmaId);

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'CRIAR',
      entidade: 'Disciplina',
      entidadeId: disciplina.id,
      detalhes: { turmaId: disciplina.turmaId, nome: disciplina.nome },
    });

    // Nova disciplina sem nota muda o semáforo dos alunos da turma
    await sincronizarTurma(disciplina.turmaId);

    return reply.code(201).send(disciplina);
  });

  app.put('/:id', { preHandler: exigirPerfil(EQUIPE) }, async (request) => {
    const { id } = idParams.parse(request.params);
    const dados = atualizarSchema.parse(request.body ?? {});
    const disciplina = await prisma.disciplina.update({ where: { id }, data: dados });

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'ATUALIZAR',
      entidade: 'Disciplina',
      entidadeId: id,
      detalhes: dados,
    });

    return disciplina;
  });

  app.post('/reordenar', { preHandler: exigirPerfil(EQUIPE) }, async (request) => {
    const { turmaId, ids } = z
      .object({ turmaId: idSchema, ids: z.array(idSchema).min(1).max(200) })
      .parse(request.body ?? {});

    const existentes = await prisma.disciplina.findMany({ where: { turmaId }, select: { id: true } });
    const idsExistentes = new Set(existentes.map((disciplina) => disciplina.id));

    if (ids.length !== idsExistentes.size || new Set(ids).size !== ids.length || !ids.every((id) => idsExistentes.has(id))) {
      throw new HttpError(400, 'A lista deve conter todas as disciplinas da turma, sem repetição');
    }

    await prisma.$transaction(ids.map((id, indice) => prisma.disciplina.update({ where: { id }, data: { ordem: indice + 1 } })));

    return prisma.disciplina.findMany({ where: { turmaId }, orderBy: { ordem: 'asc' } });
  });

  app.delete('/:id', { preHandler: exigirPerfil(EQUIPE) }, async (request, reply) => {
    const { id } = idParams.parse(request.params);

    const notasLancadas = await prisma.nota.count({
      where: { disciplinaId: id, OR: [{ media: { not: null } }, { frequencia: { not: null } }] },
    });
    if (notasLancadas > 0) {
      throw new HttpError(409, 'Esta disciplina já possui notas lançadas. Apague as notas antes de removê-la.');
    }

    const disciplina = await prisma.disciplina.delete({ where: { id } });
    await renumerar(disciplina.turmaId);

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'EXCLUIR',
      entidade: 'Disciplina',
      entidadeId: id,
      detalhes: { turmaId: disciplina.turmaId, nome: disciplina.nome },
    });

    await sincronizarTurma(disciplina.turmaId);

    return reply.code(204).send();
  });
};
