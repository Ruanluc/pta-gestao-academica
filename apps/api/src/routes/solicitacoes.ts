import type { FastifyPluginAsync } from 'fastify';
import { StatusSolicitacao } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { autenticar, EQUIPE, usuarioLogado } from '../lib/auth';
import { registrarAuditoria } from '../lib/audit';
import { CAMPOS_EDITAVEIS_PORTAL, valorParaBanco, type AlteracaoEmAnalise, type CampoEditavel } from '../lib/correcaoDados';
import { HttpError } from '../lib/errors';
import { idParams, idSchema, textoObrigatorio } from '../lib/validation';
import { sincronizarAluno } from '../services/academico';
import { avisarSolicitacaoAnalisada } from '../services/notificacoes';

const lerDados = (dados: string) => JSON.parse(dados) as Partial<Record<CampoEditavel, AlteracaoEmAnalise>>;

/** Correções de dados pedidas pelos alunos no portal (campos que já estavam preenchidos). */
export const solicitacaoRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', autenticar(EQUIPE));

  app.get('/', async (request) => {
    const { status, alunoId } = z
      .object({ status: z.nativeEnum(StatusSolicitacao).default('PENDENTE'), alunoId: idSchema.optional() })
      .parse(request.query);

    const solicitacoes = await prisma.solicitacaoAlteracao.findMany({
      where: { status, alunoId },
      orderBy: { criadoEm: 'asc' },
      include: { aluno: { select: { id: true, nome: true, cpf: true } }, analisadoPor: { select: { nome: true } } },
    });
    return solicitacoes.map((solicitacao) => ({ ...solicitacao, dados: lerDados(solicitacao.dados) }));
  });

  const buscarPendente = async (id: string) => {
    const solicitacao = await prisma.solicitacaoAlteracao.findUnique({ where: { id } });
    if (!solicitacao) throw new HttpError(404, 'Solicitação não encontrada');
    if (solicitacao.status !== 'PENDENTE') throw new HttpError(409, 'Esta solicitação já foi analisada');
    return solicitacao;
  };

  app.post('/:id/aprovar', async (request) => {
    const { id } = idParams.parse(request.params);
    const solicitacao = await buscarPendente(id);
    const logado = usuarioLogado(request);

    const dados = lerDados(solicitacao.dados);
    const alteracoes = Object.fromEntries(
      (Object.entries(dados) as Array<[CampoEditavel, AlteracaoEmAnalise]>)
        .filter(([campo]) => CAMPOS_EDITAVEIS_PORTAL.includes(campo))
        .map(([campo, alteracao]) => [campo, valorParaBanco(campo, alteracao.novo)]),
    );

    await prisma.$transaction([
      prisma.aluno.update({ where: { id: solicitacao.alunoId }, data: alteracoes }),
      prisma.solicitacaoAlteracao.update({
        where: { id },
        data: { status: 'APROVADA', analisadoPorId: logado.id, analisadoEm: new Date() },
      }),
    ]);

    await registrarAuditoria({
      usuarioId: logado.id,
      acao: 'CORRECAO_APROVADA',
      entidade: 'Aluno',
      entidadeId: solicitacao.alunoId,
      detalhes: dados,
    });

    await sincronizarAluno(solicitacao.alunoId);
    await avisarSolicitacaoAnalisada(id);
    return { ok: true };
  });

  app.post('/:id/recusar', async (request) => {
    const { id } = idParams.parse(request.params);
    const { motivo } = z.object({ motivo: textoObrigatorio(3, 500) }).parse(request.body ?? {});
    const solicitacao = await buscarPendente(id);
    const logado = usuarioLogado(request);

    await prisma.solicitacaoAlteracao.update({
      where: { id },
      data: { status: 'RECUSADA', motivoRecusa: motivo, analisadoPorId: logado.id, analisadoEm: new Date() },
    });

    await registrarAuditoria({
      usuarioId: logado.id,
      acao: 'CORRECAO_RECUSADA',
      entidade: 'Aluno',
      entidadeId: solicitacao.alunoId,
      detalhes: { motivo },
    });

    await avisarSolicitacaoAnalisada(id);
    return { ok: true };
  });
};
