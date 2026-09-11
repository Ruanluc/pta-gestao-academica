require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');

const { classificarAlteracoes, valorParaBanco } = require('../dist/lib/correcaoDados');
const { montarEmail } = require('../dist/services/notificacoes');
const { referenciaDoMes } = require('../dist/services/lotes');

const atual = {
  nome: 'Maria Souza',
  email: 'maria@teste.com',
  telefone: '11 99999-0000',
  dataNascimento: new Date('1990-05-20T00:00:00Z'),
  nacionalidade: 'Brasileira',
  naturalidade: null,
  filiacao: '',
  rgNumero: '12.345.678-9',
  rgOrgaoEmissor: 'SSP/SP',
};

test('campo vazio o aluno preenche direto; campo preenchido vai para análise', () => {
  const { diretas, emAnalise } = classificarAlteracoes(atual, {
    naturalidade: 'Campinas - SP',
    filiacao: 'Ana Souza',
    rgNumero: '98.765.432-1',
    nome: 'Maria Souza',
  });
  assert.deepEqual(Object.keys(diretas).sort(), ['filiacao', 'naturalidade']);
  assert.deepEqual(emAnalise, { rgNumero: { atual: '12.345.678-9', novo: '98.765.432-1' } });
});

test('telefone muda direto mesmo já preenchido; data igual não gera alteração', () => {
  const { diretas, emAnalise } = classificarAlteracoes(atual, {
    telefone: '11 98888-1111',
    dataNascimento: new Date('1990-05-20T00:00:00Z'),
  });
  assert.deepEqual(Object.keys(diretas), ['telefone']);
  assert.deepEqual(emAnalise, {});
});

test('mudar data de nascimento já preenchida vai para análise e é gravada corretamente', () => {
  const { emAnalise } = classificarAlteracoes(atual, { dataNascimento: new Date('1991-01-02T00:00:00Z') });
  assert.deepEqual(emAnalise.dataNascimento, { atual: '1990-05-20', novo: '1991-01-02' });
  assert.equal(valorParaBanco('dataNascimento', '1991-01-02').toISOString(), '1991-01-02T00:00:00.000Z');
  assert.equal(valorParaBanco('naturalidade', ''), null);
});

test('e-mail de aviso escapa HTML e traz o botão também no texto', () => {
  const { texto, html } = montarEmail({
    titulo: 'Documento <recusado>',
    paragrafos: ['Motivo: "foto" & ilegível'],
    botao: { texto: 'Abrir', link: 'http://localhost:3001/portal' },
  });
  assert.ok(html.includes('Documento &lt;recusado&gt;'));
  assert.ok(html.includes('&quot;foto&quot; &amp; ilegível'));
  assert.ok(texto.endsWith('Abrir: http://localhost:3001/portal'));
});

test('referência do lote usa o mês de Brasília', () => {
  // 01/10 às 01h UTC ainda é 30/09 em Brasília
  assert.equal(referenciaDoMes(new Date('2026-10-01T01:00:00Z')), '2026-09');
  assert.equal(referenciaDoMes(new Date('2026-10-01T12:00:00Z')), '2026-10');
});
