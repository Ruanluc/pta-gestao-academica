import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { SituacaoDisciplina } from './semaforo';

/*
 * Histórico escolar no modelo exigido pela certificadora (planilha "Histórico escolar do curso de
 * especialização"): cabeçalho em grade com os dados do aluno, quadro de título com a resolução e a
 * tabela Disciplinas | CH | Corpo Docente | Titulação | Frequência | Média, em A4 paisagem.
 */

export type DisciplinaHistorico = {
  ordem: number;
  nome: string;
  cargaHoraria: number;
  docente: string | null;
  titulacao: string | null;
  media: number | null;
  frequencia: number | null;
  situacao: SituacaoDisciplina;
};

export type DadosHistorico = {
  instituicao: string;
  aluno: {
    nome: string;
    cpf: string;
    rgNumero: string | null;
    rgOrgaoEmissor: string | null;
    dataNascimento: Date | null;
    nacionalidade: string | null;
    naturalidade: string | null;
    filiacao: string | null;
  };
  turma: {
    /** Sai em "Pós-Graduado no curso de:" (ex.: "Biomecânica... - B7") */
    nome: string;
    /** Sai no título; vazio = usa o nome da turma */
    curso: string | null;
    resolucaoMec: string | null;
    cargaHoraria: number;
    dataInicio: Date;
    dataFim: Date;
  };
  disciplinas: DisciplinaHistorico[];
  regras: { mediaMinima: number; frequenciaMinima: number };
  concluido: boolean;
  emitidoEm: Date;
};

export const RESOLUCAO_PADRAO = 'resolução CES/CNE nº 1, de 06 de Abril de 2018';

const PAGINA: [number, number] = [841.89, 595.28]; // A4 paisagem
const MARGEM_X = 28;
const MARGEM_Y = 30;
const LARGURA = PAGINA[0] - MARGEM_X * 2;

const PRETO = rgb(0, 0, 0);
const GRADE = rgb(0.72, 0.72, 0.72);
const AZUL_NOME = rgb(0.851, 0.882, 0.949); // fundo do campo "Nome" no modelo
const VERMELHO = rgb(0.75, 0.1, 0.1);

const SUBSTITUICOES: Record<string, string> = {
  '–': '-',
  '—': '-',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '…': '...',
  '•': '-',
};

/** As fontes padrão do PDF usam WinAnsi: mantém acentos do português e troca o que não for suportado. */
export const textoPdf = (valor: unknown) =>
  String(valor ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, (caractere) => SUBSTITUICOES[caractere] ?? '');

