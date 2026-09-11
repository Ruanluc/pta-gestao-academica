import './lib/validation';
import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config';
import { prisma } from './lib/prisma';
import { tratarErro } from './lib/errors';
import { authRoutes } from './routes/auth';
import { usuarioRoutes } from './routes/usuarios';
import { turmaRoutes } from './routes/turmas';
import { disciplinaRoutes } from './routes/disciplinas';
import { alunoRoutes } from './routes/alunos';
import { matriculaRoutes } from './routes/matriculas';
import { notaRoutes } from './routes/notas';
import { documentoRoutes } from './routes/documentos';
import { dashboardRoutes } from './routes/dashboard';
import { auditoriaRoutes } from './routes/auditoria';
import { cademiRoutes } from './routes/cademi';
import { publicoRoutes } from './routes/publico';
import { portalRoutes } from './routes/portal';
import { loteRoutes } from './routes/lotes';
import { solicitacaoRoutes } from './routes/solicitacoes';
import { financeiroRoutes } from './routes/financeiro';
import { certificadoraRoutes } from './routes/certificadoras';

export const buildApp = async (opcoes: FastifyServerOptions = {}) => {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    disableRequestLogging: true,
    ...opcoes,
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Content-Disposition'],
  });

  await app.register(multipart, {
    // Até 10 arquivos por documento (ex.: frente e verso), juntados em um único PDF
    limits: { fileSize: config.uploadMaxMb * 1024 * 1024, files: 10, fields: 10 },
  });

  app.setErrorHandler(tratarErro);
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ message: 'Rota não encontrada' }));

  app.get('/health', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, banco: 'ok' };
    } catch {
      return reply.code(503).send({ ok: false, banco: 'indisponível' });
    }
  });

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(usuarioRoutes, { prefix: '/usuarios' });
  await app.register(turmaRoutes, { prefix: '/turmas' });
  await app.register(disciplinaRoutes, { prefix: '/disciplinas' });
  await app.register(alunoRoutes, { prefix: '/alunos' });
  await app.register(matriculaRoutes, { prefix: '/matriculas' });
  await app.register(notaRoutes, { prefix: '/notas' });
  await app.register(documentoRoutes, { prefix: '/documentos' });
  await app.register(dashboardRoutes, { prefix: '/dashboard' });
  await app.register(auditoriaRoutes, { prefix: '/auditoria' });
  await app.register(cademiRoutes, { prefix: '/cademi' });
  await app.register(publicoRoutes, { prefix: '/publico' });
  await app.register(portalRoutes, { prefix: '/portal' });
  await app.register(loteRoutes, { prefix: '/lotes' });
  await app.register(solicitacaoRoutes, { prefix: '/solicitacoes' });
  await app.register(financeiroRoutes, { prefix: '/financeiro' });
  await app.register(certificadoraRoutes, { prefix: '/certificadoras' });

  return app;
};
