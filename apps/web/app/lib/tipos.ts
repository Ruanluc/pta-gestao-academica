export type Role = 'ADMIN' | 'SECRETARIA' | 'PROFESSOR' | 'CERTIFICADORA';
export type StatusSemaforo = 'VERDE' | 'AMARELO' | 'VERMELHO';
export type CondicaoGraduacao = 'CURSANDO' | 'CONCLUIDO_SEM_DIPLOMA' | 'CONCLUIDO_COM_DIPLOMA';
export type TipoDocumento =
  | 'RG'
  | 'CPF'
  | 'COMPROVANTE_ENDERECO'
  | 'HISTORICO_GRADUACAO'
  | 'DIPLOMA'
  | 'DECLARACAO_CONCLUSAO'
  | 'DECLARACAO_MATRICULA'
  | 'OUTRO';
export type StatusDocumento = 'PENDENTE' | 'APROVADO' | 'REJEITADO';
export type SituacaoDisciplina = 'APROVADO' | 'REPROVADO' | 'PENDENTE';
/** Nota de 0 a 100 por módulo; modulosPorTurma = 0 significa sem limite. */
export type Regras = { mediaMinima: number; frequenciaMinima: number; modulosPorTurma: number };

export type Usuario = { id: string; nome: string; email: string; role: Role; ativo: boolean; criadoEm?: string };

export type Turma = {
  id: string;
  nome: string;
  curso: string | null;
  resolucaoMec: string | null;
  cargaHoraria: number;
  dataInicio: string;
  dataFim: string;
  ativa: boolean;
  codigoInscricao: string | null;
  inscricoesAbertas: boolean;
  _count?: { matriculas: number; disciplinas: number };
};

export type Disciplina = {
  id: string;
  turmaId: string;
  ordem: number;
  nome: string;
  cargaHoraria: number;
  docente: string | null;
  titulacao: string | null;
  cademiId: string | null;
};

export type AlunoResumo = { id: string; nome: string; cpf: string; email: string; statusSemaforo: StatusSemaforo };

export type Aluno = AlunoResumo & {
  telefone: string | null;
  dataNascimento: string | null;
  nacionalidade: string | null;
  naturalidade: string | null;
  filiacao: string | null;
  rgNumero: string | null;
  rgOrgaoEmissor: string | null;
  condicaoGraduacao: CondicaoGraduacao;
  driveFolderId: string | null;
  cademiId: string | null;
  inscricaoOnline: boolean;
  acessoExpiraEm: string | null;
  driveExportadoEm: string | null;
};

export type AlunoLista = Aluno & { matriculas: Array<{ id: string; turma: { id: string; nome: string } }> };

export type Matricula = {
  id: string;
  alunoId: string;
  turmaId: string;
  dataInclusao: string;
  historicoLink: string | null;
  historicoGeradoEm: string | null;
  historicoDriveFileId: string | null;
};

export type TurmaDetalhe = Turma & {
  disciplinas: Disciplina[];
  matriculas: Array<Matricula & { aluno: AlunoResumo }>;
  regras: Regras;
};

export type Nota = {
  id: string;
  alunoId: string;
  disciplinaId: string;
  media: number | null;
  frequencia: number | null;
  origem: 'MANUAL' | 'CADEMI';
  importadoEm: string | null;
};

export type StatusCademi = {
  status: 'desativada' | 'pendente' | 'ativa';
  configurada: boolean;
  implementada: boolean;
  sincronizacaoAutomaticaMinutos: number;
};

export type SincronizacaoCademi = {
  id: string;
  turmaId: string;
  automatica: boolean;
  status: 'EM_ANDAMENTO' | 'SUCESSO' | 'PARCIAL' | 'ERRO';
  notasImportadas: number;
  notasIgnoradas: number;
  iniciadoEm: string;
  concluidoEm: string | null;
  usuario?: { nome: string } | null;
  detalhes: {
    totalRecebido?: number;
    alunosNaoEncontrados?: string[];
    modulosNaoEncontrados?: string[];
    ignorados?: Array<{ motivo: string; registro: string }>;
    semNota?: number;
    vinculosCriados?: number;
    erro?: string;
  } | null;
};

export type Documento = {
  id: string;
  alunoId: string;
  tipo: TipoDocumento;
  nomeArquivo: string;
  mimeType: string;
  tamanho: number;
  driveLink: string | null;
  status: StatusDocumento;
  motivoRejeicao: string | null;
  analisadoEm: string | null;
  criadoEm: string;
  aluno?: { id: string; nome: string; cpf: string };
  enviadoPor?: { nome: string } | null;
  analisadoPor?: { nome: string } | null;
};

export type AlunoDetalhe = Aluno & {
  matriculas: Array<Matricula & { turma: Turma & { disciplinas: Disciplina[] } }>;
  documentos: Documento[];
  notas: Nota[];
  pendencias: string[];
  documentosObrigatorios: TipoDocumento[];
  regras: Regras;
  driveConfigurado: boolean;
  notificacoes: Notificacao[];
};

