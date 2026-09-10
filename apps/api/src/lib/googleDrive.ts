import type { Readable } from 'stream';
import { google, type drive_v3 } from 'googleapis';
import { config } from '../config';

const ESCOPOS = ['https://www.googleapis.com/auth/drive'];

let cliente: drive_v3.Drive | null | undefined;

/**
 * Ordem de preferência das credenciais:
 * 1. OAuth de um usuário (GOOGLE_OAUTH_*) — necessário para contas Gmail pessoais,
 *    pois contas de serviço não têm cota de armazenamento no "Meu Drive".
 * 2. Conta de serviço (JSON inteiro, e-mail + chave privada, ou arquivo de credenciais) —
 *    funciona com Drives compartilhados do Google Workspace.
 */
const criarAutenticacao = () => {
  const google_ = config.google;

  if (google_.oauthClientId && google_.oauthClientSecret && google_.oauthRefreshToken) {
    const oauth = new google.auth.OAuth2(google_.oauthClientId, google_.oauthClientSecret);
    oauth.setCredentials({ refresh_token: google_.oauthRefreshToken });
    return oauth;
  }

  if (google_.serviceAccountJson) {
    return new google.auth.GoogleAuth({ credentials: JSON.parse(google_.serviceAccountJson), scopes: ESCOPOS });
  }

  if (google_.serviceAccountEmail && google_.privateKey) {
    return new google.auth.JWT({ email: google_.serviceAccountEmail, key: google_.privateKey, scopes: ESCOPOS });
  }

  if (google_.applicationCredentials) {
    return new google.auth.GoogleAuth({ keyFile: google_.applicationCredentials, scopes: ESCOPOS });
  }

  return null;
};

const obterDrive = () => {
  if (cliente !== undefined) return cliente;

  if (!config.google.pastaRaizId) {
    cliente = null;
    return cliente;
  }

  try {
    const auth = criarAutenticacao();
    cliente = auth ? google.drive({ version: 'v3', auth }) : null;
  } catch (erro) {
    console.error('[drive] credenciais do Google inválidas:', (erro as Error).message);
    cliente = null;
  }

  return cliente;
};

/** O Drive só é usado quando há credenciais e uma pasta raiz (GOOGLE_DRIVE_FOLDER_ID). */
export const driveHabilitado = () => obterDrive() !== null;

/** Envio de cada arquivo ao Drive no momento do upload (desligado por padrão; hoje a exportação é manual). */
export const envioAutomaticoDrive = () => config.google.envioAutomatico && driveHabilitado();

export const linkPastaDrive = (pastaId: string) => `https://drive.google.com/drive/folders/${pastaId}`;

const exigirDrive = () => {
  const drive = obterDrive();
  if (!drive) throw new Error('Google Drive não configurado');
  return drive;
};

export const criarPastaDrive = async (nome: string, pastaPaiId = config.google.pastaRaizId) => {
  const { data } = await exigirDrive().files.create({
    requestBody: {
      name: nome,
      mimeType: 'application/vnd.google-apps.folder',
      parents: pastaPaiId ? [pastaPaiId] : undefined,
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  if (!data.id) throw new Error('O Google Drive não retornou o ID da pasta criada');
  return data.id;
};

export const enviarArquivoDrive = async ({
  stream,
  nome,
  mimeType,
  pastaId,
}: {
  stream: Readable;
  nome: string;
  mimeType: string;
  pastaId?: string | null;
}) => {
  const pasta = pastaId ?? config.google.pastaRaizId;

  const { data } = await exigirDrive().files.create({
    requestBody: { name: nome, parents: pasta ? [pasta] : undefined },
    media: { mimeType, body: stream },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });

  if (!data.id) throw new Error('O Google Drive não retornou o ID do arquivo enviado');
  return { id: data.id, link: data.webViewLink ?? null };
};

export const baixarArquivoDrive = async (fileId: string) => {
  const resposta = await exigirDrive().files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  );
  return resposta.data as unknown as Readable;
};

export const removerArquivoDrive = async (fileId: string) => {
  await exigirDrive().files.delete({ fileId, supportsAllDrives: true });
};
