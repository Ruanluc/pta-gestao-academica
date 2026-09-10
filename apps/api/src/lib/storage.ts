import { createReadStream, createWriteStream } from 'fs';
import { mkdir, stat, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { dirname, resolve, sep } from 'path';
import { Transform, type Readable, type TransformCallback } from 'stream';
import { pipeline } from 'stream/promises';
import { config } from '../config';
import { HttpError } from './errors';
import { baixarArquivoDrive, driveHabilitado, enviarArquivoDrive, envioAutomaticoDrive, removerArquivoDrive } from './googleDrive';

/**
 * Armazenamento de arquivos. Cada arquivo é identificado por uma referência:
 *  - "drive:<fileId>" quando enviado ao Google Drive
 *  - "local:<caminho relativo>" quando salvo em STORAGE_DIR
 * Assim, arquivos antigos continuam acessíveis mesmo depois de ativar o Drive.
 */
export type ArquivoSalvo = { ref: string; link: string | null; tamanho: number };

export type EntradaArquivo = {
  stream: Readable;
  nomeArquivo: string;
  mimeType: string;
  /** Subpasta usada no armazenamento local (ex.: "alunos/<id>") */
  subpasta: string;
  /** Pasta de destino no Drive (quando habilitado) */
  pastaDriveId?: string | null;
};

const PREFIXO_DRIVE = 'drive:';
const PREFIXO_LOCAL = 'local:';

export const armazenamentoAtual = () => (envioAutomaticoDrive() ? 'google-drive' : 'local');

const nomeSeguro = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-100) || 'arquivo';

const mensagemErro = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

const criarContador = () => {
  let total = 0;
  const transform = new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      total += chunk.length;
      callback(null, chunk);
    },
  });
  return { transform, total: () => total };
};

const caminhoLocal = (relativo: string) => {
  const raiz = resolve(config.storageDir);
  const absoluto = resolve(raiz, relativo);
  if (!absoluto.startsWith(raiz + sep)) throw new HttpError(400, 'Caminho de arquivo inválido');
  return absoluto;
};

export const salvarArquivo = async ({ stream, nomeArquivo, mimeType, subpasta, pastaDriveId }: EntradaArquivo): Promise<ArquivoSalvo> => {
  const contador = criarContador();

  if (envioAutomaticoDrive()) {
    let erroOrigem: unknown;
    stream.on('error', (erro) => {
      erroOrigem = erro;
      contador.transform.destroy(erro);
    });

    try {
      const enviado = await enviarArquivoDrive({
        stream: stream.pipe(contador.transform),
        nome: nomeArquivo,
        mimeType,
        pastaId: pastaDriveId,
      });
      return { ref: `${PREFIXO_DRIVE}${enviado.id}`, link: enviado.link, tamanho: contador.total() };
    } catch (erro) {
      // Erro do próprio upload (ex.: arquivo acima do limite) tem prioridade sobre o erro do Drive
      if (erroOrigem) throw erroOrigem;
      throw new HttpError(502, `Falha ao enviar o arquivo ao Google Drive: ${mensagemErro(erro)}`);
    }
  }

  const relativo = `${subpasta}/${randomUUID()}-${nomeSeguro(nomeArquivo)}`;
  const destino = caminhoLocal(relativo);
  await mkdir(dirname(destino), { recursive: true });

  try {
    await pipeline(stream, contador.transform, createWriteStream(destino));
  } catch (erro) {
    await unlink(destino).catch(() => undefined);
    throw erro;
  }

  return { ref: `${PREFIXO_LOCAL}${relativo}`, link: null, tamanho: contador.total() };
};

export const abrirArquivo = async (ref: string): Promise<Readable> => {
  if (ref.startsWith(PREFIXO_DRIVE)) {
    if (!driveHabilitado()) {
      throw new HttpError(503, 'Este arquivo está no Google Drive, mas o Drive não está configurado na API');
    }
    try {
      return await baixarArquivoDrive(ref.slice(PREFIXO_DRIVE.length));
    } catch (erro) {
      throw new HttpError(502, `Falha ao baixar o arquivo do Google Drive: ${mensagemErro(erro)}`);
    }
  }

  if (ref.startsWith(PREFIXO_LOCAL)) {
    const caminho = caminhoLocal(ref.slice(PREFIXO_LOCAL.length));
    try {
      await stat(caminho);
    } catch {
      throw new HttpError(404, 'Arquivo não encontrado no armazenamento');
    }
    return createReadStream(caminho);
  }

  throw new HttpError(500, 'Referência de arquivo desconhecida');
};

/** Remove um arquivo. Falhas são apenas logadas (o registro no banco é o que importa). */
export const removerArquivo = async (ref: string | null | undefined) => {
  if (!ref) return;

  try {
    if (ref.startsWith(PREFIXO_DRIVE)) {
      if (driveHabilitado()) await removerArquivoDrive(ref.slice(PREFIXO_DRIVE.length));
      return;
    }
    if (ref.startsWith(PREFIXO_LOCAL)) {
      await unlink(caminhoLocal(ref.slice(PREFIXO_LOCAL.length)));
    }
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[armazenamento] não foi possível remover', ref, mensagemErro(erro));
    }
  }
};
