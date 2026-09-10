import { ApiError } from './api';
import { getApiBaseUrl } from './auth';

// Sessão do portal do aluno, separada do login da equipe
const CHAVE_SESSAO = 'pta-portal-aluno';

const armazenamento = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const getSessaoAluno = () => armazenamento()?.getItem(CHAVE_SESSAO) ?? null;

export const setSessaoAluno = (sessao: string) => armazenamento()?.setItem(CHAVE_SESSAO, sessao);

export const clearSessaoAluno = () => armazenamento()?.removeItem(CHAVE_SESSAO);

type Opcoes = { method?: string; json?: unknown; body?: BodyInit; publico?: boolean };

const requisitar = async (path: string, { method = 'GET', json, body, publico = false }: Opcoes) => {
  const headers = new Headers();
  if (json !== undefined) headers.set('Content-Type', 'application/json');

  const sessao = publico ? null : getSessaoAluno();
  if (sessao) headers.set('Authorization', `Bearer ${sessao}`);

  let resposta: Response;
  try {
    resposta = await fetch(`${getApiBaseUrl()}${path}`, { method, headers, body: json !== undefined ? JSON.stringify(json) : body });
  } catch {
    throw new ApiError(0, 'Não foi possível conectar ao servidor. Tente novamente em instantes.');
  }

  // Sessão do portal expirada: volta para a tela de pedir um novo link
  if (resposta.status === 401 && !publico) {
    clearSessaoAluno();
    if (typeof window !== 'undefined') window.location.href = '/portal/entrar?expirou=1';
  }

  if (!resposta.ok) {
    let mensagem = `Erro ${resposta.status}`;
    try {
      mensagem = (await resposta.json())?.message || mensagem;
    } catch {
      // resposta sem JSON
    }
    throw new ApiError(resposta.status, mensagem);
  }

  return resposta;
};

/** Chamada à API a partir das páginas públicas e do portal do aluno. */
export const portalApi = async <T = unknown>(path: string, opcoes: Opcoes = {}): Promise<T> => {
  const resposta = await requisitar(path, opcoes);
  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
};

/** Abre em nova aba um arquivo do próprio aluno. */
export const abrirArquivoPortal = async (path: string) => {
  const aba = window.open('', '_blank');
  try {
    const resposta = await requisitar(path, {});
    const url = URL.createObjectURL(await resposta.blob());
    if (aba) aba.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (erro) {
    aba?.close();
    throw erro;
  }
};
