import { FastifyPluginAsync } from 'fastify';
import { getAuthPayload, hasRequiredRole } from '../lib/auth';

export const matriculaRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    const payload = await getAuthPayload(request, reply);
    if (!payload) return;
    if (!hasRequiredRole(payload.role, ['ADMIN', 'SECRETARIA', 'PROFESSOR'])) {
      return reply.code(403).send({ message: 'Acesso negado' });
    }

    return [];
  });

  app.post('/', async (request, reply) => {
    const payload = await getAuthPayload(request, reply);
    if (!payload) return;
    if (!hasRequiredRole(payload.role, ['ADMIN', 'SECRETARIA'])) {
      return reply.code(403).send({ message: 'Acesso negado' });
    }

    const data = request.body as any;
    return reply.code(201).send({ id: `matricula-${Date.now()}`, ...data });
  });
};
