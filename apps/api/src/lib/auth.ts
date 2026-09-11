import jwt from 'jsonwebtoken';
import type { FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';
import { config } from '../config';
import { prisma } from './prisma';
import { HttpError } from './errors';

export type AuthPayload = {
  id: string;
  role: Role;
};

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthPayload;
  }
}

export const TODOS: Role[] = ['ADMIN', 'SECRETARIA', 'PROFESSOR'];
export const EQUIPE: Role[] = ['ADMIN', 'SECRETARIA'];
export const SO_ADMIN: Role[] = ['ADMIN'];
/** Quem acessa os lotes de certificação (a certificadora não acessa mais nada) */
export const COM_LOTES: Role[] = ['ADMIN', 'SECRETARIA', 'CERTIFICADORA'];
/** Rotas da própria conta (dados do usuário, troca de senha) */
export const QUALQUER_PERFIL: Role[] = ['ADMIN', 'SECRETARIA', 'PROFESSOR', 'CERTIFICADORA'];

export const createToken = (payload: AuthPayload) =>
  jwt.sign({ id: payload.id, role: payload.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });

export const verifyToken = (token: string): AuthPayload => {
  const decoded = jwt.verify(token, config.jwtSecret);

  // Sessões do portal do aluno (com audience própria) nunca valem nas rotas da equipe
  if (typeof decoded !== 'object' || decoded.aud !== undefined || typeof decoded.id !== 'string' || typeof decoded.role !== 'string') {
    throw new Error('Token inválido');
  }

  return { id: decoded.id, role: decoded.role as Role };
};

export const hasRequiredRole = (role: string, permitidos: Role[]) => permitidos.includes(role as Role);

/**
 * Hook que valida o token e confere no banco se o usuário continua ativo.
 * O perfil usado é sempre o do banco, então mudanças de perfil valem na hora.
 */
export const autenticar =
  (permitidos: Role[] = TODOS) =>
  async (request: FastifyRequest) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new HttpError(401, 'Token de acesso ausente');
    }

    let payload: AuthPayload;
    try {
      payload = verifyToken(authorization.slice('Bearer '.length).trim());
    } catch {
      throw new HttpError(401, 'Sessão inválida ou expirada');
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.id },
      select: { id: true, role: true, ativo: true },
    });

    if (!usuario || !usuario.ativo) {
      throw new HttpError(401, 'Usuário inativo ou inexistente');
    }

    request.auth = { id: usuario.id, role: usuario.role };

    if (!hasRequiredRole(usuario.role, permitidos)) {
      throw new HttpError(403, 'Acesso negado');
    }
  };

/** Restringe uma rota a perfis específicos (usar depois de `autenticar`). */
export const exigirPerfil = (permitidos: Role[]) => async (request: FastifyRequest) => {
  if (!request.auth) throw new HttpError(401, 'Token de acesso ausente');
  if (!hasRequiredRole(request.auth.role, permitidos)) throw new HttpError(403, 'Acesso negado');
};

export const usuarioLogado = (request: FastifyRequest) => {
  if (!request.auth) throw new HttpError(401, 'Token de acesso ausente');
  return request.auth;
};
