import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { autenticar, EQUIPE, exigirPerfil, usuarioLogado } from '../lib/auth';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { idParams, idSchema, numeroOpcional } from '../lib/validation';
import { sincronizarAluno } from '../services/academico';

// Nota da avaliação do módulo de 0 a 100, frequência de 0 a 100 (%). Campo vazio = ainda não lançado.
const notaItemSchema = z.object({
  disciplinaId: idSchema,
  media: numeroOpcional(0, 100),
  frequencia: numeroOpcional(0, 100),
});

type NotaItem = z.infer<typeof notaItemSchema>;

const salvarNotas = async (alunoId: string, itensRecebidos: NotaItem[], usuarioId: string) => {
  // Se a mesma disciplina vier repetida, vale o último valor
  const itens = [...new Map(itensRecebidos.map((item) => [item.disciplinaId, item])).values()];
  const disciplinaIds = itens.map((item) => item.disciplinaId);

  const disciplinas = await prisma.disciplina.findMany({
    where: { id: { in: disciplinaIds } },
    select: { id: true, nome: true, turmaId: true },
  });
  if (disciplinas.length !== disciplinaIds.length) throw new HttpError(404, 'Disciplina não encontrada');

  const turmaIds = [...new Set(disciplinas.map((disciplina) => disciplina.turmaId))];
  const matriculas = await prisma.matricula.count({ where: { alunoId, turmaId: { in: turmaIds } } });
  if (matriculas !== turmaIds.length) {
    throw new HttpError(400, 'O aluno não está matriculado na turma desta disciplina');
  }

  const anteriores = await prisma.nota.findMany({ where: { alunoId, disciplinaId: { in: disciplinaIds } } });

  const salvas = await prisma.$transaction(
    itens.map((item) =>
      prisma.nota.upsert({
        where: { alunoId_disciplinaId: { alunoId, disciplinaId: item.disciplinaId } },
        create: {
          alunoId,
          disciplinaId: item.disciplinaId,
          media: item.media ?? null,
          frequencia: item.frequencia ?? null,
          lancadoPorId: usuarioId,
          origem: 'MANUAL',
        },
        update: {
          ...(item.media !== undefined ? { media: item.media } : {}),
          ...(item.frequencia !== undefined ? { frequencia: item.frequencia } : {}),
          lancadoPorId: usuarioId,
          origem: 'MANUAL',
        },
      }),
    ),
  );

  await registrarAuditoria({
    usuarioId,
    acao: 'LANCAR_NOTAS',
    entidade: 'Aluno',
    entidadeId: alunoId,
    detalhes: salvas.map((nota) => {
      const anterior = anteriores.find((item) => item.disciplinaId === nota.disciplinaId);
      return {
        disciplina: disciplinas.find((disciplina) => disciplina.id === nota.disciplinaId)?.nome,
        antes: anterior ? { media: anterior.media, frequencia: anterior.frequencia } : null,
        depois: { media: nota.media, frequencia: nota.frequencia },
      };
    }),
  });

  await sincronizarAluno(alunoId);
  return salvas;
};

export const notaRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', autenticar());

  app.get('/', async (request) => {
    const { alunoId, turmaId } = z
      .object({ alunoId: idSchema.optional(), turmaId: idSchema.optional() })
      .parse(request.query);

    return prisma.nota.findMany({
      where: { alunoId, disciplina: turmaId ? { turmaId } : undefined },
      include: { disciplina: { select: { id: true, nome: true, ordem: true, turmaId: true } } },
      orderBy: { disciplina: { ordem: 'asc' } },
      take: 2000,
    });
  });

  /** Lança/atualiza a nota de uma disciplina. */
  app.put('/', async (request) => {
    const { alunoId, ...item } = notaItemSchema.extend({ alunoId: idSchema }).parse(request.body ?? {});
    const [nota] = await salvarNotas(alunoId, [item], usuarioLogado(request).id);
    return nota;
  });

  /** Lança/atualiza várias notas do mesmo aluno de uma vez. */
  app.put('/lote', async (request) => {
    const { alunoId, notas } = z
      .object({ alunoId: idSchema, notas: z.array(notaItemSchema).min(1).max(200) })
      .parse(request.body ?? {});
    return salvarNotas(alunoId, notas, usuarioLogado(request).id);
  });

  /** Lança a nota de uma disciplina para vários alunos da turma de uma vez. */
  app.put('/disciplina', async (request) => {
    const { disciplinaId, notas } = z
      .object({
        disciplinaId: idSchema,
        notas: z
          .array(z.object({ alunoId: idSchema, media: numeroOpcional(0, 100), frequencia: numeroOpcional(0, 100) }))
          .min(1)
          .max(500),
      })
      .parse(request.body ?? {});

    const usuarioId = usuarioLogado(request).id;
    const salvas = [];
    for (const { alunoId, media, frequencia } of notas) {
      salvas.push(...(await salvarNotas(alunoId, [{ disciplinaId, media, frequencia }], usuarioId)));
    }
    return salvas;
  });

  app.delete('/:id', { preHandler: exigirPerfil(EQUIPE) }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const nota = await prisma.nota.delete({ where: { id } });

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'EXCLUIR',
      entidade: 'Nota',
      entidadeId: id,
      detalhes: { alunoId: nota.alunoId, disciplinaId: nota.disciplinaId, media: nota.media, frequencia: nota.frequencia },
    });

    await sincronizarAluno(nota.alunoId);
    return reply.code(204).send();
  });
};
