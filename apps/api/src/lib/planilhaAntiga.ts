import type { CondicaoGraduacao, SituacaoMatricula, TipoDocumento } from '@prisma/client';
import { cpfValido } from './validation';

/*
 * Leitura da planilha antiga de controle de alunos: uma aba por turma (TF4, B7...), uma aba
 * "Notas XX" por turma (aluno identificado só pelo nome) e uma aba "Historico XX" no modelo da
 * certificadora, de onde saem os módulos com docente e titulação. Aqui ficam só funções puras;
 * a gravação no banco está em services/importacaoPlanilha.ts.
 */

const DIA = 24 * 60 * 60 * 1000;

export const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Título de coluna comparável: sem acento, sem o texto entre parênteses e sem pontuação. */
export const normalizarTitulo = (texto: string) =>
  normalizar(texto.replace(/\(.*$/, ''))
    .replace(/[^a-z0-9/ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Nome comparável entre abas (a aba de notas só identifica o aluno pelo nome). */
export const normalizarNome = (nome: string) =>
  normalizar(nome)
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Texto de uma célula do exceljs (fórmula, texto rico, link, data). */
export const textoCelula = (valor: unknown): string => {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? '' : valor.toISOString().slice(0, 10);
  if (typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>;
    if ('result' in objeto) return textoCelula(objeto.result);
    if ('formula' in objeto || 'sharedFormula' in objeto) return '';
    if (Array.isArray(objeto.richText)) return textoCelula((objeto.richText as Array<{ text: string }>).map((parte) => parte.text).join(''));
    if ('text' in objeto) return textoCelula(objeto.text);
    if ('hyperlink' in objeto) return textoCelula(objeto.hyperlink);
    return '';
  }
  return String(valor).replace(/\s+/g, ' ').trim();
};

const valorDaFormula = (valor: unknown) =>
  valor && typeof valor === 'object' && 'result' in (valor as object) ? (valor as { result: unknown }).result : valor;

/** Link de uma célula (hiperlink ou texto com URL). */
export const linkCelula = (valor: unknown): string | null => {
  if (valor && typeof valor === 'object' && 'hyperlink' in (valor as object)) {
    const link = String((valor as { hyperlink: unknown }).hyperlink ?? '');
    if (/^https?:\/\//i.test(link)) return link;
  }
  return textoCelula(valor).match(/https?:\/\/\S+/i)?.[0] ?? null;
};

/** ID da pasta a partir do link do Google Drive. */
export const pastaDoDrive = (link: string | null) =>
  link?.match(/\/folders\/([\w-]{10,})/)?.[1] ?? link?.match(/[?&]id=([\w-]{10,})/)?.[1] ?? null;

export type CpfLido = { cpf: string | null; problema: 'vazio' | 'invalido' | null };

export const cpfDaPlanilha = (valor: unknown): CpfLido => {
  const digitos = textoCelula(valorDaFormula(valor)).replace(/\D/g, '');
  if (!digitos) return { cpf: null, problema: 'vazio' };
  // A coluna foi guardada como número e perdeu os zeros da frente
  const cpf = digitos.length >= 9 && digitos.length <= 11 ? digitos.padStart(11, '0') : digitos;
  return cpfValido(cpf) ? { cpf, problema: null } : { cpf: null, problema: 'invalido' };
};

const dataUtc = (ano: number, mes: number, dia: number) => {
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia ? data : null;
};

const anoCompleto = (ano: string) => (ano.length === 2 ? 2000 + Number(ano) : Number(ano));

/** Data de uma célula: data do Excel, número de série ou texto dd/mm/aaaa. */
export const dataCelula = (valor: unknown): Date | null => {
  const bruto = valorDaFormula(valor);
  if (bruto instanceof Date) {
    return Number.isNaN(bruto.getTime()) ? null : new Date(Date.UTC(bruto.getUTCFullYear(), bruto.getUTCMonth(), bruto.getUTCDate()));
  }
  if (typeof bruto === 'number') return bruto > 20000 && bruto < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.round(bruto) * DIA) : null;
  const texto = textoCelula(bruto);
  const brasileira = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/);
  if (brasileira) return dataUtc(anoCompleto(brasileira[3]), Number(brasileira[2]), Number(brasileira[1]));
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? dataUtc(Number(iso[1]), Number(iso[2]), Number(iso[3])) : null;
};

/**
 * Data escrita no meio de um texto ("Enviado 07/07 email", "Enviado em 30/04/2025"). Sem o ano, usa o
 * primeiro ano em que a data fica entre a referência (ex.: a data do lote) e hoje.
 */
export const dataDoTexto = (texto: string, referencia: Date | null, hoje: Date): Date | null => {
  const partes = texto.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2})(?!\d))?/);
  if (!partes) return null;
  const dia = Number(partes[1]);
  const mes = Number(partes[2]);
  if (partes[3]) return dataUtc(anoCompleto(partes[3]), mes, dia);

  const base = referencia ?? hoje;
  for (const ano of [base.getUTCFullYear(), base.getUTCFullYear() + 1]) {
    const data = dataUtc(ano, mes, dia);
    if (data && (!referencia || data.getTime() >= referencia.getTime() - 7 * DIA) && data <= hoje) return data;
  }
  const data = dataUtc(hoje.getUTCFullYear(), mes, dia);
  return data && data > hoje ? dataUtc(hoje.getUTCFullYear() - 1, mes, dia) : data;
};

