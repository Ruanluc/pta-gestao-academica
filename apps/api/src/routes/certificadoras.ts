import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { autenticar, EQUIPE, exigirPerfil, SO_ADMIN, usuarioLogado } from '../lib/auth';
import { registrarAuditoria } from '../lib/audit';
import { booleano, emailSchema, idParams, textoObrigatorio } from '../lib/validation';

const certificadoraSchema = z.object({
  nome: z.preprocess((valor) => (typeof valor === 'string' ? valor.trim().toUpperCase() : valor), textoObrigatorio(2, 100)),
  email: z.preprocess((valor) => (valor === '' ? null : valor), emailSchema.nullable().optional()),
  ativa: booleano.default(true),
});

/** Certificadoras (ex.: INOVE, USINA): a equipe consulta ao montar os lotes; só o administrador cadastra. */
export const certificadoraRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', autenticar(EQUIPE));

  app.get('/', async () =>
    prisma.certificadora.findMany({ orderBy: { nome: 'asc' }, include: { _count: { select: { lotes: true, usuarios: true } } } }),
  );

  app.post('/', { preHandler: exigirPerfil(SO_ADMIN) }, async (request, reply) => {
    const dados = certificadoraSchema.parse(request.body ?? {});
    const certificadora = await prisma.certificadora.create({ data: dados });
    await registrarAuditoria({ usuarioId: usuarioLogado(request).id, acao: 'CRIAR', entidade: 'Certificadora', entidadeId: certificadora.id, detalhes: dados });
    return reply.code(201).send(certificadora);
  });

  app.put('/:id', { preHandler: exigirPerfil(SO_ADMIN) }, async (request) => {
    const { id } = idParams.parse(request.params);
    const dados = certificadoraSchema.parse(request.body ?? {});
    const certificadora = await prisma.certificadora.update({ where: { id }, data: dados });
    await registrarAuditoria({ usuarioId: usuarioLogado(request).id, acao: 'ATUALIZAR', entidade: 'Certificadora', entidadeId: id, detalhes: dados });
    return certificadora;
  });
};
