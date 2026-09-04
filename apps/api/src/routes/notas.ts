import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../main';
import { getAuthPayload, hasRequiredRole } from '../lib/auth';
import { writeAuditLog } from '../lib/audit';
import { getPdfGenerationQueue } from '../lib/queue';

export const notaRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    const payload = await getAuthPayload(request, reply);
    if (!payload) return;
    if (!hasRequiredRole(payload.role, ['ADMIN', 'SECRETARIA', 'PROFESSOR'])) {
      return reply.code(403).send({ message: 'Acesso negado' });
    }

    return prisma.grade.findMany({
      where: { deletedAt: null },
      include: { student: true, module: true },
    });
  });

  app.post('/', async (request, reply) => {
    const payload = await getAuthPayload(request, reply);
    if (!payload) return;
    if (!hasRequiredRole(payload.role, ['ADMIN', 'SECRETARIA', 'PROFESSOR'])) {
      return reply.code(403).send({ message: 'Acesso negado' });
    }

    const data = request.body as any;
    const nota = await prisma.grade.create({
      data: {
        studentId: data.studentId ?? data.alunoId,
        moduleId: data.moduleId ?? data.disciplinaId,
        value: data.value ?? data.media ?? 0,
        createdById: payload.id,
      },
    });
    await writeAuditLog({
      usuarioId: payload.id,
      usuarioNome: payload.role,
      entidade: 'Grade',
      entidadeId: nota.id,
      acao: 'CRIAR',
      detalhes: JSON.stringify({ studentId: nota.studentId, moduleId: nota.moduleId, value: nota.value }),
    });

    try {
      const queue = getPdfGenerationQueue();
      await queue.add(
        'verificar-historico',
        { studentId: nota.studentId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
    } catch (queueError) {
      console.warn('Falha ao despachar verificação para a fila:', queueError);
    }

    return reply.code(201).send({ ...nota, queued: true });
  });

  app.put('/:id', async (request, reply) => {
    const payload = await getAuthPayload(request, reply);
    if (!payload) return;
    if (!hasRequiredRole(payload.role, ['ADMIN', 'SECRETARIA', 'PROFESSOR'])) {
      return reply.code(403).send({ message: 'Acesso negado' });
    }

    const { id } = request.params as { id: string };
    const data = request.body as any;
    const nota = await prisma.grade.update({
      where: { id },
      data: {
        value: data.value ?? data.media,
        updatedAt: new Date(),
      },
    });

    await writeAuditLog({
      usuarioId: payload.id,
      usuarioNome: payload.role,
      entidade: 'Grade',
      entidadeId: id,
      acao: 'ATUALIZAR',
      detalhes: JSON.stringify(data),
    });

    try {
      const queue = getPdfGenerationQueue();
      await queue.add(
        'verificar-historico',
        { studentId: nota.studentId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
    } catch (queueError) {
      console.warn('Falha ao despachar verificação para a fila:', queueError);
    }

    return { ...nota, queued: true };
  });
};
