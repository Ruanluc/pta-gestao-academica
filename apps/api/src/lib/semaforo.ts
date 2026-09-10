import type { CondicaoGraduacao, StatusDocumento, StatusSemaforo, TipoDocumento } from '@prisma/client';

export const ROTULOS_DOCUMENTO: Record<TipoDocumento, string> = {
  RG: 'RG',
  CPF: 'CPF',
  COMPROVANTE_ENDERECO: 'Comprovante de endereço',
  HISTORICO_GRADUACAO: 'Histórico da graduação',
  DIPLOMA: 'Diploma da graduação',
  DECLARACAO_CONCLUSAO: 'Declaração de conclusão da graduação',
  DECLARACAO_MATRICULA: 'Declaração de matrícula na graduação',
  OUTRO: 'Outro',
};

const DOCUMENTOS_BASE: TipoDocumento[] = ['RG', 'CPF', 'COMPROVANTE_ENDERECO'];

/** Documentos exigidos conforme a situação do aluno na graduação. */
export const documentosObrigatorios = (condicao: CondicaoGraduacao): TipoDocumento[] => {
  switch (condicao) {
    case 'CONCLUIDO_COM_DIPLOMA':
      return [...DOCUMENTOS_BASE, 'DIPLOMA', 'HISTORICO_GRADUACAO'];
    case 'CONCLUIDO_SEM_DIPLOMA':
      return [...DOCUMENTOS_BASE, 'DECLARACAO_CONCLUSAO', 'HISTORICO_GRADUACAO'];
    case 'CURSANDO':
    default:
      return [...DOCUMENTOS_BASE, 'DECLARACAO_MATRICULA'];
  }
};

export type DocumentoResumo = { tipo: TipoDocumento; status: StatusDocumento };
export type NotaResumo = { disciplinaId: string; media: number | null; frequencia: number | null };
/** Nota de 0 a 100 por módulo; modulosPorTurma = 0 desativa a exigência de quantidade. */
export type RegrasAprovacao = { mediaMinima: number; frequenciaMinima: number; modulosPorTurma: number };
export type SituacaoDisciplina = 'APROVADO' | 'REPROVADO' | 'PENDENTE';

export const avaliarDocumentacao = (condicao: CondicaoGraduacao, documentos: DocumentoResumo[]) => {
  const faltando: TipoDocumento[] = [];
  const rejeitados: TipoDocumento[] = [];
  const aguardando: TipoDocumento[] = [];

  for (const tipo of documentosObrigatorios(condicao)) {
    const doTipo = documentos.filter((documento) => documento.tipo === tipo);
    if (doTipo.some((documento) => documento.status === 'APROVADO')) continue;
    if (doTipo.some((documento) => documento.status === 'PENDENTE')) aguardando.push(tipo);
    else if (doTipo.length > 0) rejeitados.push(tipo);
    else faltando.push(tipo);
  }

  return { faltando, rejeitados, aguardando };
};

export const documentacaoCompleta = (condicao: CondicaoGraduacao, documentos: DocumentoResumo[]) => {
  const { faltando, rejeitados, aguardando } = avaliarDocumentacao(condicao, documentos);
  return faltando.length === 0 && rejeitados.length === 0 && aguardando.length === 0;
};

export const situacaoDisciplina = (
  nota: Omit<NotaResumo, 'disciplinaId'> | undefined,
  regras: Pick<RegrasAprovacao, 'mediaMinima' | 'frequenciaMinima'>,
): SituacaoDisciplina => {
  if (!nota || nota.media === null || nota.frequencia === null) return 'PENDENTE';
  return nota.media >= regras.mediaMinima && nota.frequencia >= regras.frequenciaMinima ? 'APROVADO' : 'REPROVADO';
};

/** A turma tem todos os módulos previstos cadastrados. */
export const turmaCompleta = (disciplinas: Array<{ id: string }>, regras: RegrasAprovacao) =>
  disciplinas.length > 0 && (regras.modulosPorTurma <= 0 || disciplinas.length >= regras.modulosPorTurma);

/** A matrícula está concluída quando a turma tem todos os módulos e o aluno foi aprovado em cada um. */
export const matriculaConcluida = (disciplinas: Array<{ id: string }>, notas: NotaResumo[], regras: RegrasAprovacao) =>
  turmaCompleta(disciplinas, regras) &&
  disciplinas.every(
    (disciplina) => situacaoDisciplina(notas.find((nota) => nota.disciplinaId === disciplina.id), regras) === 'APROVADO',
  );

