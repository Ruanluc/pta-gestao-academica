import ExcelJS from 'exceljs';
import { mkdir, writeFile } from 'fs/promises';
import { basename, join, resolve } from 'path';
import type { CondicaoGraduacao, SituacaoMatricula, TipoDocumento } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { registrarAuditoria } from '../lib/audit';
import {
  certificadoDigitalDaPlanilha,
  condicaoPelosDocumentos,
  cpfDaPlanilha,
  dataCelula,
  dataLoteDaPlanilha,
  dataMaisFrequente,
  DOCUMENTOS_DA_PLANILHA,
  ehAbaDeTurma,
  emailDaPlanilha,
  lerHistoricoPlanilha,
  linkCelula,
  mapearColunas,
  modulosDasNotas,
  montarEndereco,
  normalizar,
  normalizarNome,
  notaDaPlanilha,
  pastaDoDrive,
  prioridadeSituacao,
  referenciaMes,
  simNao,
  situacaoDaPlanilha,
  somarMeses,
  telefoneDaPlanilha,
  textoCelula,
  type CampoTurma,
  type CertificadoDigitalLido,
  type Endereco,
  type ModuloPlanilha,
} from '../lib/planilhaAntiga';
import { MIME_EXTERNO, PREFIXO_EXTERNO } from '../lib/storage';
import { atualizarSituacaoAluno, gerarHistoricoFinal } from './academico';

/*
 * Importação única da planilha antiga (ver lib/planilhaAntiga.ts). Primeiro monta um plano só em
 * memória e grava um relatório; com "aplicar", grava no banco sem duplicar nem sobrescrever o que já existe.
 */

const DURACAO_MESES = 18;
const DIA = 24 * 60 * 60 * 1000;
// Como saía no histórico da planilha (a nacionalidade não tinha coluna)
const NACIONALIDADE_PADRAO = 'Brasileiro(a)';

type LinhaAluno = {
  turma: string;
  linha: number;
  cpf: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  numeroMatricula: string | null;
  dataInicio: Date | null;
  dataCancelamento: Date | null;
  situacao: SituacaoMatricula;
  statusOriginal: string;
  entrouPorMigracao: boolean;
  saiuPorMigracao: boolean;
  endereco: Endereco;
  enderecoCorrigido: boolean;
  grupoWhatsapp: boolean | null;
  ganhouCamiseta: boolean | null;
  pastaLink: string | null;
  documentos: TipoDocumento[];
  coletaData: Date | null;
  coletaQuem: string | null;
  naturalidade: string | null;
  rgNumero: string | null;
  rgOrgaoEmissor: string | null;
  dataNascimento: Date | null;
  filiacao: string | null;
  dataFinal: Date | null;
  dataLote: Date | null;
  certificadoDigital: string;
};

type TurmaPlano = {
  codigo: string;
  nome: string;
  curso: string | null;
  resolucaoMec: string | null;
  cargaHoraria: number;
  dataInicio: Date;
  dataFim: Date;
  ativa: boolean;
  modulos: ModuloPlanilha[];
  origemModulos: 'histórico' | 'notas' | 'nenhuma';
  periodo: 'data final da aba' | 'primeira entrada + 18 meses' | 'sem datas';
  alunos: number;
};

type DadosAluno = {
  nome: string;
  email: string | null;
  telefone: string | null;
  dataNascimento: Date | null;
  nacionalidade: string;
  naturalidade: string | null;
  filiacao: string | null;
  rgNumero: string | null;
  rgOrgaoEmissor: string | null;
  condicaoGraduacao: CondicaoGraduacao;
  enderecoRua: string | null;
  enderecoNumero: string | null;
  enderecoComplemento: string | null;
  enderecoBairro: string | null;
  enderecoCep: string | null;
  enderecoCidade: string | null;
  enderecoEstado: string | null;
  grupoWhatsapp: boolean | null;
  ganhouCamiseta: boolean | null;
  driveFolderId: string | null;
};

type Pessoa = {
  cpf: string;
  /** Uma linha por turma (a escolhida entre as repetidas) */
  linhas: LinhaAluno[];
  dados: DadosAluno;
  documentos: Set<TipoDocumento>;
  coleta: { data: Date | null; quem: string | null; link: string | null };
};

type LotePlano = { referencia: string; enviadoEm: Date; itens: Array<{ chave: string; digital: CertificadoDigitalLido | null }> };

type Relatorio = {
  linhasIgnoradas: Array<{ turma: string; linha: number; nome: string; motivo: string }>;
  duplicadas: Array<{ turma: string; cpf: string; escolhida: number; descartadas: string }>;
  notasSemAluno: Array<{ turma: string; linha: number; nome: string; motivo: string }>;
  certificadosNaoEntendidos: Array<{ turma: string; linha: number; texto: string }>;
  situacoesNaoReconhecidas: Map<string, number>;
  notasInvalidas: number;
  lotesFuturos: number;
  lotesPelaEntrega: number;
};

type Plano = {
  turmas: TurmaPlano[];
  pessoas: Pessoa[];
  /** "cpf|turma" -> ordem do módulo -> nota */
  notas: Map<string, Map<number, number>>;
  lotes: LotePlano[];
  relatorio: Relatorio;
  linhasLidas: number;
};

/** Texto das células de uma linha, indexado pelo número da coluna (célula mesclada: só na primeira). */
export const textosDaLinha = (aba: ExcelJS.Worksheet, numero: number) => {
  const linha = aba.getRow(numero);
  const textos: string[] = [''];
  for (let coluna = 1; coluna <= aba.columnCount; coluna += 1) {
    const celula = linha.getCell(coluna);
    textos[coluna] = celula.isMerged && celula.master.address !== celula.address ? '' : textoCelula(celula.value);
  }
  return textos;
};

