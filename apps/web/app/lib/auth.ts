const STORAGE_KEY = 'pta-auth-token';

// Chaves usadas pela versão antiga, que guardava os dados no navegador
const CHAVES_ANTIGAS = ['pta-turmas', 'pta-alunos', 'pta-matriculas', 'pta-modulos', 'pta-notas'];

export const getApiBaseUrl = () => (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');

const armazenamento = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const getAuthToken = () => armazenamento()?.getItem(STORAGE_KEY) ?? null;

export const setAuthToken = (token: string) => armazenamento()?.setItem(STORAGE_KEY, token);

export const clearAuthToken = () => armazenamento()?.removeItem(STORAGE_KEY);

/** Remove dados que a versão antiga guardava no navegador (agora tudo vem da API). */
export const limparDadosAntigos = () => {
  const local = armazenamento();
  CHAVES_ANTIGAS.forEach((chave) => local?.removeItem(chave));
};
