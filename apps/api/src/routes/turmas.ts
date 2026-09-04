import { FastifyPluginAsync } from 'fastify';
import { inMemoryStore, prisma } from '../main';
import { getAuthPayload, hasRequiredRole } from '../lib/auth';

const normalizeTurmaPayload = (data: any) => {
  const turma = { ...data };
  return {
    name: turma.name ?? turma.nome ?? 'Nova turma',
  };
};

export const turmaRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    const payload = await getAuthPayload(request, reply);
    if (!payload) return;
    if (!hasRequiredRole(payload.role, ['ADMIN', 'SECRETARIA'])) {
      return reply.code(403).send({ message: 'Acesso negado' });
    }

    try {
      return await prisma.module.findMany({ orderBy: { createdAt: 'asc' } });
    } catch {
      return inMemoryStore.turmas;
    }
  });

  app.post('/', async (request, reply) => {
    const payload = await getAuthPayload(request, reply);
    if (!payload) return;
    if (!hasRequiredRole(payload.role, ['ADMIN', 'SECRETARIA'])) {
      return reply.code(403).send({ message: 'Acesso negado' });
    }

    try {
      const data = normalizeTurmaPayload(request.body as any);
      const turma = await prisma.module.create({ data });
      return reply.code(201).send(turma);
    } catch {
      const fallback = {
        id: `turma-${Date.now()}`,
        ...normalizeTurmaPayload(request.body as any),
      };
      inMemoryStore.turmas.unshift(fallback);
      return reply.code(201).send(fallback);
    }
  });
};
