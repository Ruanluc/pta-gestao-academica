import dotenv from 'dotenv';
import { resolve } from 'path';

// Raiz do projeto da API (vale tanto para src/ via tsx quanto para dist/ compilado)
const API_ROOT = resolve(__dirname, '..');
dotenv.config({ path: resolve(API_ROOT, '.env') });

const texto = (valor: string | undefined) => {
  const limpo = valor?.trim();
  return limpo ? limpo : undefined;
};

const numero = (valor: string | undefined, padrao: number) => {
  const limpo = texto(valor);
  const convertido = Number(limpo);
  return limpo !== undefined && Number.isFinite(convertido) ? convertido : padrao;
};

const jwtSecret = texto(process.env.JWT_SECRET);
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET deve estar definido em apps/api/.env com pelo menos 32 caracteres');
}

const smtpPort = numero(process.env.SMTP_PORT, 587);

export const config = {
  apiRoot: API_ROOT,
  producao: process.env.NODE_ENV === 'production',
  port: numero(process.env.PORT, 3000),
  host: texto(process.env.HOST) ?? '0.0.0.0',
  jwtSecret,
  jwtExpiresIn: texto(process.env.JWT_EXPIRES_IN) ?? '8h',
  corsOrigins: (texto(process.env.CORS_ORIGIN) ?? 'http://localhost:3001')
    .split(',')
    .map((origem) => origem.trim())
    .filter(Boolean),
  webUrl: (texto(process.env.WEB_URL) ?? 'http://localhost:3001').replace(/\/$/, ''),
  redisUrl: texto(process.env.REDIS_URL),
  storageDir: resolve(API_ROOT, texto(process.env.STORAGE_DIR) ?? 'storage'),
  uploadMaxMb: numero(process.env.UPLOAD_MAX_MB, 20),
  instituicao: texto(process.env.INSTITUICAO_NOME) ?? 'PTA - Gestão Acadêmica de Pós-Graduação',
  regras: {
    // Nota de 0 a 100 na avaliação de cada módulo
    mediaMinima: numero(process.env.MEDIA_MINIMA, 70),
    frequenciaMinima: numero(process.env.FREQUENCIA_MINIMA, 75),
    // Quantidade de módulos de cada turma (0 = sem limite)
    modulosPorTurma: numero(process.env.MODULOS_POR_TURMA, 18),
  },
  google: {
    pastaRaizId: texto(process.env.GOOGLE_DRIVE_FOLDER_ID),
    // false (padrão): arquivos ficam no servidor e vão ao Drive pela exportação manual da pasta do aluno
    envioAutomatico: texto(process.env.GOOGLE_DRIVE_ENVIO_AUTOMATICO) === 'true',
    serviceAccountJson: texto(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    applicationCredentials: texto(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    serviceAccountEmail: texto(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
    privateKey: texto(process.env.GOOGLE_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
    oauthClientId: texto(process.env.GOOGLE_OAUTH_CLIENT_ID),
    oauthClientSecret: texto(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    oauthRefreshToken: texto(process.env.GOOGLE_OAUTH_REFRESH_TOKEN),
  },
  portalAluno: {
    // Validade do link de acesso enviado ao aluno e da sessão aberta com ele
    diasValidadeLink: numero(process.env.LINK_ALUNO_DIAS, 7),
    horasSessao: numero(process.env.SESSAO_ALUNO_HORAS, 12),
  },
  cademi: {
    apiUrl: texto(process.env.CADEMI_API_URL)?.replace(/\/$/, ''),
    token: texto(process.env.CADEMI_API_TOKEN),
    // Importação automática de notas (0 = só pelo botão na turma)
    intervaloMinutos: numero(process.env.CADEMI_SINCRONIZAR_A_CADA_MINUTOS, 0),
  },
  smtp: {
    host: texto(process.env.SMTP_HOST),
    port: smtpPort,
    secure: smtpPort === 465,
    user: texto(process.env.SMTP_USER),
    pass: texto(process.env.SMTP_PASS),
    from: texto(process.env.SMTP_FROM),
  },
};