const abaPorNome = (livro: ExcelJS.Workbook, nome: string) => livro.worksheets.find((aba) => normalizar(aba.name) === normalizar(nome));

const dataPlausivel = (data: Date | null, anoMinimo: number, anoMaximo: number) =>
  data && data.getUTCFullYear() >= anoMinimo && data.getUTCFullYear() <= anoMaximo ? data : null;

const lerAbaTurma = (aba: ExcelJS.Worksheet, hoje: Date, relatorio: Relatorio): LinhaAluno[] => {
  const colunas = mapearColunas(textosDaLinha(aba, 1));
  const codigo = aba.name.trim().toUpperCase();
  const anoAtual = hoje.getUTCFullYear();
  const linhas: LinhaAluno[] = [];

  for (let numero = 2; numero <= aba.rowCount; numero += 1) {
    const linha = aba.getRow(numero);
    const valor = (campo: CampoTurma) => {
      const coluna = colunas[campo];
      return coluna ? linha.getCell(coluna).value : null;
    };
    const texto = (campo: CampoTurma) => textoCelula(valor(campo));

    const nome = texto('nome');
    const cpfLido = cpfDaPlanilha(valor('cpf'));
    if (!nome && cpfLido.problema === 'vazio') continue;
    if (!nome || !cpfLido.cpf) {
      const motivo = !nome ? 'sem nome' : cpfLido.problema === 'vazio' ? 'sem CPF' : 'CPF inválido';
      relatorio.linhasIgnoradas.push({ turma: codigo, linha: numero, nome, motivo });
      continue;
    }

    const status = texto('status');
    const { situacao, reconhecida } = situacaoDaPlanilha(status, texto('quitado'));
    if (status && !reconhecida) relatorio.situacoesNaoReconhecidas.set(status, (relatorio.situacoesNaoReconhecidas.get(status) ?? 0) + 1);

    const camposEndereco: CampoTurma[] = ['rua', 'numero', 'complemento', 'bairro', ...(colunas.cep ? (['cep'] as CampoTurma[]) : []), 'cidade', 'estado'];
    const { endereco, corrigido } = montarEndereco({
      quitado: texto('quitado'),
      campos: camposEndereco.map(texto),
      temCep: Boolean(colunas.cep),
      whatsapp: texto('whatsapp'),
    });

    linhas.push({
      turma: codigo,
      linha: numero,
      cpf: cpfLido.cpf,
      nome,
      email: emailDaPlanilha(valor('email')),
      telefone: telefoneDaPlanilha(valor('telefone')),
      numeroMatricula: texto('matricula').replace(/\D/g, '') || null,
      dataInicio: dataPlausivel(dataCelula(valor('inicio')), 2015, anoAtual + 1),
      dataCancelamento: dataPlausivel(dataCelula(valor('cancelamento')), 2015, anoAtual + 1),
      situacao,
      statusOriginal: status,
      entrouPorMigracao: simNao(valor('entrou')) === true || /^veio/i.test(texto('entrou')),
      saiuPorMigracao: simNao(valor('saiu')) === true || /^mudou/i.test(texto('saiu')),
      endereco,
      enderecoCorrigido: corrigido,
      grupoWhatsapp: simNao(valor('whatsapp')),
      ganhouCamiseta: simNao(valor('camiseta')),
      pastaLink: linkCelula(valor('pasta')),
      documentos: DOCUMENTOS_DA_PLANILHA.filter(([campo]) => simNao(valor(campo)) === true).map(([, tipo]) => tipo),
      coletaData: dataPlausivel(dataCelula(valor('coletaData')), 2015, anoAtual + 1),
      coletaQuem: texto('coletaQuem') || null,
      naturalidade: texto('naturalidade') || null,
      rgNumero: texto('rg') || null,
      rgOrgaoEmissor: texto('orgao') || null,
      dataNascimento: dataPlausivel(dataCelula(valor('nascimento')), 1920, anoAtual - 14),
      filiacao: texto('mae') || null,
      dataFinal: dataPlausivel(dataCelula(valor('dataFinal')), 2015, anoAtual + 5),
      dataLote: dataPlausivel(dataLoteDaPlanilha(valor('certConfeccao'), hoje), 2015, anoAtual + 1),
      certificadoDigital: texto('certDigital'),
    });
  }

  return linhas;
};

type LinhaAbaAlunos = { numeroMatricula: string | null; nome: string; email: string | null; status: string; quitado: string };

/** Aba "Alunos" (colunas fixas: A nº matrícula, B CPF, C nome, D e-mail, E turma, Q status, R quitado). */
const lerAbaAlunos = (aba: ExcelJS.Worksheet | undefined) => {
  const mapa = new Map<string, LinhaAbaAlunos>();
  if (!aba) return mapa;
  for (let numero = 2; numero <= aba.rowCount; numero += 1) {
    const linha = aba.getRow(numero);
    const cpf = cpfDaPlanilha(linha.getCell(2).value).cpf;
    const turma = textoCelula(linha.getCell(5).value).toUpperCase();
    if (!cpf || !turma) continue;
    mapa.set(`${cpf}|${turma}`, {
      numeroMatricula: textoCelula(linha.getCell(1).value).replace(/\D/g, '') || null,
      nome: textoCelula(linha.getCell(3).value),
      email: emailDaPlanilha(linha.getCell(4).value),
      status: textoCelula(linha.getCell(17).value),
      quitado: textoCelula(linha.getCell(18).value),
    });
  }
  return mapa;
};