/** Dados pessoais que aparecem no histórico da certificadora e por isso são obrigatórios. */
export const CAMPOS_HISTORICO = {
  rgNumero: 'documento de identidade (RG)',
  rgOrgaoEmissor: 'órgão emissor',
  dataNascimento: 'data de nascimento',
  nacionalidade: 'nacionalidade',
  naturalidade: 'naturalidade',
  filiacao: 'filiação',
} as const;

export type DadosPessoaisHistorico = {
  rgNumero: string | null;
  rgOrgaoEmissor: string | null;
  dataNascimento: Date | string | null;
  nacionalidade: string | null;
  naturalidade: string | null;
  filiacao: string | null;
};

export const dadosFaltantesHistorico = (dados: Partial<DadosPessoaisHistorico>) =>
  (Object.keys(CAMPOS_HISTORICO) as Array<keyof typeof CAMPOS_HISTORICO>)
    .filter((campo) => {
      const valor = dados[campo];
      return valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '');
    })
    .map((campo) => CAMPOS_HISTORICO[campo]);

export type EntradaSemaforo = {
  condicaoGraduacao: CondicaoGraduacao;
  documentos: DocumentoResumo[];
  /** Quando informado, exige os dados pessoais usados no histórico */
  dadosPessoais?: Partial<DadosPessoaisHistorico>;
  /** Turmas em que o aluno está matriculado, com seus módulos */
  turmas: Array<{ nome: string; disciplinas: Array<{ id: string }> }>;
  notas: NotaResumo[];
};

export type ResultadoSemaforo = { status: StatusSemaforo; pendencias: string[] };

/**
 * VERMELHO: falta documento obrigatório (ou só há versões rejeitadas).
 * AMARELO: documentação enviada, mas há documento aguardando análise, turma sem todos os módulos,
 *          módulo sem nota/frequência ou reprovação.
 * VERDE: tudo certo.
 */
export const calcularSemaforo = (entrada: EntradaSemaforo, regras: RegrasAprovacao): ResultadoSemaforo => {
  const { faltando, rejeitados, aguardando } = avaliarDocumentacao(entrada.condicaoGraduacao, entrada.documentos);

  const pendenciasDocumentacao = [
    ...faltando.map((tipo) => `Documento faltando: ${ROTULOS_DOCUMENTO[tipo]}`),
    ...rejeitados.map((tipo) => `Documento rejeitado, reenviar: ${ROTULOS_DOCUMENTO[tipo]}`),
  ];

  if (entrada.dadosPessoais) {
    const faltantes = dadosFaltantesHistorico(entrada.dadosPessoais);
    if (faltantes.length) pendenciasDocumentacao.push(`Dados pessoais incompletos para o histórico: ${faltantes.join(', ')}`);
  }

  const pendenciasAvaliacao = aguardando.map((tipo) => `Documento aguardando análise: ${ROTULOS_DOCUMENTO[tipo]}`);

  if (regras.modulosPorTurma > 0) {
    for (const turma of entrada.turmas) {
      if (turma.disciplinas.length < regras.modulosPorTurma) {
        pendenciasAvaliacao.push(`${turma.nome}: ${turma.disciplinas.length} de ${regras.modulosPorTurma} módulos cadastrados`);
      }
    }
  }

  const situacoes = entrada.turmas
    .flatMap((turma) => turma.disciplinas)
    .map((disciplina) => situacaoDisciplina(entrada.notas.find((nota) => nota.disciplinaId === disciplina.id), regras));
  const semNota = situacoes.filter((situacao) => situacao === 'PENDENTE').length;
  const reprovadas = situacoes.filter((situacao) => situacao === 'REPROVADO').length;

  if (semNota > 0) pendenciasAvaliacao.push(`${semNota} módulo(s) sem nota ou frequência lançada`);
  if (reprovadas > 0) pendenciasAvaliacao.push(`Reprovado em ${reprovadas} módulo(s)`);

  if (pendenciasDocumentacao.length > 0) {
    return { status: 'VERMELHO', pendencias: [...pendenciasDocumentacao, ...pendenciasAvaliacao] };
  }
  if (pendenciasAvaliacao.length > 0) {
    return { status: 'AMARELO', pendencias: pendenciasAvaliacao };
  }
  return { status: 'VERDE', pendencias: [] };
};
