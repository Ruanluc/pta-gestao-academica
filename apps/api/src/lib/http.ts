const removerAcentos = (valor: string) => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const slugificar = (valor: string) =>
  removerAcentos(valor)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'arquivo';

/** Cabeçalho Content-Disposition compatível com nomes acentuados. */
export const contentDisposition = (nomeArquivo: string, tipo: 'inline' | 'attachment' = 'inline') => {
  const ascii = removerAcentos(nomeArquivo).replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`;
};