const linhaMinima = (turma: string, cpf: string, dados: LinhaAbaAlunos): LinhaAluno => ({
  turma,
  linha: 0,
  cpf,
  nome: dados.nome,
  email: dados.email,
  telefone: null,
  numeroMatricula: dados.numeroMatricula,
  dataInicio: null,
  dataCancelamento: null,
  ...(({ situacao }) => ({ situacao }))(situacaoDaPlanilha(dados.status, dados.quitado)),
  statusOriginal: dados.status,
  entrouPorMigracao: false,
  saiuPorMigracao: false,
  endereco: { rua: null, numero: null, complemento: null, bairro: null, cep: null, cidade: null, estado: null },
  enderecoCorrigido: false,
  grupoWhatsapp: null,
  ganhouCamiseta: null,
  pastaLink: null,
  documentos: [],
  coletaData: null,
  coletaQuem: null,
  naturalidade: null,
  rgNumero: null,
  rgOrgaoEmissor: null,
  dataNascimento: null,
  filiacao: null,
  dataFinal: null,
  dataLote: null,
  certificadoDigital: '',
});

const preenchidos = (linha: LinhaAluno) =>
  [linha.email, linha.telefone, linha.naturalidade, linha.rgNumero, linha.rgOrgaoEmissor, linha.dataNascimento, linha.filiacao, linha.endereco.rua, linha.pastaLink].filter(
    Boolean,
  ).length + linha.documentos.length;

/** Entre linhas repetidas: Em dia/Quitada, depois Trial, depois as demais; empate: a mais completa e a mais recente. */
const melhorPrimeiro = (a: LinhaAluno, b: LinhaAluno) =>
  prioridadeSituacao(a.situacao) - prioridadeSituacao(b.situacao) ||
  preenchidos(b) - preenchidos(a) ||
  (b.dataInicio?.getTime() ?? 0) - (a.dataInicio?.getTime() ?? 0);

const planejarTurma = (livro: ExcelJS.Workbook, codigo: string, linhas: LinhaAluno[], hoje: Date): TurmaPlano => {
  const abaHistorico = abaPorNome(livro, `Historico ${codigo}`);
  const historico = abaHistorico
    ? lerHistoricoPlanilha(Array.from({ length: Math.min(abaHistorico.rowCount, 80) }, (_, indice) => textosDaLinha(abaHistorico, indice + 1)))
    : null;
  const abaNotas = abaPorNome(livro, `Notas ${codigo}`);
  const modulosNotas = abaNotas ? modulosDasNotas(textosDaLinha(abaNotas, 1)) : [];
  const modulosHistorico = historico?.modulos ?? [];

  let modulos: ModuloPlanilha[] = [];
  let origemModulos: TurmaPlano['origemModulos'] = 'nenhuma';
  if (modulosHistorico.length && (!modulosNotas.length || modulosHistorico.length === modulosNotas.length)) {
    modulos = modulosHistorico;
    origemModulos = 'histórico';
  } else if (modulosNotas.length) {
    modulos = modulosNotas.map((modulo, indice) => ({
      nome: modulo.nome,
      cargaHoraria: modulosHistorico[indice]?.cargaHoraria ?? null,
      docente: modulosHistorico[indice]?.docente ?? null,
      titulacao: modulosHistorico[indice]?.titulacao ?? null,
    }));
    origemModulos = 'notas';
  }

  const cargaHoraria = historico?.cargaHoraria ?? 360;
  const cargaPadrao = modulos.length ? Math.round(cargaHoraria / modulos.length) : 0;
  modulos = modulos.map((modulo) => ({ ...modulo, cargaHoraria: modulo.cargaHoraria ?? cargaPadrao }));

  // Período fixo de 18 meses, igual para a turma toda: a data final que mais se repete na aba
  const dataFinal = dataMaisFrequente(linhas.map((linha) => linha.dataFinal));
  const primeiraEntrada = linhas.reduce<Date | null>(
    (menor, linha) => (linha.dataInicio && (!menor || linha.dataInicio < menor) ? linha.dataInicio : menor),
    null,
  );
  const dataFim = dataFinal ?? (primeiraEntrada ? somarMeses(primeiraEntrada, DURACAO_MESES) : somarMeses(hoje, DURACAO_MESES));

  return {
    codigo,
    nome: historico?.nomeTurma?.replace(/\s*-\s*$/, '') || (historico?.curso ? `${historico.curso} - ${codigo}` : codigo),
    curso: historico?.curso ?? null,
    resolucaoMec: historico?.resolucao ?? null,
    cargaHoraria,
    dataInicio: somarMeses(dataFim, -DURACAO_MESES),
    dataFim,
    ativa: dataFim >= hoje,
    modulos,
    origemModulos,
    periodo: dataFinal ? 'data final da aba' : primeiraEntrada ? 'primeira entrada + 18 meses' : 'sem datas',
    alunos: linhas.length,
  };
};

