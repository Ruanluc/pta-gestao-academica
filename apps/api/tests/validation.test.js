require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');

const { cpfSchema, cpfValido } = require('../dist/lib/validation');

test('cpfValido confere os dígitos verificadores', () => {
  assert.equal(cpfValido('529.982.247-25'), true);
  assert.equal(cpfValido('12345678909'), true);
  assert.equal(cpfValido('123.456.789-00'), false);
  assert.equal(cpfValido('111.111.111-11'), false);
  assert.equal(cpfValido('123'), false);
});

test('cpfSchema remove a máscara e rejeita CPF inválido', () => {
  assert.equal(cpfSchema.parse('529.982.247-25'), '52998224725');
  assert.throws(() => cpfSchema.parse('000.000.000-00'), /CPF inválido/);
});
