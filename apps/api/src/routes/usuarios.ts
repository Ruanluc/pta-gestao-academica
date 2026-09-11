import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { autenticar, SO_ADMIN, usuarioLogado } from '../lib/auth';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { emailSchema, idParams, idSchema, textoObrigatorio } from '../lib/validation';
import { senhaSchema } from './auth';

const SELECAO_USUARIO = {
  id: true,
  nome: true,
  email: true,
  role: true,
  ativo: true,
  criadoEm: true,
  certificadoraId: true,
  certificadora: { select: { id: true, nome: true } },
} as const;

const MENSAGEM_CERTIFICADORA = 'Escolha a certificadora deste usuário';
const certificadoraIdSchema = z.preprocess((valor) => (valor === '' ? null : valor), idSchema.nullable().optional());

const criarSchema = z
  .object({
    nome: textoObrigatorio(2, 150),
    email: emailSchema,
    senha: senhaSchema,
    role: z.nativeEnum(Role).default('SECRETARIA'),
    // Perfil CERTIFICADORA: de qual certificadora (só verá os lotes dela)
    certificadoraId: certificadoraIdSchema,
  })
  .refine((dados) => dados.role !== 'CERTIFICADORA' || dados.certificadoraId, { message: MENSAGEM_CERTIFICADORA, path: ['certificadoraId'] });

const atualizarSchema = z.object({
  nome: textoObrigatorio(2, 150).optional(),
  email: emailSchema.optional(),
  senha: z.preprocess((valor) => (valor === '' ? undefined : valor), senhaSchema.optional()),
  role: z.nativeEnum(Role).optional(),
  ativo: z.boolean().optional(),
  certificadoraId: certificadoraIdSchema,
});

export const usuarioRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', autenticar(SO_ADMIN));

  app.get('/', async () => prisma.usuario.findMany({ select: SELECAO_USUARIO, orderBy: { nome: 'asc' } }));

  app.post('/', async (request, reply) => {
    const dados = criarSchema.parse(request.body ?? {});

    const usuario = await prisma.usuario.create({
      data: {
        nome: dados.nome,
        email: dados.email,
        role: dados.role,
        certificadoraId: dados.role === 'CERTIFICADORA' ? dados.certificadoraId : null,
        senhaHash: await bcrypt.hash(dados.senha, 10),
      },
      select: SELECAO_USUARIO,
    });

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'CRIAR',
      entidade: 'Usuario',
      entidadeId: usuario.id,
      detalhes: { email: usuario.email, role: usuario.role },
    });

    return reply.code(201).send(usuario);
  });

  app.put('/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const dados = atualizarSchema.parse(request.body ?? {});
    const logado = usuarioLogado(request);

    if (id === logado.id && (dados.ativo === false || (dados.role && dados.role !== 'ADMIN'))) {
      throw new HttpError(400, 'Você não pode desativar a sua própria conta nem remover o seu perfil de administrador');
    }

    const atual = await prisma.usuario.findUnique({ where: { id }, select: { role: true, certificadoraId: true } });
    if (!atual) throw new HttpError(404, 'Usuário não encontrado');
    const roleFinal = dados.role ?? atual.role;
    const certificadoraFinal = roleFinal === 'CERTIFICADORA' ? (dados.certificadoraId !== undefined ? dados.certificadoraId : atual.certificadoraId) : null;
    if (roleFinal === 'CERTIFICADORA' && !certificadoraFinal) throw new HttpError(400, MENSAGEM_CERTIFICADORA);

    const usuario = await prisma.usuario.update({
      where: { id },
      data: {
        nome: dados.nome,
        email: dados.email,
        role: dados.role,
        certificadoraId: certificadoraFinal,
        ativo: dados.ativo,
        ...(dados.senha ? { senhaHash: await bcrypt.hash(dados.senha, 10) } : {}),
      },
      select: SELECAO_USUARIO,
    });

    await registrarAuditoria({
      usuarioId: logado.id,
      acao: 'ATUALIZAR',
      entidade: 'Usuario',
      entidadeId: id,
      detalhes: { ...dados, senha: dados.senha ? '(alterada)' : undefined },
    });

    return usuario;
  });
};