const lerNotas = (livro: ExcelJS.Workbook, codigo: string, linhas: LinhaAluno[], relatorio: Relatorio) => {
  const notas = new Map<string, Map<number, number>>();
  const aba = abaPorNome(livro, `Notas ${codigo}`);
  if (!aba) return notas;

  const modulos = modulosDasNotas(textosDaLinha(aba, 1));
  const porNome = new Map<string, Set<string>>();
  for (const linha of linhas) {
    const chave = normalizarNome(linha.nome);
    porNome.set(chave, (porNome.get(chave) ?? new Set()).add(linha.cpf));
  }

  for (let numero = 2; numero <= aba.rowCount; numero += 1) {
    const linha = aba.getRow(numero);
    const nome = textoCelula(linha.getCell(1).value);
    if (!nome || /^m[oóÓ]dulo/i.test(nome)) continue;

    const valores = modulos.map((modulo, indice) => ({ ordem: indice + 1, lido: notaDaPlanilha(linha.getCell(modulo.coluna).value) }));
    // Sem nenhuma nota lançada, não há o que importar
    if (!valores.some(({ lido }) => lido.nota !== null || lido.invalida)) continue;

    const cpfs = porNome.get(normalizarNome(nome));
    if (!cpfs || cpfs.size !== 1) {
      relatorio.notasSemAluno.push({ turma: codigo, linha: numero, nome, motivo: cpfs ? 'nome repetido na turma' : 'nome não encontrado na aba da turma' });
      continue;
    }

    const chave = `${[...cpfs][0]}|${codigo}`;
    const doAluno = notas.get(chave) ?? new Map<number, number>();
    for (const { ordem, lido } of valores) {
      if (lido.invalida) relatorio.notasInvalidas += 1;
      if (lido.nota !== null) doAluno.set(ordem, lido.nota);
    }
    notas.set(chave, doAluno);
  }
  return notas;
};

/** Primeiro valor preenchido, na ordem das linhas. */
const primeiro = <T>(linhas: LinhaAluno[], pegar: (linha: LinhaAluno) => T | null | undefined) => {
  for (const linha of linhas) {
    const valor = pegar(linha);
    if (valor !== null && valor !== undefined && valor !== '') return valor;
  }
  return null;
};

const montarPessoa = (cpf: string, linhas: LinhaAluno[]): Pessoa => {
  // Dados pessoais: a turma mais recente primeiro
  const recentes = [...linhas].sort((a, b) => (b.dataInicio?.getTime() ?? 0) - (a.dataInicio?.getTime() ?? 0) || melhorPrimeiro(a, b));
  const documentos = new Set(linhas.flatMap((linha) => linha.documentos));
  const comEndereco = recentes.find((linha) => linha.endereco.rua || linha.endereco.cidade)?.endereco;
  const pastaLink = primeiro(recentes, (linha) => linha.pastaLink);

  return {
    cpf,
    linhas,
    documentos,
    coleta: {
      data: primeiro(recentes, (linha) => linha.coletaData),
      quem: primeiro(recentes, (linha) => linha.coletaQuem),
      link: pastaLink,
    },
    dados: {
      nome: recentes[0].nome,
      email: primeiro(recentes, (linha) => linha.email),
      telefone: primeiro(recentes, (linha) => linha.telefone),
      dataNascimento: primeiro(recentes, (linha) => linha.dataNascimento),
      nacionalidade: NACIONALIDADE_PADRAO,
      naturalidade: primeiro(recentes, (linha) => linha.naturalidade),
      filiacao: primeiro(recentes, (linha) => linha.filiacao),
      rgNumero: primeiro(recentes, (linha) => linha.rgNumero),
      rgOrgaoEmissor: primeiro(recentes, (linha) => linha.rgOrgaoEmissor),
      condicaoGraduacao: condicaoPelosDocumentos(documentos),
      enderecoRua: comEndereco?.rua ?? null,
      enderecoNumero: comEndereco?.numero ?? null,
      enderecoComplemento: comEndereco?.complemento ?? null,
      enderecoBairro: comEndereco?.bairro ?? null,
      enderecoCep: comEndereco?.cep ?? null,
      enderecoCidade: comEndereco?.cidade ?? null,
      enderecoEstado: comEndereco?.estado ?? null,
      grupoWhatsapp: primeiro(recentes, (linha) => linha.grupoWhatsapp),
      ganhouCamiseta: primeiro(recentes, (linha) => linha.ganhouCamiseta),
      driveFolderId: pastaDoDrive(pastaLink),
    },
  };
};

