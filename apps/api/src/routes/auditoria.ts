import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { autenticar, SO_ADMIN } from '../lib/auth';
import { textoOpcional } from '../lib/validation';

export const auditoriaRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', autenticar(SO_ADMIN));

  app.get('/', async (request) => {
    const { entidade, entidadeId, limite } = z
      .object({
        entidade: textoOpcional(50),
        entidadeId: textoOpcional(100),
        limite: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(request.query);

    return prisma.auditLog.findMany({
      where: { entidade: entidade ?? undefined, entidadeId: entidadeId ?? undefined },
      include: { usuario: { select: { nome: true, email: true } } },
      orderBy: { criadoEm: 'desc' },
      take: limite,
    });
  });
};
