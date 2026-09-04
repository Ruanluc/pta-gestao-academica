import 'reflect-metadata';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { authRoutes } from './routes/auth';
import { turmaRoutes } from './routes/turmas';
import { alunoRoutes } from './routes/alunos';
import { disciplinaRoutes } from './routes/disciplinas';
import { matriculaRoutes } from './routes/matriculas';
import { documentoRoutes } from './routes/documentos';
import { notaRoutes } from './routes/notas';
import { createHistoricoWorker, createPdfGenerationWorker } from './lib/queue';
import { getAuthPayload } from './lib/auth';

dotenv.config({ path: resolve(__dirname, '../.env') });

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET deve ser definido no arquivo .env');
}

const app = Fastify({ logger: false });
export const prisma = new PrismaClient();
export const inMemoryStore = {
  turmas: [] as any[],
  alunos: [] as any[],
};

app.register(cors, { origin: true });
app.register(jwt, { secret: process.env.JWT_SECRET });
app.register(multipart, {
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 1,
  },
});

app.decorate('authenticate', async (request, reply) => {
  const payload = await getAuthPayload(request, reply);
  if (payload) {
    request.auth = payload;
  }
});

app.get('/health', async () => ({ ok: true }));

app.register(authRoutes, { prefix: '/auth' });
app.register(turmaRoutes, { prefix: '/turmas' });
app.register(alunoRoutes, { prefix: '/alunos' });
app.register(disciplinaRoutes, { prefix: '/disciplinas' });
app.register(matriculaRoutes, { prefix: '/matriculas' });
app.register(documentoRoutes, { prefix: '/documentos' });
app.register(notaRoutes, { prefix: '/notas' });

createHistoricoWorker();
createPdfGenerationWorker();

const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('API running on http://localhost:3000');
  } catch (err) {
    console.error('Failed to start API:', err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}
