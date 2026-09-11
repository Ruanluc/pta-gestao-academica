/** Dados que o aluno pode corrigir pelo portal (o CPF só a secretaria altera). */
export const CAMPOS_EDITAVEIS_PORTAL = [
  'nome',
  'email',
  'telefone',
  'dataNascimento',
  'nacionalidade',
  'naturalidade',
  'filiacao',
  'rgNumero',
  'rgOrgaoEmissor',
] as const;

export type CampoEditavel = (typeof CAMPOS_EDITAVEIS_PORTAL)[number];

export const ROTULOS_CAMPOS: Record<CampoEditavel, string> = {
  nome: 'Nome',
  email: 'E-mail',
  telefone: 'Telefone',
  dataNascimento: 'Data de nascimento',
  nacionalidade: 'Nacionalidade',
  naturalidade: 'Naturalidade',
  filiacao: 'Filiação',
  rgNumero: 'Documento de identidade (RG)',
  rgOrgaoEmissor: 'Órgão emissor',
};

// O telefone não vai no histórico nem é usado para acesso: o aluno altera livremente
const SEMPRE_DIRETO: CampoEditavel[] = ['telefone'];

type Valor = string | Date | null | undefined;

export const normalizarValor = (valor: Valor) =>
  valor instanceof Date ? valor.toISOString().slice(0, 10) : typeof valor === 'string' ? valor.trim() : '';

export type AlteracaoEmAnalise = { atual: string; novo: string };

/**
 * Meio-termo combinado com a secretaria:
 *  - campo vazio (ou telefone): o aluno preenche direto;
 *  - campo já preenchido: vira solicitação para a secretaria aprovar.
 */
export const classificarAlteracoes = (
  atual: Partial<Record<CampoEditavel, Valor>>,
  novos: Partial<Record<CampoEditavel, Valor>>,
) => {
  const diretas: Partial<Record<CampoEditavel, Valor>> = {};
  const emAnalise: Partial<Record<CampoEditavel, AlteracaoEmAnalise>> = {};

  for (const campo of CAMPOS_EDITAVEIS_PORTAL) {
    if (novos[campo] === undefined) continue;
    const valorAtual = normalizarValor(atual[campo]);
    const valorNovo = normalizarValor(novos[campo]);
    if (valorAtual === valorNovo) continue;

    if (SEMPRE_DIRETO.includes(campo) || valorAtual === '') diretas[campo] = novos[campo];
    else emAnalise[campo] = { atual: valorAtual, novo: valorNovo };
  }

  return { diretas, emAnalise };
};

/** Converte o valor aprovado (texto) para o formato do banco. */
export const valorParaBanco = (campo: CampoEditavel, valor: string) => {
  if (campo === 'dataNascimento') return valor ? new Date(`${valor}T00:00:00.000Z`) : null;
  return valor === '' ? null : valor;
};
