import { Readable } from 'stream';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { TipoDocumento } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { contentDisposition } from '../lib/http';
import { montarPdfDocumento, pareceUmPdf, TIPOS_ACEITOS, type ArquivoRecebido } from '../lib/pdfDocumentos';
import { ROTULOS_DOCUMENTO } from '../lib/semaforo';
import { abrirArquivo, salvarArquivo } from '../lib/storage';
import { idSchema } from '../lib/validation';
import { pastaDriveEnvioAutomatico, sincronizarAluno } from './academico';

/** Arquivos por envio (ex.: frente e verso, várias páginas de um histórico). */
export const MAXIMO_ARQUIVOS_POR_DOCUMENTO = 10;

export const SELECAO_DOCUMENTO = {
  id: true,
  alunoId: true,
  tipo: true,
  nomeArquivo: true,
  mimeType: true,
  tamanho: true,
  driveLink: true,
  status: true,
  motivoRejeicao: true,
  analisadoEm: true,
  criadoEm: true,
  atualizadoEm: true,
  aluno: { select: { id: true, nome: true, cpf: true } },
  enviadoPor: { select: { nome: true } },
  analisadoPor: { select: { nome: true } },
} as const;

/** Lê os campos e todos os arquivos do FormData (qualquer ordem). */
const lerEnvio = async (request: FastifyRequest) => {
  const campos: Record<string, string> = {};
  const arquivos: ArquivoRecebido[] = [];
  try {
    for await (const parte of request.parts()) {
      if (parte.type === 'field') {
        campos[parte.fieldname] = String(parte.value);
        continue;
      }
      if (!TIPOS_ACEITOS.includes(parte.mimetype)) {
        parte.file.resume();
        throw new HttpError(415, `"${parte.filename}": formato não aceito. Envie PDF, JPG ou PNG.`);
      }
      arquivos.push({ conteudo: await parte.toBuffer(), mimeType: parte.mimetype, nome: parte.filename || 'documento' });
    }
  } catch (erro) {
    const codigo = (erro as { code?: string }).code;
    if (codigo === 'FST_REQ_FILE_TOO_LARGE') throw new HttpError(413, `Cada arquivo pode ter no máximo ${config.uploadMaxMb} MB.`);
    if (codigo === 'FST_FILES_LIMIT') throw new HttpError(413, `Envie no máximo ${MAXIMO_ARQUIVOS_POR_DOCUMENTO} arquivos por documento.`);
    throw erro;
  }
  return { campos, arquivos };
};

/**
 * Recebe um documento (um ou mais arquivos no campo "arquivo").
 * Equipe: o aluno vem do campo "alunoId". Portal: o aluno é o da sessão (alunoIdFixo).
 * Exigência do MEC: o documento é sempre guardado em PDF. Fotos são convertidas e vários arquivos
 * (ex.: frente e verso) viram um único PDF, na ordem enviada. Um PDF sozinho é guardado como veio.
 */
export const receberDocumento = async (
  request: FastifyRequest,
  { alunoIdFixo, enviadoPorId }: { alunoIdFixo?: string; enviadoPorId: string | null },
) => {
  const { campos, arquivos } = await lerEnvio(request);
  if (!arquivos.length) throw new HttpError(400, 'Envie ao menos um arquivo');

  const dados = z
    .object({ alunoId: idSchema, tipo: z.nativeEnum(TipoDocumento) })
    .parse({ alunoId: alunoIdFixo ?? campos.alunoId, tipo: campos.tipo });

  const aluno = await prisma.aluno.findUnique({ where: { id: dados.alunoId }, select: { id: true } });
  if (!aluno) throw new HttpError(404, 'Aluno não encontrado');

  const unicoPdf = arquivos.length === 1 && arquivos[0].mimeType === 'application/pdf';
  if (unicoPdf && !pareceUmPdf(arquivos[0].conteudo)) throw new HttpError(415, `"${arquivos[0].nome}" não é um PDF válido.`);
  const conteudo = unicoPdf ? arquivos[0].conteudo : await montarPdfDocumento(arquivos);
  const nomeArquivo = arquivos.length === 1 ? `${arquivos[0].nome.replace(/\.[^.]+$/, '') || 'documento'}.pdf` : `${ROTULOS_DOCUMENTO[dados.tipo]}.pdf`;

  const salvo = await salvarArquivo({
    stream: Readable.from(conteudo),
    nomeArquivo,
    mimeType: 'application/pdf',
    subpasta: `alunos/${dados.alunoId}`,
    pastaDriveId: await pastaDriveEnvioAutomatico(dados.alunoId),
  });

  const documento = await prisma.documento.create({
    data: {
      alunoId: dados.alunoId,
      tipo: dados.tipo,
      nomeArquivo,
      mimeType: 'application/pdf',
      tamanho: salvo.tamanho,
      arquivoRef: salvo.ref,
      driveLink: salvo.link,
      enviadoPorId,
    },
    select: SELECAO_DOCUMENTO,
  });

  await registrarAuditoria({
    usuarioId: enviadoPorId,
    acao: enviadoPorId ? 'UPLOAD' : 'UPLOAD_PORTAL_ALUNO',
    entidade: 'Documento',
    entidadeId: documento.id,
    detalhes: { alunoId: documento.alunoId, tipo: documento.tipo, nomeArquivo: documento.nomeArquivo, tamanho: documento.tamanho },
  });

  await sincronizarAluno(dados.alunoId);
  return documento;
};

/** Envia o arquivo de um documento na resposta (visualização no navegador). */
export const responderArquivo = async (
  reply: FastifyReply,
  documento: { arquivoRef: string; mimeType: string; nomeArquivo: string },
) => {
  const stream = await abrirArquivo(documento.arquivoRef);
  return reply
    .header('Content-Type', documento.mimeType)
    .header('Content-Disposition', contentDisposition(documento.nomeArquivo))
    .header('Cache-Control', 'private, no-store')
    .send(stream);
};
