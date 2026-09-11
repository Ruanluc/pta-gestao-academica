import type { FastifyPluginAsync } from 'fastify';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { autenticar, exigirPerfil, SO_ADMIN, usuarioLogado } from '../lib/auth';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { booleano, dataObrigatoria, idParams, textoObrigatorio, textoOpcional } from '../lib/validation';

const turmaSchema = z
  .object({
    nome: textoObrigatorio(2, 200),
    codigo: z.preprocess((valor) => (typeof valor === 'string' ? valor.trim().toUpperCase() : valor), textoOpcional(20)),
    curso: textoOpcional(200),
    resolucaoMec: textoOpcional(200),
    cargaHoraria: z.coerce.number().int().positive().max(10000).default(360),
    dataInicio: dataObrigatoria,
    dataFim: dataObrigatoria,
    ativa: booleano.default(true),
  })
  .refine((turma) => turma.dataFim >= turma.dataInicio, {
    message: 'A data de fim deve ser igual ou posterior à data de início',
    path: ['dataFim'],
  });

export const turmaRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', autenticar());

  app.get('/', async (request) => {
    const { ativa } = z.object({ ativa: booleano.optional() }).parse(request.query);

    return prisma.turma.findMany({
      where: { ativa },
      orderBy: [{ ativa: 'desc' }, { dataInicio: 'desc' }],
      include: { _count: { select: { matriculas: true, disciplinas: true } } },
    });
  });

  app.get('/:id', async (request) => {
    const { id } = idParams.parse(request.params);

    const turma = await prisma.turma.findUnique({
      where: { id },
      include: {
        disciplinas: { orderBy: { ordem: 'asc' } },
        matriculas: {
          orderBy: { aluno: { nome: 'asc' } },
          include: { aluno: { select: { id: true, nome: true, cpf: true, email: true, statusSemaforo: true } } },
        },
      },
    });

    if (!turma) throw new HttpError(404, 'Turma não encontrada');
    return { ...turma, regras: config.regras };
  });

  app.post('/', { preHandler: exigirPerfil(SO_ADMIN) }, async (request, reply) => {
    const dados = turmaSchema.parse(request.body ?? {});
    const turma = await prisma.turma.create({ data: dados });

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'CRIAR',
      entidade: 'Turma',
      entidadeId: turma.id,
      detalhes: { nome: turma.nome },
    });

    return reply.code(201).send(turma);
  });

  app.put('/:id', { preHandler: exigirPerfil(SO_ADMIN) }, async (request) => {
    const { id } = idParams.parse(request.params);
    const dados = turmaSchema.parse(request.body ?? {});
    const turma = await prisma.turma.update({ where: { id }, data: dados });

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'ATUALIZAR',
      entidade: 'Turma',
      entidadeId: id,
      detalhes: dados,
    });

    return turma;
  });

  /** Abre/encerra as inscrições online e, se pedido, troca o link (o antigo deixa de funcionar). */
  app.post('/:id/inscricao', { preHandler: exigirPerfil(SO_ADMIN) }, async (request) => {
    const { id } = idParams.parse(request.params);
    const { abertas, gerarNovoLink } = z
      .object({ abertas: z.boolean(), gerarNovoLink: z.boolean().default(false) })
      .parse(request.body ?? {});

    const atual = await prisma.turma.findUnique({ where: { id }, select: { codigoInscricao: true } });
    if (!atual) throw new HttpError(404, 'Turma não encontrada');

    const codigoInscricao = !atual.codigoInscricao || gerarNovoLink ? randomBytes(12).toString('base64url') : atual.codigoInscricao;

    const turma = await prisma.turma.update({
      where: { id },
      data: { inscricoesAbertas: abertas, codigoInscricao },
      select: { id: true, codigoInscricao: true, inscricoesAbertas: true },
    });

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: gerarNovoLink ? 'LINK_INSCRICAO_RENOVADO' : abertas ? 'INSCRICOES_ABERTAS' : 'INSCRICOES_ENCERRADAS',
      entidade: 'Turma',
      entidadeId: id,
    });

    return turma;
  });

  app.delete('/:id', { preHandler: exigirPerfil(SO_ADMIN) }, async (request, reply) => {
    const { id } = idParams.parse(request.params);

    const matriculas = await prisma.matricula.count({ where: { turmaId: id } });
    if (matriculas > 0) {
      throw new HttpError(409, `A turma possui ${matriculas} aluno(s) matriculado(s). Remova as matrículas antes de excluí-la.`);
    }

    const turma = await prisma.turma.delete({ where: { id } });

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'EXCLUIR',
      entidade: 'Turma',
      entidadeId: id,
      detalhes: { nome: turma.nome },
    });

    return reply.code(204).send();
  });
};
