import type { Readable } from 'stream';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { gerarPacoteLote } from '../services/pacoteLote';
import { z } from 'zod';
import { registrarAuditoria } from '../lib/audit';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { autenticar, COM_LOTES, EQUIPE, exigirPerfil, usuarioLogado } from '../lib/auth';
import { HttpError } from '../lib/errors';
import { driveHabilitado, linkPastaDrive } from '../lib/googleDrive';
import { contentDisposition, slugificar } from '../lib/http';
import { emailHabilitado } from '../lib/mailer';
import { abrirArquivo } from '../lib/storage';
import { dataObrigatoria, dataOpcional, idParams, idSchema, textoOpcional } from '../lib/validation';
import {
  adicionarItens,
  anexarCertificado,
  criarLote,
  enviarLote,
  excluirLote,
  gerarPastaDriveLote,
  matriculasAptas,
  reenviarCertificadoPorEmail,
  registrarCertificado,
  registrarEntregaManual,
  removerItem,
} from '../services/lotes';

const itemParams = z.object({ id: idSchema, itemId: idSchema });
const referenciaSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Referência inválida (use AAAA-MM)');

const ehCertificadora = (request: FastifyRequest) => usuarioLogado(request).role === 'CERTIFICADORA';

export const loteRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', autenticar(COM_LOTES));
  const soEquipe = { preHandler: exigirPerfil(EQUIPE) };

  // A certificadora só enxerga os lotes já enviados para ela
  const filtroVisivel = async (request: FastifyRequest): Promise<Prisma.LoteCertificacaoWhereInput> => {
    if (!ehCertificadora(request)) return {};
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioLogado(request).id }, select: { certificadoraId: true } });
    return usuario?.certificadoraId ? { status: { not: 'ABERTO' }, certificadoraId: usuario.certificadoraId } : { id: { in: [] } };
  };

  /** Nas ações da certificadora, o lote precisa ser dela. */
  const garantirLoteVisivel = async (request: FastifyRequest, loteId: string) => {
    if (!ehCertificadora(request)) return;
    const lote = await prisma.loteCertificacao.findFirst({ where: { id: loteId, ...(await filtroVisivel(request)) }, select: { id: true } });
    if (!lote) throw new HttpError(404, 'Lote não encontrado');
  };

  app.get('/aptos', soEquipe, async () => matriculasAptas());

  app.get('/', async (request) => {
    const lotes = await prisma.loteCertificacao.findMany({
      where: await filtroVisivel(request),
      orderBy: [{ enviadoEm: { sort: 'desc', nulls: 'first' } }, { criadoEm: 'desc' }],
      include: { itens: { select: { certificadoEmitidoEm: true } }, certificadora: { select: { id: true, nome: true } } },
    });
    return lotes.map(({ itens, ...lote }) => ({
      ...lote,
      totalAlunos: itens.length,
      certificadosEmitidos: itens.filter((item) => item.certificadoEmitidoEm).length,
    }));
  });

  app.get('/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const certificadora = ehCertificadora(request);

    const lote = await prisma.loteCertificacao.findFirst({
      where: { id, ...(await filtroVisivel(request)) },
      include: {
        criadoPor: { select: { nome: true } },
        certificadora: { select: { id: true, nome: true } },
        itens: {
          orderBy: { matricula: { aluno: { nome: 'asc' } } },
          include: {
            registradoPor: { select: { nome: true } },
            matricula: {
              select: {
                id: true,
                historicoGeradoEm: true,
                aluno: { select: { id: true, nome: true, cpf: true, email: !certificadora } },
                turma: { select: { id: true, nome: true } },
              },
            },
          },
        },
      },
    });
    if (!lote) throw new HttpError(404, 'Lote não encontrado');

    return {
      ...lote,
      // O caminho interno do arquivo não sai da API
      itens: lote.itens.map(({ certificadoRef, ...item }) => ({ ...item, temCertificado: Boolean(certificadoRef) })),
      pastaLink: lote.driveFolderId ? linkPastaDrive(lote.driveFolderId) : null,
      driveConfigurado: driveHabilitado(),
      emailConfigurado: emailHabilitado(),
      prazoDias: config.certificacao.prazoDias,
    };
  });

  app.post('/', soEquipe, async (request, reply) => {
    const dados = z
      .object({
        referencia: referenciaSchema.optional(),
        certificadoraId: idSchema,
        matriculaIds: z.array(idSchema).min(1, 'Selecione ao menos um aluno').max(500),
      })
      .parse(request.body ?? {});
    return reply.code(201).send(await criarLote(dados, usuarioLogado(request).id));
  });

  app.delete('/:id', soEquipe, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await excluirLote(id, usuarioLogado(request).id);
    return reply.code(204).send();
  });

  app.post('/:id/itens', soEquipe, async (request) => {
    const { id } = idParams.parse(request.params);
    const { matriculaIds } = z.object({ matriculaIds: z.array(idSchema).min(1).max(500) }).parse(request.body ?? {});
    await adicionarItens(id, matriculaIds, usuarioLogado(request).id);
    return { ok: true };
  });

  app.delete('/:id/itens/:itemId', soEquipe, async (request, reply) => {
    const { id, itemId } = itemParams.parse(request.params);
    await removerItem(id, itemId, usuarioLogado(request).id);
    return reply.code(204).send();
  });

  app.post('/:id/enviar', soEquipe, async (request) => {
    const { id } = idParams.parse(request.params);
    return enviarLote(id, usuarioLogado(request).id);
  });

  app.post('/:id/pasta-drive', soEquipe, async (request) => {
    const { id } = idParams.parse(request.params);
    return gerarPastaDriveLote(id, usuarioLogado(request).id);
  });

  /** Certificadora (ou equipe) registra o certificado de um aluno; sem data = desfaz o registro. */
  app.patch('/:id/itens/:itemId/certificado', async (request) => {
    const { id, itemId } = itemParams.parse(request.params);
    await garantirLoteVisivel(request, id);
    const { numero, emitidoEm } = z
      .object({ numero: textoOpcional(60), emitidoEm: dataOpcional })
      .parse(request.body ?? {});
    await registrarCertificado(id, itemId, { numero, emitidoEm: emitidoEm ?? null }, usuarioLogado(request).id);
    return { ok: true };
  });

  /** Marca como emitidos todos os certificados ainda pendentes do lote. */
  app.post('/:id/certificados', async (request) => {
    const { id } = idParams.parse(request.params);
    await garantirLoteVisivel(request, id);
    const { emitidoEm } = z.object({ emitidoEm: dataObrigatoria }).parse(request.body ?? {});
    const pendentes = await prisma.itemLote.findMany({ where: { loteId: id, certificadoEmitidoEm: null }, select: { id: true } });
    for (const item of pendentes) {
      await registrarCertificado(id, item.id, { emitidoEm }, usuarioLogado(request).id);
    }
    return { registrados: pendentes.length };
  });

  /** PDF do certificado digital (certificadora ou equipe): vai para a pasta do aluno e segue por e-mail para ele. */
  app.post('/:id/itens/:itemId/certificado-arquivo', async (request) => {
    const { id, itemId } = itemParams.parse(request.params);
    await garantirLoteVisivel(request, id);
    return anexarCertificado(id, itemId, request, usuarioLogado(request).id);
  });

  /** Anotação sobre o aluno no lote (certificadora ou equipe), ex.: "FALTA CPF", "Enviado para a IES". */
  app.patch('/:id/itens/:itemId/observacao', async (request) => {
    const { id, itemId } = itemParams.parse(request.params);
    await garantirLoteVisivel(request, id);
    const { observacao } = z.object({ observacao: textoOpcional(300) }).parse(request.body ?? {});
    const { count } = await prisma.itemLote.updateMany({ where: { id: itemId, loteId: id }, data: { observacao: observacao ?? null } });
    if (!count) throw new HttpError(404, 'Aluno não encontrado neste lote');
    await registrarAuditoria({ usuarioId: usuarioLogado(request).id, acao: 'ANOTACAO_LOTE', entidade: 'LoteCertificacao', entidadeId: id, detalhes: { itemId, observacao } });
    return { ok: true };
  });

  app.get('/:id/itens/:itemId/certificado-arquivo', async (request, reply) => {
    const { id, itemId } = itemParams.parse(request.params);
    const item = await prisma.itemLote.findFirst({
      where: { id: itemId, loteId: id, lote: await filtroVisivel(request) },
      select: { certificadoRef: true, certificadoNomeArquivo: true },
    });
    if (!item?.certificadoRef) throw new HttpError(404, 'Certificado não encontrado');

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', contentDisposition(item.certificadoNomeArquivo ?? 'certificado.pdf'))
      .header('Cache-Control', 'private, no-store')
      .send(await abrirArquivo(item.certificadoRef));
  });

  /** Entrega ao aluno: reenviar por e-mail ou registrar uma entrega feita por fora do sistema. */
  app.post('/:id/itens/:itemId/certificado-entrega', soEquipe, async (request) => {
    const { id, itemId } = itemParams.parse(request.params);
    const { canal, enviadoEm } = z.object({ canal: z.enum(['email', 'manual']), enviadoEm: dataOpcional }).parse(request.body ?? {});
    const usuarioId = usuarioLogado(request).id;

    if (canal === 'email') await reenviarCertificadoPorEmail(id, itemId, usuarioId);
    else await registrarEntregaManual(id, itemId, enviadoEm ?? new Date(), usuarioId);
    return { ok: true };
  });

  /** Pacote (.zip) para a certificadora: uma pasta por aluno com o histórico e os documentos aprovados, e o índice. */
  const enviarPacote = (reply: FastifyReply, pacote: { stream: Readable; nome: string }) =>
    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', contentDisposition(pacote.nome))
      .header('Cache-Control', 'private, no-store')
      .send(pacote.stream);

  app.get('/:id/pacote', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const pacote = await gerarPacoteLote(id, await filtroVisivel(request));
    await registrarAuditoria({ usuarioId: usuarioLogado(request).id, acao: 'DOWNLOAD_PACOTE_LOTE', entidade: 'LoteCertificacao', entidadeId: id, detalhes: { alunos: pacote.alunos } });
    return enviarPacote(reply, pacote);
  });

  app.get('/:id/itens/:itemId/pacote', async (request, reply) => {
    const { id, itemId } = itemParams.parse(request.params);
    const pacote = await gerarPacoteLote(id, await filtroVisivel(request), itemId);
    await registrarAuditoria({ usuarioId: usuarioLogado(request).id, acao: 'DOWNLOAD_PACOTE_ALUNO', entidade: 'LoteCertificacao', entidadeId: id, detalhes: { itemId } });
    return enviarPacote(reply, pacote);
  });

  /** Histórico final de um aluno do lote (para quem não usa a pasta do Drive). */
  app.get('/:id/itens/:itemId/historico', async (request, reply) => {
    const { id, itemId } = itemParams.parse(request.params);
    const item = await prisma.itemLote.findFirst({
      where: { id: itemId, loteId: id, lote: await filtroVisivel(request) },
      include: { matricula: { select: { historicoRef: true, aluno: { select: { nome: true } }, turma: { select: { nome: true } } } } },
    });
    if (!item) throw new HttpError(404, 'Aluno não encontrado neste lote');
    if (!item.matricula.historicoRef) throw new HttpError(404, 'Histórico final não encontrado');

    const stream = await abrirArquivo(item.matricula.historicoRef);
    const nome = `historico-${slugificar(item.matricula.aluno.nome)}-${slugificar(item.matricula.turma.nome)}.pdf`;
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', contentDisposition(nome))
      .header('Cache-Control', 'private, no-store')
      .send(stream);
  });
};
