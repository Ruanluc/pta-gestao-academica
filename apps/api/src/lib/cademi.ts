import { config } from '../config';
import { HttpError } from './errors';
import { somenteDigitos } from './validation';

/**
 * Nota como deve sair da API da Cademi, já convertida para o formato do sistema.
 * O aluno é reconhecido por alunoCademiId, CPF ou e-mail (nessa ordem); informe ao menos um.
 */
export type RegistroNotaCademi = {
  alunoCademiId?: string | number | null;
  cpf?: string | null;
  email?: string | null;
  nome?: string | null;
  /** O mesmo valor cadastrado no campo "ID na Cademi" do módulo da turma */
  moduloCademiId: string | number;
  /** Nota JÁ na escala de 0 a 100 (converter aqui se a Cademi usar outra escala). null = ainda sem nota */
  nota: number | null;
  /** Frequência em %, se a Cademi fornecer. Sem este campo, a frequência lançada no sistema é mantida */
  frequencia?: number | null;
};

export type ProvedorCademi = (parametros: { modulosCademiIds: string[] }) => Promise<RegistroNotaCademi[]>;

// ============================================================================
// PONTO DE INTEGRAÇÃO COM A API DA CADEMI
// Quando houver a documentação, implemente aqui a busca das notas dos módulos
// informados (usando config.cademi.apiUrl e config.cademi.token), devolva os
// registros no formato RegistroNotaCademi e mude PROVEDOR_IMPLEMENTADO para true.
// Todo o restante (casar alunos e módulos, gravar notas, semáforo, histórico,
// importação automática e histórico de importações) já está pronto.
// ============================================================================
const PROVEDOR_IMPLEMENTADO = false;

const provedorPadrao: ProvedorCademi = async () => {
  throw new HttpError(
    501,
    'A leitura de notas da API da Cademi ainda não foi implementada (aguardando a documentação da API).',
  );
};

let provedor: ProvedorCademi = provedorPadrao;
let implementado = PROVEDOR_IMPLEMENTADO;

/** Substitui o provedor de notas (usado nos testes). */
export const definirProvedorCademi = (novo: ProvedorCademi) => {
  provedor = novo;
  implementado = true;
};

export const cademiConfigurada = () => Boolean(config.cademi.apiUrl && config.cademi.token);

export const cademiImplementada = () => implementado;

/** desativada: sem credenciais | pendente: credenciais ok, leitura ainda não implementada | ativa */
export const statusCademi = (): 'desativada' | 'pendente' | 'ativa' => {
  if (implementado) return 'ativa';
  return cademiConfigurada() ? 'pendente' : 'desativada';
};

export const buscarNotasCademi = async (modulosCademiIds: string[]) => {
  if (!implementado && !cademiConfigurada()) {
    throw new HttpError(503, 'Integração com a Cademi não configurada: preencha CADEMI_API_URL e CADEMI_API_TOKEN no .env da API.');
  }
  return provedor({ modulosCademiIds });
};

export type AlunoParaCasar = { id: string; cademiId: string | null; email: string; cpf: string };
export type ModuloParaCasar = { id: string; cademiId: string | null; nome: string };

export type ResultadoCasamento = {
  notas: Array<{ alunoId: string; disciplinaId: string; media: number; frequencia?: number | null }>;
  /** Alunos reconhecidos por CPF/e-mail que ainda não tinham o ID da Cademi */
  vinculos: Array<{ alunoId: string; cademiId: string }>;
  alunosNaoEncontrados: string[];
  modulosNaoEncontrados: string[];
  ignorados: Array<{ motivo: string; registro: string }>;
  semNota: number;
};

const valorValido = (valor: unknown) => typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 100;

/**
 * Relaciona os registros da Cademi com os alunos matriculados e os módulos da turma.
 * Só são considerados os alunos e módulos passados (os da turma sendo importada).
 */
export const casarNotasCademi = (
  alunos: AlunoParaCasar[],
  modulos: ModuloParaCasar[],
  registros: RegistroNotaCademi[],
): ResultadoCasamento => {
  const alunosPorCademi = new Map(alunos.filter((aluno) => aluno.cademiId).map((aluno) => [String(aluno.cademiId), aluno]));
  const alunosPorCpf = new Map(alunos.map((aluno) => [somenteDigitos(aluno.cpf), aluno]));
  const alunosPorEmail = new Map(alunos.map((aluno) => [aluno.email.trim().toLowerCase(), aluno]));
  const modulosPorCademi = new Map(modulos.filter((modulo) => modulo.cademiId).map((modulo) => [String(modulo.cademiId).trim(), modulo]));

  const notas = new Map<string, ResultadoCasamento['notas'][number]>();
  const vinculos = new Map<string, string>();
  const alunosNaoEncontrados = new Set<string>();
  const modulosNaoEncontrados = new Set<string>();
  const ignorados: ResultadoCasamento['ignorados'] = [];
  let semNota = 0;

  for (const registro of registros) {
    const alunoCademiId = registro.alunoCademiId === null || registro.alunoCademiId === undefined ? '' : String(registro.alunoCademiId).trim();
    const cpf = registro.cpf ? somenteDigitos(registro.cpf) : '';
    const email = registro.email?.trim().toLowerCase() ?? '';
    const identificacao = registro.nome || registro.email || registro.cpf || alunoCademiId || '(aluno sem identificação)';

    const modulo = modulosPorCademi.get(String(registro.moduloCademiId).trim());
    if (!modulo) {
      modulosNaoEncontrados.add(String(registro.moduloCademiId));
      continue;
    }

    const aluno =
      (alunoCademiId && alunosPorCademi.get(alunoCademiId)) || (cpf && alunosPorCpf.get(cpf)) || (email && alunosPorEmail.get(email)) || undefined;
    if (!aluno) {
      alunosNaoEncontrados.add(identificacao);
      continue;
    }

    if (registro.nota === null || registro.nota === undefined) {
      semNota += 1;
      continue;
    }

    const frequenciaInformada = registro.frequencia !== undefined && registro.frequencia !== null;
    if (!valorValido(registro.nota) || (frequenciaInformada && !valorValido(registro.frequencia))) {
      ignorados.push({ motivo: 'Nota ou frequência fora da faixa de 0 a 100', registro: `${identificacao} / ${modulo.nome}` });
      continue;
    }

    if (alunoCademiId && !aluno.cademiId && !vinculos.has(aluno.id)) vinculos.set(aluno.id, alunoCademiId);

    // Se o mesmo aluno/módulo vier repetido, vale o último registro
    notas.set(`${aluno.id}:${modulo.id}`, {
      alunoId: aluno.id,
      disciplinaId: modulo.id,
      media: registro.nota,
      ...(frequenciaInformada ? { frequencia: registro.frequencia } : {}),
    });
  }

  return {
    notas: [...notas.values()],
    vinculos: [...vinculos].map(([alunoId, cademiId]) => ({ alunoId, cademiId })),
    alunosNaoEncontrados: [...alunosNaoEncontrados],
    modulosNaoEncontrados: [...modulosNaoEncontrados],
    ignorados,
    semNota,
  };
};
