import jwt from 'jsonwebtoken';
import type { FastifyRequest } from 'fastify';
import { config } from '../config';
import { prisma } from './prisma';
import { HttpError } from './errors';
import { gerarToken, hashToken } from './magicLink';
import { emailHabilitado, enviarEmail } from './mailer';

// Audience própria: a sessão do aluno não é aceita nas rotas da equipe e vice-versa
const AUDIENCIA_PORTAL = 'portal-aluno';

declare module 'fastify' {
  interface FastifyRequest {
    aluno?: { id: string };
  }
}

export const linkPortal = (token: string) => `${config.webUrl}/portal/acesso?token=${encodeURIComponent(token)}`;

/** Gera um novo link pessoal de acesso ao portal. Guarda só o hash e invalida o link anterior. */
export const gerarLinkAcessoAluno = async (alunoId: string) => {
  const token = gerarToken();
  const expiraEm = new Date(Date.now() + config.portalAluno.diasValidadeLink * 24 * 60 * 60 * 1000);

  await prisma.aluno.update({
    where: { id: alunoId },
    data: { acessoTokenHash: hashToken(token), acessoExpiraEm: expiraEm },
  });

  return { link: linkPortal(token), expiraEm };
};

/** Envia o link por e-mail. Retorna se foi realmente enviado (false quando não há SMTP). */
export const enviarLinkAcessoPorEmail = async (aluno: { nome: string; email: string }, link: string, expiraEm: Date) => {
  const validade = expiraEm.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  await enviarEmail({
    para: aluno.email,
    assunto: 'Seu acesso ao portal do aluno - PTA',
    texto: `Olá, ${aluno.nome}!\n\nUse o link abaixo para acessar o portal do aluno, enviar seus documentos e acompanhar sua situação:\n${link}\n\nO link é pessoal e vale até ${validade}. Não o compartilhe.`,
    html: `<p>Olá, ${aluno.nome}!</p><p><a href="${link}">Clique aqui para acessar o portal do aluno</a>, enviar seus documentos e acompanhar sua situação.</p><p>O link é pessoal e vale até ${validade}. Não o compartilhe.</p>`,
  });

  return emailHabilitado();
};

/** Confere o link recebido pelo aluno. Pode ser usado várias vezes até expirar ou ser substituído. */
export const validarLinkAcesso = async (token: string) => {
  const aluno = await prisma.aluno.findUnique({
    where: { acessoTokenHash: hashToken(token) },
    select: { id: true, nome: true, acessoExpiraEm: true },
  });
  if (!aluno || !aluno.acessoExpiraEm || aluno.acessoExpiraEm <= new Date()) return null;
  return aluno;
};

export const criarSessaoAluno = (alunoId: string) =>
  jwt.sign({ alunoId, tipo: 'aluno' }, config.jwtSecret, {
    audience: AUDIENCIA_PORTAL,
    expiresIn: `${config.portalAluno.horasSessao}h` as jwt.SignOptions['expiresIn'],
  });

export const verificarSessaoAluno = (token: string) => {
  const decoded = jwt.verify(token, config.jwtSecret, { audience: AUDIENCIA_PORTAL });
  if (typeof decoded !== 'object' || decoded.tipo !== 'aluno' || typeof decoded.alunoId !== 'string') {
    throw new Error('Sessão inválida');
  }
  return decoded.alunoId as string;
};

/** Hook das rotas do portal: exige a sessão do aluno. */
export const autenticarAluno = async (request: FastifyRequest) => {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Acesso ao portal ausente');

  let alunoId: string;
  try {
    alunoId = verificarSessaoAluno(authorization.slice('Bearer '.length).trim());
  } catch {
    throw new HttpError(401, 'Sua sessão no portal expirou. Peça um novo link de acesso.');
  }

  const aluno = await prisma.aluno.findUnique({ where: { id: alunoId }, select: { id: true } });
  if (!aluno) throw new HttpError(401, 'Cadastro não encontrado');

  request.aluno = { id: aluno.id };
};

export const alunoDoPortal = (request: FastifyRequest) => {
  if (!request.aluno) throw new HttpError(401, 'Acesso ao portal ausente');
  return request.aluno;
};
