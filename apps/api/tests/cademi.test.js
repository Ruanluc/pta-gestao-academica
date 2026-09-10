require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');

const { casarNotasCademi, statusCademi, buscarNotasCademi } = require('../dist/lib/cademi');

const alunos = [
  { id: 'a1', cademiId: 'c-100', email: 'maria@teste.com', cpf: '52998224725' },
  { id: 'a2', cademiId: null, email: 'Joao@Teste.com', cpf: '12345678909' },
  { id: 'a3', cademiId: null, email: 'ana@teste.com', cpf: '11144477735' },
];
const modulos = [
  { id: 'm1', cademiId: 'mod-1', nome: 'Módulo 1' },
  { id: 'm2', cademiId: 'mod-2', nome: 'Módulo 2' },
  { id: 'm3', cademiId: null, nome: 'Módulo 3 (sem vínculo)' },
];

test('reconhece o aluno pelo ID da Cademi, pelo CPF (com máscara) e pelo e-mail', () => {
  const resultado = casarNotasCademi(alunos, modulos, [
    { alunoCademiId: 'c-100', moduloCademiId: 'mod-1', nota: 85 },
    { cpf: '123.456.789-09', moduloCademiId: 'mod-1', nota: 72.5 },
    { email: ' ANA@teste.com ', moduloCademiId: 'mod-2', nota: 90, frequencia: 100 },
  ]);

  assert.deepEqual(resultado.notas, [
    { alunoId: 'a1', disciplinaId: 'm1', media: 85 },
    { alunoId: 'a2', disciplinaId: 'm1', media: 72.5 },
    { alunoId: 'a3', disciplinaId: 'm2', media: 90, frequencia: 100 },
  ]);
  assert.deepEqual(resultado.alunosNaoEncontrados, []);
});

test('vincula o ID da Cademi a quem foi reconhecido por CPF ou e-mail', () => {
  const resultado = casarNotasCademi(alunos, modulos, [
    { alunoCademiId: 'c-200', cpf: '12345678909', moduloCademiId: 'mod-1', nota: 80 },
    { alunoCademiId: 'c-999', cpf: '52998224725', moduloCademiId: 'mod-1', nota: 80 },
  ]);
  // a1 já tinha ID da Cademi: não é sobrescrito
  assert.deepEqual(resultado.vinculos, [{ alunoId: 'a2', cademiId: 'c-200' }]);
});

test('lista alunos e módulos da Cademi que não existem na turma', () => {
  const resultado = casarNotasCademi(alunos, modulos, [
    { nome: 'Pessoa Desconhecida', email: 'x@y.com', moduloCademiId: 'mod-1', nota: 80 },
    { email: 'maria@teste.com', moduloCademiId: 'mod-inexistente', nota: 80 },
  ]);
  assert.deepEqual(resultado.alunosNaoEncontrados, ['Pessoa Desconhecida']);
  assert.deepEqual(resultado.modulosNaoEncontrados, ['mod-inexistente']);
  assert.equal(resultado.notas.length, 0);
});

test('ignora notas fora de 0 a 100 e pula quem ainda não tem nota', () => {
  const resultado = casarNotasCademi(alunos, modulos, [
    { email: 'maria@teste.com', moduloCademiId: 'mod-1', nota: 8.5e3 },
    { email: 'maria@teste.com', moduloCademiId: 'mod-2', nota: 80, frequencia: 120 },
    { email: 'ana@teste.com', moduloCademiId: 'mod-1', nota: null },
  ]);
  assert.equal(resultado.ignorados.length, 2);
  assert.equal(resultado.semNota, 1);
  assert.equal(resultado.notas.length, 0);
});

test('registro repetido: vale o último', () => {
  const resultado = casarNotasCademi(alunos, modulos, [
    { email: 'maria@teste.com', moduloCademiId: 'mod-1', nota: 60 },
    { email: 'maria@teste.com', moduloCademiId: 'mod-1', nota: 75 },
  ]);
  assert.deepEqual(resultado.notas, [{ alunoId: 'a1', disciplinaId: 'm1', media: 75 }]);
});

test('sem credenciais a integração fica desativada e avisa ao importar', async () => {
  assert.equal(statusCademi(), 'desativada');
  await assert.rejects(() => buscarNotasCademi(['mod-1']), /não configurada/);
});
