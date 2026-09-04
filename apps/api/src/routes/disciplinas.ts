import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../main';

export const disciplinaRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    return prisma.module.findMany({ orderBy: { createdAt: 'asc' } });
  });

  app.post('/', async (request, reply) => {
    const data = request.body as any;
    const disciplina = await prisma.module.create({
      data: {
        name: data.name ?? data.nome ?? 'Novo módulo',
      },
    });
    return reply.code(201).send(disciplina);
  });
};