const planejar = (livro: ExcelJS.Workbook, hoje: Date): Plano => {
  const relatorio: Relatorio = {
    linhasIgnoradas: [],
    duplicadas: [],
    notasSemAluno: [],
    certificadosNaoEntendidos: [],
    situacoesNaoReconhecidas: new Map(),
    notasInvalidas: 0,
    lotesFuturos: 0,
    lotesPelaEntrega: 0,
  };

  const abasDeTurma = livro.worksheets.filter((aba) => ehAbaDeTurma(textosDaLinha(aba, 1)));
  const lidas = abasDeTurma.flatMap((aba) => lerAbaTurma(aba, hoje, relatorio));
  const abaAlunos = lerAbaAlunos(abaPorNome(livro, 'Alunos'));
  const codigos = new Set(abasDeTurma.map((aba) => aba.name.trim().toUpperCase()));

  // Aba "Alunos": completa nº de matrícula, e-mail e situação que faltarem na aba da turma
  const chaves = new Set(lidas.map((linha) => `${linha.cpf}|${linha.turma}`));
  for (const linha of lidas) {
    const extra = abaAlunos.get(`${linha.cpf}|${linha.turma}`);
    if (!extra) continue;
    linha.numeroMatricula ??= extra.numeroMatricula;
    linha.email ??= extra.email;
    if (!linha.statusOriginal && extra.status) {
      linha.situacao = situacaoDaPlanilha(extra.status, extra.quitado).situacao;
      linha.statusOriginal = extra.status;
    }
  }
  for (const [chave, extra] of abaAlunos) {
    const [cpf, turma] = chave.split('|');
    if (!chaves.has(chave) && codigos.has(turma) && extra.nome) lidas.push(linhaMinima(turma, cpf, extra));
  }

  // Uma linha por aluno em cada turma
  const porMatricula = new Map<string, LinhaAluno[]>();
  for (const linha of lidas) {
    const chave = `${linha.cpf}|${linha.turma}`;
    porMatricula.set(chave, [...(porMatricula.get(chave) ?? []), linha]);
  }
  const escolhidas: LinhaAluno[] = [];
  for (const repetidas of porMatricula.values()) {
    const [melhor, ...descartadas] = [...repetidas].sort(melhorPrimeiro);
    if (descartadas.length) {
      // Os documentos conferidos em qualquer das linhas valem
      melhor.documentos = [...new Set(repetidas.flatMap((linha) => linha.documentos))];
      melhor.numeroMatricula ??= primeiro(descartadas, (linha) => linha.numeroMatricula);
      melhor.dataLote ??= primeiro(descartadas, (linha) => linha.dataLote);
      melhor.certificadoDigital ||= primeiro(descartadas, (linha) => linha.certificadoDigital) ?? '';
      relatorio.duplicadas.push({
        turma: melhor.turma,
        cpf: melhor.cpf,
        escolhida: melhor.linha,
        descartadas: descartadas.map((linha) => `${linha.linha} (${linha.statusOriginal || 'sem status'})`).join(', '),
      });
    }
    escolhidas.push(melhor);
  }

  const porTurma = new Map<string, LinhaAluno[]>();
  for (const linha of escolhidas) porTurma.set(linha.turma, [...(porTurma.get(linha.turma) ?? []), linha]);
  const turmas = [...codigos].map((codigo) => planejarTurma(livro, codigo, porTurma.get(codigo) ?? [], hoje));

  const notas = new Map<string, Map<number, number>>();
  for (const [codigo, linhas] of porTurma) for (const [chave, valor] of lerNotas(livro, codigo, linhas, relatorio)) notas.set(chave, valor);

  const porCpf = new Map<string, LinhaAluno[]>();
  for (const linha of escolhidas) porCpf.set(linha.cpf, [...(porCpf.get(linha.cpf) ?? []), linha]);
  const pessoas = [...porCpf].map(([cpf, linhas]) => montarPessoa(cpf, linhas));

  // Lotes antigos: um por mês em que os certificados foram para a certificadora
  const lotes = new Map<string, { datas: Date[]; itens: LotePlano['itens'] }>();
  for (const linha of escolhidas) {
    let dataLote = linha.dataLote;
    const digital = certificadoDigitalDaPlanilha(linha.certificadoDigital, dataLote, hoje);
    if (linha.certificadoDigital && digital?.situacao === 'desconhecido') {
      relatorio.certificadosNaoEntendidos.push({ turma: linha.turma, linha: linha.linha, texto: linha.certificadoDigital });
    }
    if (!dataLote && digital?.data) {
      // Sem a data de envio à certificadora: o lote fica no mês da entrega
      dataLote = digital.data;
      relatorio.lotesPelaEntrega += 1;
    }
    if (!dataLote) continue;
    if (dataLote > hoje) {
      relatorio.lotesFuturos += 1;
      continue;
    }
    const referencia = referenciaMes(dataLote);
    const lote = lotes.get(referencia) ?? { datas: [], itens: [] };
    lote.datas.push(dataLote);
    lote.itens.push({ chave: `${linha.cpf}|${linha.turma}`, digital });
    lotes.set(referencia, lote);
  }

  return {
    turmas,
    pessoas,
    notas,
    lotes: [...lotes]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([referencia, lote]) => ({ referencia, enviadoEm: dataMaisFrequente(lote.datas) as Date, itens: lote.itens })),
    relatorio,
    linhasLidas: lidas.length + relatorio.linhasIgnoradas.length,
  };
};

const contar = <T>(itens: T[], chave: (item: T) => string) => {
  const contagem: Record<string, number> = {};
  for (const item of itens) contagem[chave(item)] = (contagem[chave(item)] ?? 0) + 1;
  return contagem;
};

const dataBr = (data: Date) => data.toISOString().slice(0, 10).split('-').reverse().join('/');

/** Resumo sem dados pessoais (vai para o console e para o resumo.json). */
const resumir = (plano: Plano) => {
  const linhas = plano.pessoas.flatMap((pessoa) => pessoa.linhas);
  const ignoradas = contar(plano.relatorio.linhasIgnoradas, (linha) => linha.motivo);
  return {
    turmas: plano.turmas.map((turma) => ({
      codigo: turma.codigo,
      nome: turma.nome,
      alunos: turma.alunos,
      modulos: turma.modulos.length,
      origemModulos: turma.origemModulos,
      periodo: `${dataBr(turma.dataInicio)} a ${dataBr(turma.dataFim)} (${turma.periodo})`,
      ativa: turma.ativa,
      alunosComNotas: [...plano.notas.keys()].filter((chave) => chave.endsWith(`|${turma.codigo}`)).length,
    })),
    linhas: {
      lidas: plano.linhasLidas,
      ignoradas,
      repetidasNaMesmaTurma: plano.relatorio.duplicadas.reduce((total, item) => total + item.descartadas.split(',').length, 0),
      matriculas: linhas.length,
      alunosUnicos: plano.pessoas.length,
      alunosEmMaisDeUmaTurma: plano.pessoas.filter((pessoa) => pessoa.linhas.length > 1).length,
      semEmail: plano.pessoas.filter((pessoa) => !pessoa.dados.email).length,
      enderecosCorrigidos: linhas.filter((linha) => linha.enderecoCorrigido).length,
      migracoes: { entrou: linhas.filter((linha) => linha.entrouPorMigracao).length, saiu: linhas.filter((linha) => linha.saiuPorMigracao).length },
    },
    situacoes: contar(linhas, (linha) => linha.situacao),
    situacoesNaoReconhecidas: Object.fromEntries(plano.relatorio.situacoesNaoReconhecidas),
    documentosConferidos: contar(
      plano.pessoas.flatMap((pessoa) => [...pessoa.documentos]),
      (tipo) => tipo,
    ),
    dadosDoHistoricoCompletos: plano.pessoas.filter((pessoa) =>
      [pessoa.dados.rgNumero, pessoa.dados.rgOrgaoEmissor, pessoa.dados.dataNascimento, pessoa.dados.naturalidade, pessoa.dados.filiacao].every(Boolean),
    ).length,
    notas: {
      alunos: plano.notas.size,
      notas: [...plano.notas.values()].reduce((total, notas) => total + notas.size, 0),
      invalidas: plano.relatorio.notasInvalidas,
      linhasSemAlunoCorrespondente: plano.relatorio.notasSemAluno.length,
    },
    lotes: plano.lotes.map((lote) => ({
      referencia: lote.referencia,
      alunos: lote.itens.length,
      entregues: lote.itens.filter((item) => item.digital?.situacao === 'entregue').length,
      recebidos: lote.itens.filter((item) => item.digital?.situacao === 'recebido').length,
    })),
    certificados: {
      lotesPelaDataDeEntrega: plano.relatorio.lotesPelaEntrega,
      comDataFutura: plano.relatorio.lotesFuturos,
      textosNaoEntendidos: plano.relatorio.certificadosNaoEntendidos.length,
    },
  };
};