export const somarMeses = (data: Date, meses: number) =>
  new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + meses, data.getUTCDate()));

export const referenciaMes = (data: Date) => data.toISOString().slice(0, 7);

/** A data que mais se repete (em empate, a mais recente). */
export const dataMaisFrequente = (datas: Array<Date | null>) => {
  const contagem = new Map<number, number>();
  for (const data of datas) if (data) contagem.set(data.getTime(), (contagem.get(data.getTime()) ?? 0) + 1);
  let melhor: number | null = null;
  let vezes = 0;
  for (const [tempo, quantidade] of contagem) {
    if (quantidade > vezes || (quantidade === vezes && melhor !== null && tempo > melhor)) {
      melhor = tempo;
      vezes = quantidade;
    }
  }
  return melhor === null ? null : new Date(melhor);
};

export const simNao = (valor: unknown): boolean | null => {
  const texto = normalizar(textoCelula(valor));
  if (/^(s|sim)$/.test(texto)) return true;
  if (/^(n|nao)$/.test(texto)) return false;
  return null;
};

export const telefoneDaPlanilha = (valor: unknown) => {
  let digitos = textoCelula(valorDaFormula(valor)).replace(/\D/g, '');
  if (digitos.startsWith('55') && digitos.length >= 12) digitos = digitos.slice(2);
  return digitos.length >= 8 ? digitos : null;
};

