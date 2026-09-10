import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MultipartFields } from '@fastify/multipart';
import { TipoDocumento } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { contentDisposition } from '../lib/http';
import { abrirArquivo, removerArquivo, salvarArquivo } from '../lib/storage';
import { idSchema } from '../lib/validation';
import { pastaDriveEnvioAutomatico, sincronizarAluno } from './academico';

const TIPOS_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

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

const valorCampo = (campos: MultipartFields, nome: string) => {
  const campo = campos[nome];
  const unico = Array.isArray(campo) ? campo[0] : campo;
  return unico && unico.type === 'field' ? String(unico.value) : undefined;
};

/**
 * Recebe o upload multipart de um documento.
 * Equipe: o aluno vem do campo "alunoId". Portal: o aluno é o da sessão (alunoIdFixo).
 * Os campos de texto ("alunoId", "tipo") devem vir ANTES do campo "arquivo" no FormData.
 */
export const receberDocumento = async (
  request: FastifyRequest,
  { alunoIdFixo, enviadoPorId }: { alunoIdFixo?: string; enviadoPorId: string | null },
) => {
  const arquivo = await request.file();
  if (!arquivo) throw new HttpError(400, 'Envie um arquivo');

  let dados: { alunoId: string; tipo: TipoDocumento };
  try {
    dados = z
      .object({ alunoId: idSchema, tipo: z.nativeEnum(TipoDocumento) })
      .parse({ alunoId: alunoIdFixo ?? valorCampo(arquivo.fields, 'alunoId'), tipo: valorCampo(arquivo.fields, 'tipo') });

    if (!TIPOS_PERMITIDOS.has(arquivo.mimetype)) {
      throw new HttpError(415, 'Formato não permitido. Envie PDF, JPG, PNG ou WEBP.');
    }

    const aluno = await prisma.aluno.findUnique({ where: { id: dados.alunoId }, select: { id: true } });
    if (!aluno) throw new HttpError(404, 'Aluno não encontrado');
  } catch (erro) {
    arquivo.file.resume(); // descarta o restante do upload
    throw erro;
  }

  const pastaDriveId = await pastaDriveEnvioAutomatico(dados.alunoId);
  const salvo = await salvarArquivo({
    stream: arquivo.file,
    nomeArquivo: arquivo.filename || 'documento',
    mimeType: arquivo.mimetype,
    subpasta: `alunos/${dados.alunoId}`,
    pastaDriveId,
  });

  if (arquivo.file.truncated) {
    await removerArquivo(salvo.ref);
    throw new HttpError(413, 'Arquivo acima do tamanho máximo permitido');
  }

  const documento = await prisma.documento.create({
    data: {
      alunoId: dados.alunoId,
      tipo: dados.tipo,
      nomeArquivo: arquivo.filename || 'documento',
      mimeType: arquivo.mimetype,
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
