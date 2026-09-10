// Datas "puras" (nascimento, início/fim de turma) são gravadas como meia-noite UTC
export const formatarData = (valor?: string | null) =>
  valor ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(valor)) : '-';

export const formatarDataHora = (valor?: string | null) =>
  valor ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor)) : '-';

export const paraInputData = (valor?: string | null) => (valor ? valor.slice(0, 10) : '');

export const mascararCpf = (valor: string) => {
  const digitos = valor.replace(/\D/g, '').slice(0, 11);
  return digitos
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

export const formatarTamanho = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
};

export const formatarNumero = (valor: number | null | undefined, casas = 1) =>
  valor === null || valor === undefined ? '-' : valor.toFixed(casas).replace('.', ',');

/** Nota de 0 a 100: sem casas decimais quando inteira (85), com uma casa quando fracionada (72,5). */
export const formatarNota = (valor: number | null | undefined) =>
  valor === null || valor === undefined ? '-' : Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace('.', ',');

/** Converte o texto de um campo numérico (aceita vírgula). Vazio = null, inválido = NaN. */
export const numeroDeCampo = (valor: string): number | null => {
  const limpo = valor.trim().replace(',', '.');
  if (!limpo) return null;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : Number.NaN;
};

export const mensagemErro = (erro: unknown) => (erro instanceof Error ? erro.message : 'Ocorreu um erro inesperado');
