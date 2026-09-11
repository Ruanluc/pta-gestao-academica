import type { FastifyPluginAsync } from 'fastify';
import { StatusDocumento, TipoDocumento } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { autenticar, EQUIPE, usuarioLogado } from '../lib/auth';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { removerArquivo } from '../lib/storage';
import { idParams, idSchema, textoOpcional } from '../lib/validation';
import { sincronizarAluno } from '../services/academico';
import { receberDocumento, responderArquivo, SELECAO_DOCUMENTO } from '../services/documentos';
import { avisarDocumentacaoCompleta, avisarDocumentoRejeitado } from '../services/notificacoes';
import { documentacaoCompleta } from '../lib/semaforo';

export const documentoRoutes: FastifyPluginAsync = async (app) => {
  // Documentos pessoais: apenas administração e secretaria
  app.addHook('onRequest', autenticar(EQUIPE));

  app.get('/', async (request) => {
    const { status, alunoId, tipo } = z
      .object({
        status: z.nativeEnum(StatusDocumento).optional(),
        alunoId: idSchema.optional(),
        tipo: z.nativeEnum(TipoDocumento).optional(),
      })
      .parse(request.query);

    return prisma.documento.findMany({
      where: { status, alunoId, tipo },
      select: SELECAO_DOCUMENTO,
      orderBy: { criadoEm: 'desc' },
      take: 300,
    });
  });

  /** Upload feito pela equipe: campos "alunoId" e "tipo" antes do campo "arquivo". */
  app.post('/upload', async (request, reply) => {
    const documento = await receberDocumento(request, { enviadoPorId: usuarioLogado(request).id });
    return reply.code(201).send(documento);
  });

  app.get('/:id/arquivo', async (request, reply) => {
    const { id } = idParams.parse(request.params);

    const documento = await prisma.documento.findUnique({ where: { id } });
    if (!documento) throw new HttpError(404, 'Documento não encontrado');

    return responderArquivo(reply, documento);
  });

  app.patch('/:id/status', async (request) => {
    const { id } = idParams.parse(request.params);
    const { status, motivoRejeicao } = z
      .object({ status: z.nativeEnum(StatusDocumento), motivoRejeicao: textoOpcional(500) })
      .superRefine((dados, ctx) => {
        if (dados.status === 'REJEITADO' && !dados.motivoRejeicao) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['motivoRejeicao'], message: 'Informe o motivo da rejeição' });
        }
      })
      .parse(request.body ?? {});

    const logado = usuarioLogado(request);
    const analisado = status !== 'PENDENTE';

    // Para avisar o aluno só na primeira vez que a documentação fica completa
    const antes = await prisma.documento.findUnique({
      where: { id },
      select: { aluno: { select: { condicaoGraduacao: true, documentos: { select: { tipo: true, status: true } } } } },
    });
    const completaAntes = antes ? documentacaoCompleta(antes.aluno.condicaoGraduacao, antes.aluno.documentos) : false;

    const documento = await prisma.documento.update({
      where: { id },
      data: {
        status,
        motivoRejeicao: status === 'REJEITADO' ? motivoRejeicao : null,
        analisadoPorId: analisado ? logado.id : null,
        analisadoEm: analisado ? new Date() : null,
      },
      select: SELECAO_DOCUMENTO,
    });

    await registrarAuditoria({
      usuarioId: logado.id,
      acao: `DOCUMENTO_${status}`,
      entidade: 'Documento',
      entidadeId: id,
      detalhes: { alunoId: documento.alunoId, tipo: documento.tipo, motivoRejeicao: documento.motivoRejeicao },
    });

    await sincronizarAluno(documento.alunoId);

    if (status === 'REJEITADO') {
      await avisarDocumentoRejeitado(documento.id);
    } else if (status === 'APROVADO' && !completaAntes) {
      const depois = await prisma.aluno.findUnique({
        where: { id: documento.alunoId },
        select: { condicaoGraduacao: true, documentos: { select: { tipo: true, status: true } } },
      });
      if (depois && documentacaoCompleta(depois.condicaoGraduacao, depois.documentos)) await avisarDocumentacaoCompleta(documento.alunoId);
    }

    return documento;
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const documento = await prisma.documento.delete({ where: { id } });
    await removerArquivo(documento.arquivoRef);

    await registrarAuditoria({
      usuarioId: usuarioLogado(request).id,
      acao: 'EXCLUIR',
      entidade: 'Documento',
      entidadeId: id,
      detalhes: { alunoId: documento.alunoId, tipo: documento.tipo, nomeArquivo: documento.nomeArquivo },
    });

    await sincronizarAluno(documento.alunoId);
    return reply.code(204).send();
  });
};