export type Dashboard = {
  turmasAtivas: number;
  totalTurmas: number;
  totalAlunos: number;
  documentosPendentes: number;
  semaforo: Record<StatusSemaforo, number>;
  solicitacoesPendentes: number;
  certificacao: {
    lotesAbertos: number;
    lotesComCertificadora: number;
    proximoPrazo: { id: string; referencia: string; prazoEm: string; pendentes: number } | null;
  };
  regras: Regras;
  integracoes: {
    armazenamento: 'google-drive' | 'local';
    email: 'smtp' | 'console';
    fila: 'redis' | 'processo';
    cademi: StatusCademi['status'];
    drive: 'desativado' | 'manual' | 'automatico';
  };
};

export type RegistroAuditoria = {
  id: string;
  acao: string;
  entidade: string;
  entidadeId: string;
  detalhes: string | null;
  criadoEm: string;
  usuario: { nome: string; email: string } | null;
};

export type StatusLote = 'ABERTO' | 'ENVIADO' | 'CONCLUIDO';

export type LoteResumo = {
  id: string;
  referencia: string;
  status: StatusLote;
  enviadoEm: string | null;
  prazoEm: string | null;
  concluidoEm: string | null;
  criadoEm: string;
  totalAlunos: number;
  certificadosEmitidos: number;
};

export type ItemLote = {
  id: string;
  matriculaId: string;
  driveFolderId: string | null;
  certificadoNumero: string | null;
  certificadoEmitidoEm: string | null;
  registradoPor: { nome: string } | null;
  matricula: {
    id: string;
    historicoGeradoEm: string | null;
    aluno: { id: string; nome: string; cpf: string; email?: string };
    turma: { id: string; nome: string };
  };
};

export type LoteDetalhe = Omit<LoteResumo, 'totalAlunos' | 'certificadosEmitidos'> & {
  driveFolderId: string | null;
  pastaLink: string | null;
  driveConfigurado: boolean;
  prazoDias: number;
  criadoPor: { nome: string } | null;
  itens: ItemLote[];
};

export type MatriculaApta = {
  matriculaId: string;
  aluno: { id: string; nome: string; cpf: string };
  turma: { id: string; nome: string };
  historicoGeradoEm: string | null;
};

export type Aptos = { aptas: MatriculaApta[]; comPendencia: Array<MatriculaApta & { pendencias: string[] }> };

export type CampoEditavel =
  | 'nome'
  | 'email'
  | 'telefone'
  | 'dataNascimento'
  | 'nacionalidade'
  | 'naturalidade'
  | 'filiacao'
  | 'rgNumero'
  | 'rgOrgaoEmissor';

export const CAMPOS_EDITAVEIS: CampoEditavel[] = [
  'nome',
  'email',
  'telefone',
  'dataNascimento',
  'nacionalidade',
  'naturalidade',
  'filiacao',
  'rgNumero',
  'rgOrgaoEmissor',
];

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

export type SolicitacaoAlteracao = {
  id: string;
  alunoId: string;
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA';
  dados: Partial<Record<CampoEditavel, { atual: string; novo: string }>>;
  motivoRecusa: string | null;
  criadoEm: string;
  analisadoEm: string | null;
  aluno: { id: string; nome: string; cpf: string };
  analisadoPor: { nome: string } | null;
};

export type Notificacao = {
  id: string;
  tipo: string;
  assunto: string;
  para: string;
  enviado: boolean;
  erro: string | null;
  criadoEm: string;
};

export const ROTULOS_STATUS_LOTE: Record<StatusLote, string> = {
  ABERTO: 'Em montagem',
  ENVIADO: 'Com a certificadora',
  CONCLUIDO: 'Concluído',
};

export const ROTULOS_ROLE: Record<Role, string> = {
  ADMIN: 'Administrador',
  SECRETARIA: 'Secretaria',
  PROFESSOR: 'Professor',
  CERTIFICADORA: 'Certificadora',
};

export const ROTULOS_SEMAFORO: Record<StatusSemaforo, string> = {
  VERDE: 'Tudo certo',
  AMARELO: 'Falta avaliação',
  VERMELHO: 'Falta documentação',
};

export const ROTULOS_CONDICAO: Record<CondicaoGraduacao, string> = {
  CURSANDO: 'Cursando a graduação',
  CONCLUIDO_SEM_DIPLOMA: 'Graduação concluída (sem diploma)',
  CONCLUIDO_COM_DIPLOMA: 'Graduação concluída (com diploma)',
};

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

export const ROTULOS_STATUS_DOCUMENTO: Record<StatusDocumento, string> = {
  PENDENTE: 'Aguardando análise',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
};

export const ROTULOS_SITUACAO: Record<SituacaoDisciplina, string> = {
  APROVADO: 'Aprovado',
  REPROVADO: 'Reprovado',
  PENDENTE: 'Pendente',
};

export const situacaoDisciplina = (
  nota: { media: number | null; frequencia: number | null } | undefined,
  regras: Regras,
): SituacaoDisciplina => {
  if (!nota || nota.media === null || nota.frequencia === null || Number.isNaN(nota.media) || Number.isNaN(nota.frequencia)) {
    return 'PENDENTE';
  }
  return nota.media >= regras.mediaMinima && nota.frequencia >= regras.frequenciaMinima ? 'APROVADO' : 'REPROVADO';
};
