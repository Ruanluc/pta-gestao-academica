require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');

const remessas = require('../dist/lib/planilhaRemessas');

const hoje = new Date('2026-09-11T00:00:00.000Z');

/** Monta a grade de texto (linha e coluna a partir de 1) a partir de { 'B3': 'texto' }. */
const grade = (celulas) => {
  const linhas = [];
  for (const [endereco, texto] of Object.entries(celulas)) {
    const [, letra, numero] = endereco.match(/^([A-Z])(\d+)$/);
    const coluna = letra.charCodeAt(0) - 64;
    linhas[Number(numero)] ??= [];
    linhas[Number(numero)][coluna] = texto;
  }
  return linhas;
};

test('andamento anotado ao lado do aluno', () => {
  assert.equal(remessas.andamentoDaRemessa('ENTREGUE'), 'ENTREGUE');
  assert.equal(remessas.andamentoDaRemessa('ok'), 'ENTREGUE');
  assert.equal(remessas.andamentoDaRemessa('ENTREGUE? historico emitido'), 'OUTRO');
  assert.equal(remessas.andamentoDaRemessa('RECEBEMOS 30/09'), 'RECEBIDO');
  assert.equal(remessas.andamentoDaRemessa('ENVIADO PARA IES'), 'NA_CERTIFICADORA');
  assert.equal(remessas.andamentoDaRemessa('VERIFICANDO EMISSÃO COM IES'), 'NA_CERTIFICADORA');
  assert.equal(remessas.andamentoDaRemessa('FALTA CPF E DIPLOMA (Frente e verso)'), 'PENDENCIA');
  assert.equal(remessas.andamentoDaRemessa('EMITIDO CERTIFICADO DE EXTENSÃO'), 'EXTENSAO');
  assert.equal(remessas.andamentoDaRemessa('Será enviado somente físico'), 'SO_FISICO');
  assert.equal(remessas.andamentoDaRemessa(''), 'SEM_ANOTACAO');
});

test('lê blocos lado a lado e várias remessas na mesma coluna', () => {
  const linhas = grade({
    B1: 'NOVAS DEMANDAS CERTIFICAÇÃO',
    B2: 'Pós-Graduação em Biomecânica, Musculação e Reabilitação',
    B3: 'Turma 03',
    B4: 'Remessa solicitada dia: 31/07/2025',
    B5: 'Total de alunos: 2',
    B6: 'NOME DOS ALUNOS:',
    B7: 'Aluno Um da Silva',
    C7: 'ENTREGUE',
    B8: 'Aluna Dois Souza',
    C8: 'FALTA CPF',
    B10: 'Remessa solicitada dia: 29/08/2025',
    B11: 'Total de alunos: 1',
    B12: 'NOME DOS ALUNOS:',
    B13: 'Aluno Três Lima',
    // Bloco vizinho, sem coluna de andamento entre os dois
    D2: 'Pós-Graduação em Biomecânica, Musculação e Reabilitação',
    D3: 'Turma 04',
    D4: 'Remessa solicitada dia: 30/04/2026',
    D6: 'NOME DOS ALUNOS',
    D7: 'Aluna Quatro Reis',
    E7: 'ENVIADO PARA IES',
  });

  const lidas = remessas.lerRemessas('BIOMECÂNICA', linhas, hoje);
  assert.equal(lidas.length, 3);

  const [primeira, segunda, terceira] = lidas;
  assert.equal(primeira.curso, 'B');
  assert.equal(primeira.turma, 3);
  assert.deepEqual(primeira.data, new Date('2025-07-31T00:00:00.000Z'));
  assert.equal(primeira.totalDeclarado, 2);
  assert.deepEqual(
    primeira.alunos.map(({ nome, andamento, anotacao }) => ({ nome, andamento, anotacao })),
    [
      { nome: 'Aluno Um da Silva', andamento: 'ENTREGUE', anotacao: null },
      { nome: 'Aluna Dois Souza', andamento: 'PENDENCIA', anotacao: 'FALTA CPF' },
    ],
  );

  assert.equal(segunda.turma, 3);
  assert.deepEqual(segunda.data, new Date('2025-08-29T00:00:00.000Z'));
  assert.deepEqual(segunda.alunos.map((aluno) => aluno.nome), ['Aluno Três Lima']);

  assert.equal(terceira.turma, 4);
  assert.equal(terceira.alunos[0].andamento, 'NA_CERTIFICADORA');
});

test('certificadora pelo nome do arquivo e curso pelo título', () => {
  assert.equal(remessas.certificadoraDoArquivo('C:\\Downloads\\Novas demandas de confecção dos certificados - INOVE.xlsx'), 'INOVE');
  assert.equal(remessas.certificadoraDoArquivo('/tmp/Novas demandas - usina.xlsx'), 'USINA');
  assert.equal(remessas.cursoDoTitulo('Pós-Graduação em Saúde da Mulher'), 'Saúde da Mulher');
  assert.equal(remessas.cursoDoTitulo('Pós-Graduação SmartFit'), 'SmartFit');
  assert.equal(remessas.prefixoDoCurso('Formação Integral em Fitness: Ênfase'), 'SMARTFIT');
  assert.equal(remessas.prefixoDoCurso('Fisiologia do Exercicio'), 'FE');
});
