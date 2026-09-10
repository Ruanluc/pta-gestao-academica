require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');

const { gerarPdfHistorico, nomeModulo, numeroRomano, textoPdf } = require('../dist/lib/historico');

const dadosBase = (quantidadeModulos, concluido = true) => ({
  instituicao: 'Instituição de Teste',
  aluno: {
    nome: 'João Conceição Araújo',
    cpf: '52998224725',
    rgNumero: '12.345.678-9',
    rgOrgaoEmissor: 'SSP/SP',
    dataNascimento: new Date('1990-05-20T00:00:00Z'),
    nacionalidade: 'Brasileiro(a)',
    naturalidade: 'São Paulo - SP',
    filiacao: 'Maria da Conceição e José Araújo',
  },
  turma: {
    nome: 'Biomecânica, Musculação e Reabilitação Musculoesquelética - B7',
    curso: 'Biomecânica, Musculação e Reabilitação Musculoesquelética',
    resolucaoMec: null,
    cargaHoraria: 360,
    dataInicio: new Date('2026-02-01T00:00:00Z'),
    dataFim: new Date('2027-02-01T00:00:00Z'),
  },
  disciplinas: Array.from({ length: quantidadeModulos }, (_, indice) => ({
    ordem: indice + 1,
    nome: `Emagrecimento na musculação: como utilizar métodos e técnicas diferenciadas para garantir o resultado do seu cliente ${indice + 1}`,
    cargaHoraria: 20,
    docente: 'Luciana Costa',
    titulacao: 'Mestre',
    media: 85.5,
    frequencia: 100,
    situacao: 'APROVADO',
  })),
  regras: { mediaMinima: 70, frequenciaMinima: 75 },
  concluido,
  emitidoEm: new Date(),
});

test('textoPdf mantém acentos e remove caracteres fora do WinAnsi', () => {
  assert.equal(textoPdf('Histórico – ação 🎓'), 'Histórico - ação ');
  assert.equal(textoPdf('linha\nquebrada'), 'linha quebrada');
});

test('numeração romana dos módulos, como no modelo', () => {
  assert.deepEqual([1, 4, 9, 10, 14, 18].map(numeroRomano), ['I', 'IV', 'IX', 'X', 'XIV', 'XVIII']);
  assert.equal(nomeModulo(3, 'Análise biomecânica'), 'Módulo III - Análise biomecânica');
  assert.equal(nomeModulo(10, 'MÓDULO X - Doenças e lesões'), 'MÓDULO X - Doenças e lesões');
});

test('turma completa com 18 módulos cabe em uma página A4 paisagem', async () => {
  const documento = await PDFDocument.load(await gerarPdfHistorico(dadosBase(18)));
  assert.equal(documento.getPageCount(), 1);
  const { width, height } = documento.getPage(0).getSize();
  assert.ok(width > height, 'página em paisagem');
});

test('prévia (curso não concluído) também gera PDF válido', async () => {
  const pdf = await gerarPdfHistorico(dadosBase(3, false));
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
});

test('quebra em várias páginas quando há muitos módulos', async () => {
  const documento = await PDFDocument.load(await gerarPdfHistorico(dadosBase(45)));
  assert.ok(documento.getPageCount() >= 2);
});
