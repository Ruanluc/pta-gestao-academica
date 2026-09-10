import { clearAuthToken, getApiBaseUrl, getAuthToken } from './auth';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly erros?: Array<{ campo: string; mensagem: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const ROTAS_PUBLICAS = ['/login', '/magic'];

export const apiFetch = async (path: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers);
  const token = getAuthToken();

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let resposta: Response;
  try {
    resposta = await fetch(`${getApiBaseUrl()}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, 'Não foi possível conectar à API. Verifique se o servidor está rodando.');
  }

  // Sessão expirada: limpa o token e volta para o login
  if (resposta.status === 401 && token) {
    clearAuthToken();
    if (typeof window !== 'undefined' && !ROTAS_PUBLICAS.includes(window.location.pathname)) {
      window.location.href = '/login?expirou=1';
    }
  }

  return resposta;
};

const lerErro = async (resposta: Response) => {
  try {
    const corpo = await resposta.json();
    return new ApiError(resposta.status, corpo?.message || `Erro ${resposta.status}`, corpo?.erros);
  } catch {
    return new ApiError(resposta.status, `Erro ${resposta.status}`);
  }
};

/** Chamada JSON à API. Lança ApiError com a mensagem enviada pelo servidor. */
export const api = async <T = unknown>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> => {
  const { json, ...resto } = options;
  const resposta = await apiFetch(path, json !== undefined ? { ...resto, body: JSON.stringify(json) } : resto);

  if (!resposta.ok) throw await lerErro(resposta);
  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
};

/** Envia um FormData (upload de arquivos). */
export const apiUpload = async <T = unknown>(path: string, dados: FormData): Promise<T> => {
  const resposta = await apiFetch(path, { method: 'POST', body: dados });
  if (!resposta.ok) throw await lerErro(resposta);
  return (await resposta.json()) as T;
};

/** Abre em nova aba um arquivo protegido (PDF, imagem) da API. */
export const abrirArquivo = async (path: string) => {
  // A aba é aberta antes da requisição para o navegador não bloquear como pop-up
  const aba = window.open('', '_blank');

  try {
    const resposta = await apiFetch(path);
    if (!resposta.ok) throw await lerErro(resposta);

    const url = URL.createObjectURL(await resposta.blob());
    if (aba) aba.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (erro) {
    aba?.close();
    throw erro;
  }
};
