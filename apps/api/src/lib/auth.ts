import { FastifyReply, FastifyRequest } from 'fastify';
import { Role } from '@prisma/client';
import jwt from 'jsonwebtoken';

export type AuthPayload = {
  id: string;
  role: Role;
  iat?: number;
  exp?: number;
};

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthPayload;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const createToken = (payload: AuthPayload, request?: FastifyRequest) => {
  if (request?.server?.jwt?.sign) {
    return request.server.jwt.sign(payload, { expiresIn: '8h' });
  }

  return jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '8h' });
};

export const verifyToken = (token: string, request?: FastifyRequest): AuthPayload => {
  if (request?.server?.jwt?.verify) {
    const decoded = request.server.jwt.verify<AuthPayload>(token);

    if (!decoded.id || !decoded.role) {
      throw new Error('Token inválido');
    }

    return decoded;
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as AuthPayload;

  if (!decoded.id || !decoded.role) {
    throw new Error('Token inválido');
  }

  return decoded;
};

export const hasRequiredRole = (userRole: string, allowedRoles: Role[]) =>
  allowedRoles.includes(userRole as Role);

export const getAuthPayload = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthPayload | null> => {
  const authorization = request.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    await reply.code(401).send({ message: 'Token de acesso ausente' });
    return null;
  }

  try {
    return verifyToken(authorization.replace('Bearer ', '').trim(), request);
  } catch {
    await reply.code(401).send({ message: 'Token inválido ou expirado' });
    return null;
  }
};

export const requireRole = (allowedRoles: Role[]) => async (request: FastifyRequest, reply: FastifyReply) => {
  const payload = await getAuthPayload(request, reply);
  if (!payload) return;

  if (!hasRequiredRole(payload.role, allowedRoles)) {
    await reply.code(403).send({ message: 'Acesso negado' });
    return;
  }

  request.auth = payload;
};