export const emailDaPlanilha = (valor: unknown) => {
  const email = textoCelula(valor).replace(/^mailto:/i, '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

const SITUACOES: Record<string, SituacaoMatricula> = {
  'em dia': 'EM_DIA',
  ativo: 'EM_DIA',
  monitora: 'EM_DIA',
  avulsa: 'EM_DIA',
  cancelado: 'CANCELADO',
  finalizado: 'FINALIZADO',
  atrasado: 'ATRASADO',
  inadimplente: 'ATRASADO',
  trial: 'TRIAL',
  suspenso: 'SUSPENSO',
  quitado: 'QUITADO',
};

/** Situação da matrícula a partir de "ATIVO/CANCELADO" e "QUITADO?". Valor desconhecido vira "Em dia". */
export const situacaoDaPlanilha = (status: string, quitado: string): { situacao: SituacaoMatricula; reconhecida: boolean } => {
  const conhecida = SITUACOES[normalizar(status)];
  const situacao = conhecida ?? 'EM_DIA';
  return { situacao: situacao === 'EM_DIA' && simNao(quitado) === true ? 'QUITADO' : situacao, reconhecida: Boolean(conhecida) };
};

/** Linhas repetidas do mesmo aluno na mesma turma: vale Em dia/Quitada, depois Trial, depois as demais. */
export const prioridadeSituacao = (situacao: SituacaoMatricula) =>
  ({ EM_DIA: 0, QUITADO: 0, FINALIZADO: 0, TRIAL: 1, ATRASADO: 2, SUSPENSO: 2, CANCELADO: 3 })[situacao];

/** Nota da avaliação (0 a 100); a planilha guarda algumas como texto. */
export const notaDaPlanilha = (valor: unknown): { nota: number | null; invalida: boolean } => {
  const bruto = valorDaFormula(valor);
  const texto = textoCelula(bruto);
  if (texto === '') return { nota: null, invalida: false };
  const numero = typeof bruto === 'number' ? bruto : Number(texto.replace(',', '.').match(/^\d+(\.\d+)?/)?.[0] ?? Number.NaN);
  if (!Number.isFinite(numero) || numero < 0 || numero > 100) return { nota: null, invalida: true };
  return { nota: Math.round(numero * 100) / 100, invalida: false };
};

/** "Módulo IV - Nome" / "MODULO 4: Nome" -> "Nome". */
export const nomeDoModulo = (texto: string) => texto.replace(/^m[oóÓ]dulo\s*[ivxlcdm\d]+\s*[-:–]?\s*/i, '').trim() || texto.trim();

export const cargaHorariaModulo = (texto: string) => {
  const numero = Number(texto.replace(/\D/g, ''));
  return numero > 0 && numero < 1000 ? numero : null;
};

export type ModuloPlanilha = { nome: string; cargaHoraria: number | null; docente: string | null; titulacao: string | null };

export type HistoricoPlanilha = {
  /** "Pós-Graduado no curso de: ..." */
  nomeTurma: string | null;
  /** "HISTÓRICO ESCOLAR DO CURSO DE ESPECIALIZAÇÃO EM: ..." */
  curso: string | null;
  resolucao: string | null;
  cargaHoraria: number | null;
  modulos: ModuloPlanilha[];
};

/**
 * Lê a aba "Historico XX" a partir do texto das células (índice = número da coluna; células mescladas
 * só na primeira). O bloco começa na coluna A em algumas abas e na B em outras, então tudo é achado pelo texto.
 */
export const lerHistoricoPlanilha = (linhas: string[][]): HistoricoPlanilha => {
  const resultado: HistoricoPlanilha = { nomeTurma: null, curso: null, resolucao: null, cargaHoraria: null, modulos: [] };
  let colunas: { nome: number; ch: number; docente: number; titulacao: number } | null = null;

  for (const celulas of linhas) {
    for (const texto of celulas) {
      if (!texto) continue;
      const posGraduado = texto.match(/^p[oóÓ]s-graduad[oa] no curso de:\s*(.+)$/i);
      if (posGraduado && !resultado.nomeTurma) resultado.nomeTurma = posGraduado[1].trim();
      const titulo = texto.match(/especializa[çcÇ][ãaÃ]o em:\s*(.+)$/i);
      if (titulo && !resultado.curso) resultado.curso = titulo[1].trim();
      const resolucao = texto.match(/\((?:nas disposi[çcÇ][õoÕ]es d[ao]\s*)?(resolu[çcÇ][ãaÃ]o[^)]*?)\.?\)/i);
      if (resolucao && !resultado.resolucao) resultado.resolucao = resolucao[1].trim();
      const horas = texto.match(/^(\d+)\s*horas?$/i);
      if (horas && !resultado.cargaHoraria) resultado.cargaHoraria = Number(horas[1]);
    }

    if (!colunas) {
      const nome = celulas.findIndex((texto) => /^disciplinas?$/i.test(texto ?? ''));
      if (nome >= 0) {
        colunas = {
          nome,
          ch: celulas.findIndex((texto) => /^ch$/i.test(texto ?? '')),
          docente: celulas.findIndex((texto) => /docente/i.test(texto ?? '')),
          titulacao: celulas.findIndex((texto) => /titula/i.test(texto ?? '')),
        };
      }
      continue;
    }

    const modulo = celulas[colunas.nome] ?? '';
    if (!/^m[oóÓ]dulo/i.test(modulo)) continue;
    const coluna = (indice: number) => (indice >= 0 ? celulas[indice]?.trim() || null : null);
    resultado.modulos.push({
      nome: nomeDoModulo(modulo),
      cargaHoraria: cargaHorariaModulo(coluna(colunas.ch) ?? ''),
      docente: coluna(colunas.docente),
      titulacao: coluna(colunas.titulacao),
    });
  }

  return resultado;
};

/** Colunas "MODULO N: nome" da aba de notas (índice = número da coluna). */
export const modulosDasNotas = (cabecalho: string[]) =>
  cabecalho.flatMap((texto, coluna) => (/^m[oóÓ]dulo\s*\d+/i.test(texto ?? '') ? [{ coluna, nome: nomeDoModulo(texto) }] : []));

export type Endereco = {
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  cidade: string | null;
  estado: string | null;
};

const CHAVES_ENDERECO_COM_CEP = ['rua', 'numero', 'complemento', 'bairro', 'cep', 'cidade', 'estado'] as const;
const CHAVES_ENDERECO_SEM_CEP = ['rua', 'numero', 'complemento', 'bairro', 'cidade', 'estado'] as const;

export const formatarCep = (valor: string | null) => {
  const digitos = (valor ?? '').replace(/\D/g, '');
  return digitos.length >= 7 && digitos.length <= 8 ? digitos.padStart(8, '0').replace(/(\d{5})(\d{3})/, '$1-$2') : null;
};

/**
 * Monta o endereço corrigindo as linhas deslocadas da planilha: rua digitada em "Quitado?" (tudo uma
 * coluna para a esquerda) ou CEP em "Cidade" (cidade e UF uma coluna para a direita, com a UF em "Grupo do Whatsapp").
 * `campos` segue a ordem das colunas da aba: rua, número, complemento, bairro, [CEP,] cidade, estado.
 */
export const montarEndereco = ({
  quitado,
  campos,
  temCep,
  whatsapp,
}: {
  quitado: string;
  campos: string[];
  temCep: boolean;
  whatsapp: string;
}): { endereco: Endereco; corrigido: boolean } => {
  let valores = campos.map((valor) => valor.trim());
  let corrigido = false;

  if (quitado && simNao(quitado) === null && /[a-z]/i.test(quitado)) {
    valores = [quitado.trim(), ...valores.slice(0, -1)];
    corrigido = true;
  }

  const endereco: Endereco = { rua: null, numero: null, complemento: null, bairro: null, cep: null, cidade: null, estado: null };
  (temCep ? CHAVES_ENDERECO_COM_CEP : CHAVES_ENDERECO_SEM_CEP).forEach((chave, indice) => {
    endereco[chave] = valores[indice] || null;
  });

  if (!formatarCep(endereco.cep) && endereco.cidade && /^\d{5}-?\d{3}$/.test(endereco.cidade.replace(/\s/g, ''))) {
    endereco.cep = endereco.cidade;
    endereco.cidade = endereco.estado;
    endereco.estado = /^[A-Za-z]{2}$/.test(whatsapp.trim()) ? whatsapp.trim() : null;
    corrigido = true;
  }

  endereco.cep = formatarCep(endereco.cep);
  if (endereco.estado && /^[a-z]{2}$/i.test(endereco.estado)) endereco.estado = endereco.estado.toUpperCase();
  return { endereco, corrigido };
};

export type CertificadoDigitalLido = { situacao: 'entregue' | 'recebido' | 'desconhecido'; data: Date | null; canal: 'email' | 'whatsapp' | null };

/** "Enviado 07/07 email", "Enviado 16/01/2025 wpp", "recebido 10/02"... */
export const certificadoDigitalDaPlanilha = (texto: string, referencia: Date | null, hoje: Date): CertificadoDigitalLido | null => {
  if (!texto.trim()) return null;
  const normal = normalizar(texto);
  const canal = /e-?mail/.test(normal) ? 'email' : /wpp|whats|zap/.test(normal) ? 'whatsapp' : null;
  const data = dataDoTexto(texto, referencia, hoje);
  if (/envi/.test(normal) && !/sera envi|somente fisico/.test(normal)) return { situacao: data ? 'entregue' : 'desconhecido', data, canal };
  if (/receb/.test(normal)) return { situacao: data ? 'recebido' : 'desconhecido', data, canal };
  return { situacao: 'desconhecido', data: null, canal };
};

/** Data em que o certificado foi para a certificadora (célula de data ou "Enviado em 30/04/2025"). */
export const dataLoteDaPlanilha = (valor: unknown, hoje: Date) => dataCelula(valor) ?? dataDoTexto(textoCelula(valor), null, hoje);

/** Condição na graduação pelos documentos conferidos (sem informação: graduado com diploma, o caso mais comum). */
export const condicaoPelosDocumentos = (tipos: Set<TipoDocumento>): CondicaoGraduacao => {
  if (tipos.has('DIPLOMA')) return 'CONCLUIDO_COM_DIPLOMA';
  if (tipos.has('DECLARACAO_CONCLUSAO')) return 'CONCLUIDO_SEM_DIPLOMA';
  if (tipos.has('DECLARACAO_MATRICULA')) return 'CURSANDO';
  return 'CONCLUIDO_COM_DIPLOMA';
};

export type CampoTurma =
  | 'matricula'
  | 'inicio'
  | 'cancelamento'
  | 'status'
  | 'entrou'
  | 'saiu'
  | 'nome'
  | 'email'
  | 'telefone'
  | 'cpf'
  | 'quitado'
  | 'rua'
  | 'numero'
  | 'complemento'
  | 'bairro'
  | 'cep'
  | 'cidade'
  | 'estado'
  | 'whatsapp'
  | 'camiseta'
  | 'pasta'
  | 'docRg'
  | 'docCpf'
  | 'docCertidao'
  | 'docHistorico'
  | 'docDiploma'
  | 'docConclusao'
  | 'docMatricula'
  | 'docResidencia'
  | 'coletaData'
  | 'coletaQuem'
  | 'naturalidade'
  | 'rg'
  | 'orgao'
  | 'nascimento'
  | 'mae'
  | 'dataFinal'
  | 'certConfeccao'
  | 'certDigital';

const TITULOS: Array<[CampoTurma, RegExp]> = [
  ['matricula', /^n ?matri/],
  ['inicio', /^data de inicio/],
  ['cancelamento', /^data de cancelamento/],
  ['status', /ativo\/cancelado/],
  ['entrou', /^entrou por migra/],
  ['saiu', /^saiu por migra/],
  ['nome', /^nome( completo| do aluno)?$/],
  ['email', /^e ?mail$/],
  ['telefone', /^telefone/],
  ['cpf', /^cpf$/],
  ['quitado', /^quit/],
  ['rua', /^rua$/],
  ['numero', /^numero$/],
  ['complemento', /^complemento$/],
  ['bairro', /^bairro$/],
  ['cep', /^cep$|^coluna1$/],
  ['cidade', /^cidade$/],
  ['estado', /^estado$/],
  ['whatsapp', /grupo do whatsapp/],
  ['camiseta', /camiseta/],
  ['pasta', /^pasta documentacao$|^link da pasta$/],
  ['docRg', /^rg frente/],
  ['docCpf', /^cpf frente/],
  ['docCertidao', /^certidao/],
  ['docHistorico', /^historico da graduacao/],
  ['docDiploma', /^diploma/],
  ['docConclusao', /^declaracao d.? conclusao/],
  ['docMatricula', /^comprovante de matricula/],
  ['docResidencia', /^comprovante de residencia/],
  ['coletaData', /^data da ultima coleta/],
  ['coletaQuem', /^quem realizou/],
  ['naturalidade', /^naturalidade/],
  ['rg', /^(n )?rg$/],
  ['orgao', /^orgao emissor/],
  ['nascimento', /^data de nascimento/],
  ['mae', /^nome da mae/],
  ['dataFinal', /^data final/],
  ['certConfeccao', /^status atual do certificado/],
  ['certDigital', /certificado digital/],
];

// Nas colunas 1 a 12 a ordem é a mesma em todas as abas, mesmo quando o título está vazio ou errado
const POSICOES: Partial<Record<CampoTurma, number>> = {
  matricula: 1,
  inicio: 4,
  cancelamento: 5,
  status: 6,
  entrou: 7,
  saiu: 8,
  nome: 9,
  email: 10,
  telefone: 11,
  cpf: 12,
};

/** Número da coluna de cada campo numa aba de turma (cabeçalho indexado pelo número da coluna). */
export const mapearColunas = (cabecalho: string[]) => {
  const titulos = cabecalho.map((titulo) => normalizarTitulo(titulo ?? ''));
  const colunas = {} as Record<CampoTurma, number | null>;
  for (const [campo, regex] of TITULOS) {
    const indice = titulos.findIndex((titulo) => regex.test(titulo));
    colunas[campo] = indice > 0 ? indice : POSICOES[campo] ?? null;
  }
  return colunas;
};

/** Aba de turma: tem a coluna "ATIVO/CANCELADO". */
export const ehAbaDeTurma = (cabecalho: string[]) => cabecalho.some((titulo) => /ativo\/cancelado/.test(normalizarTitulo(titulo ?? '')));

export const DOCUMENTOS_DA_PLANILHA: Array<[CampoTurma, TipoDocumento]> = [
  ['docRg', 'RG'],
  ['docCpf', 'CPF'],
  ['docCertidao', 'CERTIDAO_NASCIMENTO_CASAMENTO'],
  ['docHistorico', 'HISTORICO_GRADUACAO'],
  ['docDiploma', 'DIPLOMA'],
  ['docConclusao', 'DECLARACAO_CONCLUSAO'],
  ['docMatricula', 'DECLARACAO_MATRICULA'],
  ['docResidencia', 'COMPROVANTE_ENDERECO'],
];