const imprimirResumo = (resumo: ReturnType<typeof resumir>) => {
  console.info(`\nTurmas (${resumo.turmas.length}):`);
  for (const turma of resumo.turmas) {
    console.info(
      `  ${turma.codigo.padEnd(5)} ${String(turma.alunos).padStart(5)} alunos | ${String(turma.modulos).padStart(2)} módulos (${turma.origemModulos}) | ${turma.periodo}${
        turma.ativa ? ' | ativa' : ''
      } | notas de ${turma.alunosComNotas} aluno(s)`,
    );
  }
  const { linhas } = resumo;
  console.info(`\nLinhas de aluno lidas: ${linhas.lidas} | ignoradas: ${JSON.stringify(linhas.ignoradas)} | repetidas na mesma turma (ficou 1): ${linhas.repetidasNaMesmaTurma}`);
  console.info(`Alunos únicos: ${linhas.alunosUnicos} (${linhas.alunosEmMaisDeUmaTurma} em mais de uma turma) | matrículas: ${linhas.matriculas} | sem e-mail: ${linhas.semEmail}`);
  console.info(`Endereços corrigidos: ${linhas.enderecosCorrigidos} | migração: entrou ${linhas.migracoes.entrou}, saiu ${linhas.migracoes.saiu}`);
  console.info(`Situação: ${JSON.stringify(resumo.situacoes)} | não reconhecidas (viraram "Em dia"): ${JSON.stringify(resumo.situacoesNaoReconhecidas)}`);
  console.info(`Documentos conferidos: ${JSON.stringify(resumo.documentosConferidos)}`);
  console.info(`Alunos com todos os dados do histórico: ${resumo.dadosDoHistoricoCompletos}`);
  console.info(
    `Notas: ${resumo.notas.notas} de ${resumo.notas.alunos} aluno(s) | inválidas: ${resumo.notas.invalidas} | linhas sem aluno correspondente: ${resumo.notas.linhasSemAlunoCorrespondente}`,
  );
  console.info(
    `Lotes antigos: ${resumo.lotes.length} (${resumo.lotes.reduce((total, lote) => total + lote.alunos, 0)} alunos, ${resumo.lotes.reduce(
      (total, lote) => total + lote.entregues,
      0,
    )} com certificado digital entregue) | certificados com texto não entendido: ${resumo.certificados.textosNaoEntendidos}`,
  );
};

const campoCsv = (valor: unknown) => `"${String(valor ?? '').replace(/"/g, '""')}"`;
export const csv = (cabecalho: string[], linhas: unknown[][]) => `\uFEFF${[cabecalho, ...linhas].map((linha) => linha.map(campoCsv).join(';')).join('\r\n')}`;

/** Relatório detalhado (com nomes e CPFs) na pasta de armazenamento da API, fora do git. */
const salvarRelatorio = async (pasta: string, plano: Plano, resumo: ReturnType<typeof resumir>) => {
  await mkdir(pasta, { recursive: true });
  const { relatorio } = plano;
  await Promise.all([
    writeFile(join(pasta, 'resumo.json'), JSON.stringify(resumo, null, 2)),
    writeFile(join(pasta, 'linhas-ignoradas.csv'), csv(['Turma', 'Linha', 'Nome', 'Motivo'], relatorio.linhasIgnoradas.map((item) => [item.turma, item.linha, item.nome, item.motivo]))),
    writeFile(
      join(pasta, 'repetidas-na-mesma-turma.csv'),
      csv(['Turma', 'CPF', 'Linha usada', 'Linhas descartadas'], relatorio.duplicadas.map((item) => [item.turma, item.cpf, item.escolhida, item.descartadas])),
    ),
    writeFile(join(pasta, 'notas-sem-aluno.csv'), csv(['Turma', 'Linha', 'Nome na aba de notas', 'Motivo'], relatorio.notasSemAluno.map((item) => [item.turma, item.linha, item.nome, item.motivo]))),
    writeFile(
      join(pasta, 'certificados-nao-entendidos.csv'),
      csv(['Turma', 'Linha', 'Texto'], relatorio.certificadosNaoEntendidos.map((item) => [item.turma, item.linha, item.texto])),
    ),
  ]);
};

