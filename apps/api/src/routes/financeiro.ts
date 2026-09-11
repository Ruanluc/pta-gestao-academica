import type { FastifyPluginAsync } from 'fastify';
import { Prisma, SituacaoMatricula } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { autenticar, COM_FINANCEIRO, usuarioLogado } from '../lib/auth';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { dataOpcional, idParams, idSchema, somenteDigitos, textoOpcional } from '../lib/validation';

const POR_PAGINA = 50;

const SELECAO_MATRICULA = {
  id: true,
  numeroMatricula: true,
  situacao: true,
  situacaoAtualizadaEm: true,
  dataInclusao: true,
  dataCancelamento: true,
  aluno: { select: { id: true, nome: true, cpf: true, email: true, telefone: true } },
  turma: { select: { id: true, nome: true, codigo: true } },
} as const;

/**
 * Situação das matrículas (Em dia, Atrasado, Cancelado...), mantida à mão pelo financeiro porque a Eduzz
 * não oferece API. O perfil FINANCEIRO só acessa estas rotas.
 */
export const financeiroRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', autenticar(COM_FINANCEIRO));

  app.get('/turmas', async () =>
    prisma.turma.findMany({ orderBy: [{ ativa: 'desc' }, { dataInicio: 'desc' }], select: { id: true, nome: true, codigo: true, ativa: true } }),
  );

  app.get('/matriculas', async (request) => {
    const { busca, turmaId, situacao, pagina } = z
      .object({
        busca: textoOpcional(100),
        turmaId: idSchema.optional(),
        situacao: z.nativeEnum(SituacaoMatricula).optional(),
        pagina: z.coerce.number().int().min(1).default(1),
      })
      .parse(request.query);

    const digitos = busca ? somenteDigitos(busca) : '';
    const filtroBusca: Prisma.MatriculaWhereInput = busca
      ? {
          OR: [
            { aluno: { nome: { contains: busca, mode: 'insensitive' } } },
            { aluno: { email: { contains: busca, mode: 'insensitive' } } },
            ...(digitos ? [{ aluno: { cpf: { contains: digitos } } }, { numeroMatricula: { contains: digitos } }] : []),
          ],
        }
      : {};
    const where: Prisma.MatriculaWhereInput = { turmaId, situacao, ...filtroBusca };

    const [total, matriculas, contagem] = await Promise.all([
      prisma.matricula.count({ where }),
      prisma.matricula.findMany({
        where,
        orderBy: [{ aluno: { nome: 'asc' } }, { dataInclusao: 'desc' }],
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: SELECAO_MATRICULA,
      }),
      // Totais por situação com os mesmos filtros, menos o de situação
      prisma.matricula.groupBy({ by: ['situacao'], where: { turmaId, ...filtroBusca }, _count: { _all: true } }),
    ]);

    return {
      total,
      pagina,
      porPagina: POR_PAGINA,
      matriculas,
      porSituacao: Object.fromEntries(contagem.map((item) => [item.situacao, item._count._all])),
    };
  });

  app.patch('/matriculas/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { situacao, dataCancelamento } = z
      .object({ situacao: z.nativeEnum(SituacaoMatricula), dataCancelamento: dataOpcional })
      .parse(request.body ?? {});

    const atual = await prisma.matricula.findUnique({ where: { id }, select: { situacao: true, dataCancelamento: true } });
    if (!atual) throw new HttpError(404, 'Matrícula não encontrada');

    const matricula = await prisma.matricula.update({
      where: { id },
      data: {
        situacao,
        situacaoAtualizadaEm: new Date(),
        dataCancelamento: situacao === 'CANCELADO' ? dataCancelamento ?? atual.dataCancelamento ?? new Date() : null,
      },
      select: SELECAO_MATRICULA,
    });

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'SITUACAO_MATRICULA',
      entidade: 'Matricula',
      entidadeId: id,
      detalhes: { de: atual.situacao, para: situacao },
    });

    return matricula;
  });
};
