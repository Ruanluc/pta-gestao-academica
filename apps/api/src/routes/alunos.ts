import { FastifyPluginAsync } from 'fastify';
import { inMemoryStore, prisma } from '../main';
import { getAuthPayload, hasRequiredRole } from '../lib/auth';

const normalizeAlunoPayload = (data: any) => {
  const payload = { ...data };
  const birthDate = payload.birthDate ?? payload.dataNascimento;
  const name = payload.name ?? payload.nome ?? 'Aluno';
  const phone = payload.phone ?? payload.telefone;
  const googleDriveFolderId = payload.googleDriveFolderId ?? payload.driveFolderId;

  return {
    name,
    cpf: payload.cpf,
    email: payload.email ?? '',
    phone: phone ?? null,
    birthDate: birthDate ? new Date(birthDate) : null,
    googleDriveFolderId: googleDriveFolderId ?? null,
    documentStatus: payload.documentStatus ?? 'VERDE_TUDO_CERTO',
  };
};

export const alunoRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    const payload = await getAuthPayload(request, reply);
    if (!payload) return;
    if (!hasRequiredRole(payload.role, ['ADMIN', 'SECRETARIA', 'PROFESSOR'])) {
      return reply.code(403).send({ message: 'Acesso negado' });
    }

    try {
      return await prisma.student.findMany({ orderBy: { name: 'asc' } });
    } catch {
      return inMemoryStore.alunos;
    }
  });

  app.post('/', async (request, reply) => {
    const payload = await getAuthPayload(request, reply);
    if (!payload) return;
    if (!hasRequiredRole(payload.role, ['ADMIN', 'SECRETARIA'])) {
      return reply.code(403).send({ message: 'Acesso negado' });
    }

    try {
      const data = normalizeAlunoPayload(request.body as any);
      const aluno = await prisma.student.create({ data });
      return reply.code(201).send(aluno);
    } catch {
      const fallback = {
        id: `aluno-${Date.now()}`,
        ...normalizeAlunoPayload(request.body as any),
      };
      inMemoryStore.alunos.unshift(fallback);
      return reply.code(201).send(fallback);
    }
  });
};