const aplicarPlano = async (plano: Plano) => {
  const agora = new Date();
  const resultado = {
    turmasCriadas: 0,
    modulosCriados: 0,
    alunosCriados: 0,
    alunosCompletados: 0,
    matriculasCriadas: 0,
    documentosCriados: 0,
    notasCriadas: 0,
    lotesCriados: 0,
    alunosEmLotes: 0,
    historicosGerados: 0,
  };

  // Turmas e módulos (módulos só se a turma ainda não tiver nenhum)
  const turmas = new Map<string, { id: string; dataInicio: Date; disciplinas: Map<number, string> }>();
  for (const turma of plano.turmas) {
    let registro = await prisma.turma.findUnique({ where: { codigo: turma.codigo }, select: { id: true, dataInicio: true } });
    if (!registro) {
      registro = await prisma.turma.create({
        data: {
          codigo: turma.codigo,
          nome: turma.nome,
          curso: turma.curso,
          resolucaoMec: turma.resolucaoMec,
          cargaHoraria: turma.cargaHoraria,
          dataInicio: turma.dataInicio,
          dataFim: turma.dataFim,
          ativa: turma.ativa,
        },
        select: { id: true, dataInicio: true },
      });
      resultado.turmasCriadas += 1;
    }
    if (turma.modulos.length && (await prisma.disciplina.count({ where: { turmaId: registro.id } })) === 0) {
      await prisma.disciplina.createMany({
        data: turma.modulos.map((modulo, indice) => ({
          turmaId: registro!.id,
          ordem: indice + 1,
          nome: modulo.nome,
          cargaHoraria: modulo.cargaHoraria ?? 0,
          docente: modulo.docente,
          titulacao: modulo.titulacao,
        })),
      });
      resultado.modulosCriados += turma.modulos.length;
    }
    const disciplinas = await prisma.disciplina.findMany({ where: { turmaId: registro.id }, select: { id: true, ordem: true } });
    turmas.set(turma.codigo, { id: registro.id, dataInicio: registro.dataInicio, disciplinas: new Map(disciplinas.map((item) => [item.ordem, item.id])) });
  }

  // Alunos, documentos conferidos, matrículas e notas (um aluno por transação)
  const matriculas = new Map<string, string>();
  const alunosImportados: string[] = [];
  for (const [indice, pessoa] of plano.pessoas.entries()) {
    await prisma.$transaction(
      async (tx) => {
        const existente = await tx.aluno.findUnique({
          where: { cpf: pessoa.cpf },
          include: { documentos: { select: { tipo: true } }, matriculas: { select: { id: true, turmaId: true, numeroMatricula: true } } },
        });

        let alunoId: string;
        if (!existente) {
          const criado = await tx.aluno.create({ data: { ...pessoa.dados, email: pessoa.dados.email ?? '', cpf: pessoa.cpf, importadoEm: agora } });
          alunoId = criado.id;
          resultado.alunosCriados += 1;
        } else {
          alunoId = existente.id;
          // Só completa o que estiver vazio: o que já foi cadastrado no sistema prevalece
          const atuais = existente as unknown as Record<string, unknown>;
          const faltando = Object.fromEntries(
            Object.entries(pessoa.dados).filter(([campo, valor]) => valor !== null && campo !== 'condicaoGraduacao' && (atuais[campo] === null || atuais[campo] === '')),
          );
          if (Object.keys(faltando).length) {
            await tx.aluno.update({ where: { id: alunoId }, data: faltando });
            resultado.alunosCompletados += 1;
          }
        }

        const tiposExistentes = new Set(existente?.documentos.map((documento) => documento.tipo) ?? []);
        const novos = [...pessoa.documentos].filter((tipo) => !tiposExistentes.has(tipo));
        if (novos.length) {
          const { data, quem, link } = pessoa.coleta;
          await tx.documento.createMany({
            data: novos.map((tipo) => ({
              alunoId,
              tipo,
              nomeArquivo: quem ? `Conferido na planilha antiga (${quem})` : 'Conferido na planilha antiga',
              mimeType: MIME_EXTERNO,
              tamanho: 0,
              arquivoRef: `${PREFIXO_EXTERNO}${link ?? ''}`,
              driveLink: link,
              status: 'APROVADO' as const,
              analisadoEm: data ?? agora,
              criadoEm: data ?? agora,
            })),
          });
          resultado.documentosCriados += novos.length;
        }

        for (const linha of pessoa.linhas) {
          const turma = turmas.get(linha.turma);
          if (!turma) continue;
          const atual = existente?.matriculas.find((matricula) => matricula.turmaId === turma.id);
          let matriculaId = atual?.id;
          if (!matriculaId) {
            const criada = await tx.matricula.create({
              data: {
                alunoId,
                turmaId: turma.id,
                numeroMatricula: linha.numeroMatricula,
                situacao: linha.situacao,
                situacaoAtualizadaEm: agora,
                dataInclusao: linha.dataInicio ?? turma.dataInicio,
                dataCancelamento: linha.situacao === 'CANCELADO' ? linha.dataCancelamento : null,
                entrouPorMigracao: linha.entrouPorMigracao,
                saiuPorMigracao: linha.saiuPorMigracao,
              },
            });
            matriculaId = criada.id;
            resultado.matriculasCriadas += 1;
          } else if (!atual?.numeroMatricula && linha.numeroMatricula) {
            await tx.matricula.update({ where: { id: matriculaId }, data: { numeroMatricula: linha.numeroMatricula } });
          }
          matriculas.set(`${pessoa.cpf}|${linha.turma}`, matriculaId);

          const notas = plano.notas.get(`${pessoa.cpf}|${linha.turma}`);
          if (notas?.size) {
            const dados = [...notas].flatMap(([ordem, media]) => {
              const disciplinaId = turma.disciplinas.get(ordem);
              // Curso EAD: frequência sempre 100%
              return disciplinaId ? [{ alunoId, disciplinaId, media, frequencia: 100, origem: 'MANUAL' as const, importadoEm: agora }] : [];
            });
            const { count } = await tx.nota.createMany({ data: dados, skipDuplicates: true });
            resultado.notasCriadas += count;
          }
        }
        alunosImportados.push(alunoId);
      },
      { timeout: 60_000 },
    );
    if ((indice + 1) % 500 === 0) console.info(`  ... ${indice + 1} de ${plano.pessoas.length} alunos gravados`);
  }

  // Lotes antigos (não geram alertas de prazo)
  for (const lote of plano.lotes) {
    // Só alunos que ainda não estão em nenhum lote (as remessas das certificadoras podem ter reorganizado os lotes)
    const novos: Array<{ matriculaId: string; digital: CertificadoDigitalLido | null }> = [];
    for (const item of lote.itens) {
      const matriculaId = matriculas.get(item.chave);
      if (matriculaId && !(await prisma.itemLote.findUnique({ where: { matriculaId }, select: { id: true } }))) novos.push({ matriculaId, digital: item.digital });
    }

    let registro = await prisma.loteCertificacao.findFirst({ where: { referencia: lote.referencia, importado: true, certificadoraId: null }, select: { id: true } });
    if (!registro && !novos.length) continue;
    if (!registro) {
      registro = await prisma.loteCertificacao.create({
        data: {
          referencia: lote.referencia,
          status: 'ENVIADO',
          enviadoEm: lote.enviadoEm,
          prazoEm: new Date(lote.enviadoEm.getTime() + config.certificacao.prazoDias * DIA),
          importado: true,
        },
        select: { id: true },
      });
      resultado.lotesCriados += 1;
    }

    for (const { matriculaId, digital } of novos) {
      const emitido = digital && digital.situacao !== 'desconhecido' ? digital.data : null;
      const entregue = digital?.situacao === 'entregue' ? digital.data : null;
      await prisma.itemLote.create({
        data: { loteId: registro.id, matriculaId, certificadoEmitidoEm: emitido, certificadoEnviadoEm: entregue, certificadoCanal: entregue ? 'manual' : null },
      });
      resultado.alunosEmLotes += 1;
    }

    const itens = await prisma.itemLote.findMany({ where: { loteId: registro.id }, select: { certificadoEmitidoEm: true } });
    const pendentes = itens.filter((item) => !item.certificadoEmitidoEm).length;
    const ultimo = itens.reduce<Date | null>(
      (maior, item) => (item.certificadoEmitidoEm && (!maior || item.certificadoEmitidoEm > maior) ? item.certificadoEmitidoEm : maior),
      null,
    );
    await prisma.loteCertificacao.update({
      where: { id: registro.id },
      data: itens.length && pendentes === 0 ? { status: 'CONCLUIDO', concluidoEm: ultimo } : { status: 'ENVIADO', concluidoEm: null },
    });
  }

  // Semáforo de cada aluno e histórico final de quem já concluiu todos os módulos
  console.info('  Atualizando a situação dos alunos e gerando os históricos de quem concluiu...');
  for (const [indice, alunoId] of alunosImportados.entries()) {
    await atualizarSituacaoAluno(alunoId);
    for (const { id } of await prisma.matricula.findMany({ where: { alunoId }, select: { id: true } })) {
      await gerarHistoricoFinal(id);
    }
    if ((indice + 1) % 500 === 0) console.info(`  ... ${indice + 1} de ${alunosImportados.length} alunos`);
  }
  resultado.historicosGerados = await prisma.matricula.count({ where: { historicoRef: { not: null }, alunoId: { in: alunosImportados } } });

  return resultado;
};

