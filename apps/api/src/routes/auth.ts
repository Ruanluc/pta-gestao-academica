import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '../main';
import { createToken } from '../lib/auth';
import { Role } from '@prisma/client';
import { createAuditLog } from '../lib/audit';
import { consumeMagicLinkToken, createMagicLinkRecord, validateMagicLinkToken } from '../lib/magicLink';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/login', async (request, reply) => {
    const { email, senha } = request.body as { email: string; senha: string };

    if (!email || !senha) {
      return reply.code(400).send({ message: 'E-mail e senha são obrigatórios' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(senha, user.password))) {
      return reply.code(401).send({ message: 'Credenciais inválidas' });
    }

    const token = createToken({ id: user.id, role: user.role as Role }, request as any);
    await createAuditLog(user.id, 'LOGIN', { email });

    return { token, user: { id: user.id, email: user.email, role: user.role } };
  });

  app.post('/register', async (request, reply) => {
    const { email, senha, role } = request.body as { email: string; senha: string; role?: Role };

    if (!email || !senha) {
      return reply.code(400).send({ message: 'E-mail e senha são obrigatórios' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return reply.code(409).send({ message: 'Usuário já existe' });
    }

    const password = await bcrypt.hash(senha, 10);

    const user = await prisma.user.create({
      data: { email, password, role: role || 'SECRETARIA' },
    });

    return reply.code(201).send({ id: user.id, email: user.email, role: user.role });
  });

  app.post('/magic-link', async (request, reply) => {
    const { email } = request.body as { email: string };

    if (!email) {
      return reply.code(400).send({ message: 'E-mail é obrigatório' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.code(404).send({ message: 'Usuário não encontrado' });
    }

    const token = randomBytes(32).toString('hex');
    await createMagicLinkRecord(prisma, user.id, token);

    const magicUrl = `http://localhost:3000/magic?token=${token}`;
    console.log(`[magic-link] Enviando e-mail para ${email}: ${magicUrl}`);

    return reply.code(200).send({
      message: 'Magic link gerado com sucesso',
      magicUrl,
    });
  });

  app.post('/magic-validate', async (request, reply) => {
    const { token } = request.body as { token: string };

    if (!token) {
      return reply.code(400).send({ message: 'Token é obrigatório' });
    }

    const magicLink = await validateMagicLinkToken(prisma, token);
    if (!magicLink) {
      return reply.code(401).send({ message: 'Token inválido ou expirado' });
    }

    await consumeMagicLinkToken(prisma, magicLink.id);

    const user = await prisma.user.findUnique({ where: { id: magicLink.userId } });
    const jwtToken = createToken({ id: magicLink.userId, role: user?.role as Role }, request as any);
    await createAuditLog(magicLink.userId, 'MAGIC_LINK_VALIDADO', { token });

    return reply.code(200).send({
      token: jwtToken,
      user: { id: magicLink.userId },
    });
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const payload = request.auth;
    if (!payload) return;

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) {
      return reply.code(404).send({ message: 'Usuário não encontrado' });
    }

    return { id: user.id, role: user.role, email: user.email };
  });

  app.post('/bootstrap-admin', async (request, reply) => {
    const { email, senha } = request.body as { email: string; senha: string };

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ message: 'Usuário já existe' });
    }

    const password = await bcrypt.hash(senha, 10);
    const user = await prisma.user.create({
      data: { email, password, role: 'ADMIN' },
    });

    return reply.code(201).send({ id: user.id, email: user.email, role: user.role });
  });
};