const ROMANOS: Array<[number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export const numeroRomano = (numero: number) => {
  let restante = Math.max(0, Math.floor(numero));
  let resultado = '';
  for (const [valor, simbolo] of ROMANOS) {
    while (restante >= valor) {
      resultado += simbolo;
      restante -= valor;
    }
  }
  return resultado;
};

/** "Módulo IV - <nome>", a não ser que o nome cadastrado já comece com "Módulo". */
export const nomeModulo = (ordem: number, nome: string) =>
  /^m[óo]dulo\b/i.test(nome.trim()) ? nome.trim() : `Módulo ${numeroRomano(ordem)} - ${nome.trim()}`;

const formatarData = (data: Date | null | undefined) =>
  data ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(data) : '-';

const valorOuTraco = (valor: string | null | undefined) => (valor && valor.trim() ? valor.trim() : '-');

const formatarDecimal = (valor: number) => (Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace('.', ','));

const formatarMedia = (valor: number | null) => (valor === null ? '-' : formatarDecimal(valor));

const formatarFrequencia = (valor: number | null) => (valor === null ? '-' : `${formatarDecimal(valor)}%`);

/** Maior tamanho de fonte (entre máximo e mínimo) em que o texto cabe em uma linha. */
const tamanhoQueCabe = (texto: string, fonte: PDFFont, largura: number, maximo: number, minimo: number) => {
  let tamanho = maximo;
  while (tamanho > minimo && fonte.widthOfTextAtSize(texto, tamanho) > largura) tamanho -= 0.25;
  return tamanho;
};

const truncar = (texto: string, fonte: PDFFont, tamanho: number, largura: number) => {
  if (fonte.widthOfTextAtSize(texto, tamanho) <= largura) return texto;
  let fim = texto.length;
  while (fim > 0 && fonte.widthOfTextAtSize(`${texto.slice(0, fim)}...`, tamanho) > largura) fim -= 1;
  return `${texto.slice(0, fim)}...`;
};

const quebrarTexto = (texto: string, fonte: PDFFont, tamanho: number, largura: number) => {
  const cabe = (trecho: string) => fonte.widthOfTextAtSize(trecho, tamanho) <= largura;
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of texto.split(' ').filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (cabe(tentativa)) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    atual = palavra;
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [''];
};

type Coluna = { titulo: string; largura: number; alinhamento: 'esquerda' | 'centro' };

const LARGURAS_FIXAS = { ch: 30, docente: 112, titulacao: 80, frequencia: 70, media: 58 };

const COLUNAS: Coluna[] = [
  {
    titulo: 'Disciplinas',
    largura: LARGURA - Object.values(LARGURAS_FIXAS).reduce((total, largura) => total + largura, 0),
    alinhamento: 'esquerda',
  },
  { titulo: 'CH', largura: LARGURAS_FIXAS.ch, alinhamento: 'centro' },
  { titulo: 'Corpo Docente', largura: LARGURAS_FIXAS.docente, alinhamento: 'esquerda' },
  { titulo: 'Titulação', largura: LARGURAS_FIXAS.titulacao, alinhamento: 'esquerda' },
  { titulo: 'Frequência', largura: LARGURAS_FIXAS.frequencia, alinhamento: 'centro' },
  { titulo: 'Média', largura: LARGURAS_FIXAS.media, alinhamento: 'centro' },
];

export const gerarPdfHistorico = async (dados: DadosHistorico): Promise<Buffer> => {
  const pdf = await PDFDocument.create();
  pdf.setTitle(textoPdf(`Histórico escolar - ${dados.aluno.nome}`));
  pdf.setAuthor(textoPdf(dados.instituicao));
  pdf.setCreationDate(dados.emitidoEm);

  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);

  let pagina: PDFPage = pdf.addPage(PAGINA);
  let y = PAGINA[1] - MARGEM_Y;

  const escrever = (texto: string, x: number, base: number, tamanho: number, fonteTexto: PDFFont, cor = PRETO) => {
    pagina.drawText(texto, { x, y: base, size: tamanho, font: fonteTexto, color: cor });
  };

  /** Escreve dentro de uma largura: diminui a fonte até caber (mínimo 6,5) e, se ainda assim não couber, corta. */
  const escreverAjustado = (
    valor: string,
    x: number,
    base: number,
    largura: number,
    { tamanho = 9, fonteTexto = fonte, alinharDireita = false }: { tamanho?: number; fonteTexto?: PDFFont; alinharDireita?: boolean } = {},
  ) => {
    const texto = textoPdf(valor);
    const tamanhoFinal = tamanhoQueCabe(texto, fonteTexto, largura, tamanho, 6.5);
    const final = truncar(texto, fonteTexto, tamanhoFinal, largura);
    const deslocamento = alinharDireita ? largura - fonteTexto.widthOfTextAtSize(final, tamanhoFinal) : 0;
    escrever(final, x + deslocamento, base, tamanhoFinal, fonteTexto);
  };

  const linha = (x1: number, y1: number, x2: number, y2: number, cor = GRADE, espessura = 0.5) => {
    pagina.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: espessura, color: cor });
  };

  const moldura = (topo: number, altura: number) => {
    pagina.drawRectangle({ x: MARGEM_X, y: topo - altura, width: LARGURA, height: altura, borderColor: PRETO, borderWidth: 0.8 });
  };

  // Aviso só na prévia (curso não concluído). O histórico final segue o modelo sem acréscimos.
  if (!dados.concluido) {
    escrever(textoPdf('PRÉVIA - curso não concluído, não válido para certificação'), MARGEM_X, y - 8, 8, negrito, VERMELHO);
    y -= 16;
  }

  // ---------------------------------------------------------------- Cabeçalho (grade de dados do aluno)
  const { aluno, turma } = dados;
  const ALTURA_LINHA_CABECALHO = 17;
  const px = (pixels: number) => MARGEM_X + (pixels / 1225) * LARGURA; // posições medidas na planilha modelo

  type Celula = { texto: string; x: number; ate: number; negrito?: boolean; direita?: boolean; fundo?: boolean };
  const linhasCabecalho: Celula[][] = [
    [
      { texto: 'Nome:', x: px(4), ate: px(68), negrito: true },
      { texto: aluno.nome, x: px(74), ate: px(592), fundo: true },
      { texto: 'Nacionalidade:', x: px(600), ate: px(708), negrito: true },
      { texto: valorOuTraco(aluno.nacionalidade), x: px(711), ate: px(890) },
      { texto: 'Naturalidade:', x: px(895), ate: px(1030), negrito: true, direita: true },
      { texto: valorOuTraco(aluno.naturalidade), x: px(1033), ate: px(1222) },
    ],
    [
      { texto: 'Documento de Identidade:', x: px(4), ate: px(240), negrito: true },
      { texto: valorOuTraco(aluno.rgNumero), x: px(243), ate: px(445) },
      { texto: 'Órgão Emissor:', x: px(450), ate: px(550), negrito: true },
      { texto: valorOuTraco(aluno.rgOrgaoEmissor), x: px(553), ate: px(640) },
      { texto: 'Data de Nascimento:', x: px(645), ate: px(825), negrito: true, direita: true },
      { texto: formatarData(aluno.dataNascimento), x: px(828), ate: px(1222) },
    ],
    [
      { texto: 'Filiação:', x: px(4), ate: px(68), negrito: true },
      { texto: valorOuTraco(aluno.filiacao), x: px(74), ate: px(600) },
      { texto: 'Carga Horária:', x: px(605), ate: px(724), negrito: true, direita: true },
      { texto: `${turma.cargaHoraria} horas`, x: px(728), ate: px(1222) },
    ],
    [
      { texto: `Pós-Graduado no curso de: ${turma.nome}`, x: px(4), ate: px(770), negrito: true },
      { texto: 'Período de Realização:', x: px(780), ate: px(960), negrito: true },
      { texto: formatarData(turma.dataInicio), x: px(965), ate: px(1075), direita: true },
      { texto: 'à', x: px(1080), ate: px(1092) },
      { texto: formatarData(turma.dataFim), x: px(1098), ate: px(1222) },
    ],
  ];

  const alturaCabecalho = linhasCabecalho.length * ALTURA_LINHA_CABECALHO;
  const topoCabecalho = y;
  linhasCabecalho.forEach((celulas, indice) => {
    const topoLinha = topoCabecalho - indice * ALTURA_LINHA_CABECALHO;
    const base = topoLinha - 12;
    for (const celula of celulas) {
      if (celula.fundo) {
        pagina.drawRectangle({
          x: celula.x - 3,
          y: topoLinha - ALTURA_LINHA_CABECALHO + 1,
          width: celula.ate - celula.x + 3,
          height: ALTURA_LINHA_CABECALHO - 2,
          color: AZUL_NOME,
        });
      }
      escreverAjustado(celula.texto, celula.x, base, celula.ate - celula.x, {
        fonteTexto: celula.negrito ? negrito : fonte,
        alinharDireita: celula.direita,
      });
    }
    if (indice > 0) linha(MARGEM_X, topoLinha, MARGEM_X + LARGURA, topoLinha);
  });
  moldura(topoCabecalho, alturaCabecalho);
  y = topoCabecalho - alturaCabecalho - 14;

  // ---------------------------------------------------------------- Quadro do título
  const curso = turma.curso?.trim() || turma.nome;
  const resolucao = (turma.resolucaoMec?.trim() || RESOLUCAO_PADRAO).replace(/\.+$/, '');
  const alturaTitulo = 34;
  escreverAjustado(`HISTÓRICO ESCOLAR DO CURSO DE ESPECIALIZAÇÃO EM: ${curso}`, MARGEM_X + 4, y - 12, LARGURA - 8, {
    tamanho: 9.5,
    fonteTexto: negrito,
  });
  linha(MARGEM_X, y - 17, MARGEM_X + LARGURA, y - 17);
  escreverAjustado(`(Nas disposições da ${resolucao}.)`, MARGEM_X + 4, y - 29, LARGURA - 8);
  moldura(y, alturaTitulo);
  y -= alturaTitulo + 14;

  // ---------------------------------------------------------------- Tabela de módulos
  const ALTURA_CABECALHO_TABELA = 16;
  const ALTURA_LINHA = 15;
  const PADDING = 4;
  const TAMANHO_LINHA = 8.5;

  let topoTabela = y;

  const desenharCabecalhoTabela = () => {
    topoTabela = y;
    let x = MARGEM_X;
    for (const coluna of COLUNAS) {
      const texto = textoPdf(coluna.titulo);
      const largura = negrito.widthOfTextAtSize(texto, 8.5);
      const xTexto = coluna.titulo === 'Disciplinas' ? x + PADDING : x + (coluna.largura - largura) / 2;
      escrever(texto, xTexto, y - 11.5, 8.5, negrito);
      x += coluna.largura;
    }
    y -= ALTURA_CABECALHO_TABELA;
    linha(MARGEM_X, y, MARGEM_X + LARGURA, y, PRETO, 0.6);
  };

  const fecharTabela = () => {
    // Moldura e divisões verticais da tabela na página atual
    pagina.drawRectangle({ x: MARGEM_X, y, width: LARGURA, height: topoTabela - y, borderColor: PRETO, borderWidth: 0.8 });
    let x = MARGEM_X;
    for (const coluna of COLUNAS.slice(0, -1)) {
      x += coluna.largura;
      linha(x, topoTabela, x, y);
    }
  };

  desenharCabecalhoTabela();

  if (dados.disciplinas.length === 0) {
    escrever(textoPdf('Nenhum módulo cadastrado para esta turma.'), MARGEM_X + PADDING, y - 11, TAMANHO_LINHA, fonte);
    y -= ALTURA_LINHA;
  }

  for (const disciplina of dados.disciplinas) {
    const nome = textoPdf(nomeModulo(disciplina.ordem, disciplina.nome));
    const larguraNome = COLUNAS[0].largura - PADDING * 2;
    const tamanhoNome = tamanhoQueCabe(nome, fonte, larguraNome, TAMANHO_LINHA, 6.5);
    // Como na planilha, o módulo ocupa uma linha; só quebra se nem com fonte 6,5 couber
    const linhasNome = fonte.widthOfTextAtSize(nome, tamanhoNome) <= larguraNome ? [nome] : quebrarTexto(nome, fonte, 6.5, larguraNome);
    const altura = Math.max(ALTURA_LINHA, linhasNome.length * 9 + 6);

    if (y - altura < MARGEM_Y) {
      fecharTabela();
      pagina = pdf.addPage(PAGINA);
      y = PAGINA[1] - MARGEM_Y;
      desenharCabecalhoTabela();
    }

    const base = y - (altura - 8.5) / 2 - 6.5;
    linhasNome.forEach((trecho, indice) => {
      escrever(trecho, MARGEM_X + PADDING, linhasNome.length > 1 ? y - 9 - indice * 9 : base, linhasNome.length > 1 ? 6.5 : tamanhoNome, fonte);
    });

    const valores: Array<[string, Coluna]> = [
      [`${disciplina.cargaHoraria}H`, COLUNAS[1]],
      [valorOuTraco(disciplina.docente), COLUNAS[2]],
      [valorOuTraco(disciplina.titulacao), COLUNAS[3]],
      [formatarFrequencia(disciplina.frequencia), COLUNAS[4]],
      [formatarMedia(disciplina.media), COLUNAS[5]],
    ];

    let x = MARGEM_X + COLUNAS[0].largura;
    for (const [valor, coluna] of valores) {
      const texto = textoPdf(valor);
      const tamanho = tamanhoQueCabe(texto, fonte, coluna.largura - PADDING * 2, TAMANHO_LINHA, 6.5);
      const final = truncar(texto, fonte, tamanho, coluna.largura - PADDING * 2);
      const xTexto =
        coluna.alinhamento === 'centro' ? x + (coluna.largura - fonte.widthOfTextAtSize(final, tamanho)) / 2 : x + PADDING;
      escrever(final, xTexto, base, tamanho, fonte);
      x += coluna.largura;
    }

    y -= altura;
    linha(MARGEM_X, y, MARGEM_X + LARGURA, y);
  }

  fecharTabela();

  return Buffer.from(await pdf.save());
};
