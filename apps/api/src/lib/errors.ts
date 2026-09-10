import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly detalhes?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const NOMES_CAMPOS: Record<string, string> = {
  cpf: 'CPF',
  email: 'e-mail',
  cademiId: 'ID da Cademi',
};

const mensagemDuplicidade = (alvo: unknown) => {
  const campos = (Array.isArray(alvo) ? alvo : [alvo]).filter((campo): campo is string => typeof campo === 'string');
  const chave = campos.join(',');

  if (chave.includes('alunoId') && chave.includes('turmaId')) return 'Este aluno já está matriculado nesta turma';
  if (chave.includes('alunoId') && chave.includes('disciplinaId')) return 'Já existe nota para este aluno nesta disciplina';
  if (chave.includes('turmaId') && chave.includes('cademiId')) return 'Já existe outro módulo nesta turma com este ID da Cademi';
  if (campos.length) return `Já existe um registro com este ${campos.map((campo) => NOMES_CAMPOS[campo] ?? campo).join(', ')}`;
  return 'Registro duplicado';
};

export const tratarErro = (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
  if (error instanceof HttpError) {
    return reply.code(error.statusCode).send({ message: error.message, detalhes: error.detalhes });
  }

  if (error instanceof ZodError) {
    return reply.code(400).send({
      message: error.issues[0]?.message ?? 'Dados inválidos',
      erros: error.issues.map((issue) => ({ campo: issue.path.join('.'), mensagem: issue.message })),
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return reply.code(409).send({ message: mensagemDuplicidade(error.meta?.target) });
    if (error.code === 'P2025') return reply.code(404).send({ message: 'Registro não encontrado' });
    if (error.code === 'P2003') return reply.code(400).send({ message: 'Referência inválida: o registro relacionado não existe' });
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    request.log.error(error);
    return reply.code(503).send({ message: 'Banco de dados indisponível' });
  }

  const statusCode = (error as FastifyError).statusCode;
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return reply.code(statusCode).send({ message: error.message });
  }

  request.log.error(error);
  return reply.code(500).send({ message: 'Erro interno no servidor' });
};