/**
 * Lê a planilha, mostra o resumo e grava o relatório detalhado em STORAGE_DIR/importacao/<data>.
 * Só grava no banco com `aplicar: true`.
 */
export const importarPlanilha = async ({ arquivo, aplicar, hoje = new Date() }: { arquivo: string; aplicar: boolean; hoje?: Date }) => {
  console.info(`Lendo ${basename(arquivo)}...`);
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.readFile(arquivo);

  const plano = planejar(livro, hoje);
  const resumo = resumir(plano);
  imprimirResumo(resumo);

  const pasta = resolve(config.storageDir, 'importacao', new Date().toISOString().replace(/[:.]/g, '-'));
  await salvarRelatorio(pasta, plano, resumo);
  console.info(`\nRelatório detalhado (com nomes, fica fora do git): ${pasta}`);

  if (!aplicar) {
    console.info('Simulação: nada foi gravado. Confira o relatório e rode de novo com --aplicar.');
    return { resumo, pasta, aplicado: null };
  }

  console.info('\nGravando no banco...');
  const aplicado = await aplicarPlano(plano);
  await registrarAuditoria({ acao: 'IMPORTAR_PLANILHA', entidade: 'Sistema', entidadeId: 'planilha-antiga', detalhes: { arquivo: basename(arquivo), ...aplicado } });
  await writeFile(join(pasta, 'aplicado.json'), JSON.stringify(aplicado, null, 2));
  console.info(`Concluído: ${JSON.stringify(aplicado)}`);
  return { resumo, pasta, aplicado };
};
