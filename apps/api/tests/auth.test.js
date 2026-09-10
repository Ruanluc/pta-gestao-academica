require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { createToken, hasRequiredRole, verifyToken } = require('../dist/lib/auth');
const { buildApp } = require('../dist/app');
const { prisma } = require('../dist/lib/prisma');

let app;

test.before(async () => {
  app = await buildApp({ logger: false });
});

test.after(async () => {
  await app.close();
  await prisma.$disconnect().catch(() => undefined);
});

test('createToken e verifyToken preservam id e perfil', () => {
  const token = createToken({ id: 'usuario-1', role: 'ADMIN' });
  assert.deepEqual(verifyToken(token), { id: 'usuario-1', role: 'ADMIN' });
});

test('verifyToken recusa token assinado com outro segredo', () => {
  const falso = jwt.sign({ id: 'usuario-1', role: 'ADMIN' }, 'outro-segredo-qualquer-com-32-caracteres');
  assert.throws(() => verifyToken(falso));
});

test('hasRequiredRole aceita apenas perfis permitidos', () => {
  assert.equal(hasRequiredRole('ADMIN', ['ADMIN', 'SECRETARIA']), true);
  assert.equal(hasRequiredRole('PROFESSOR', ['ADMIN', 'SECRETARIA']), false);
});

test('rotas protegidas exigem token', async () => {
  for (const url of ['/alunos', '/turmas', '/documentos', '/usuarios', '/notas', '/dashboard']) {
    const resposta = await app.inject({ method: 'GET', url });
    assert.equal(resposta.statusCode, 401, url);
    assert.equal(resposta.json().message, 'Token de acesso ausente');
  }
});

test('token inválido é recusado', async () => {
  const resposta = await app.inject({ method: 'GET', url: '/alunos', headers: { authorization: 'Bearer abc.def.ghi' } });
  assert.equal(resposta.statusCode, 401);
  assert.equal(resposta.json().message, 'Sessão inválida ou expirada');
});

test('login valida os dados antes de consultar o banco', async () => {
  const resposta = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'nao-e-email', senha: 'x' } });
  assert.equal(resposta.statusCode, 400);
  assert.equal(resposta.json().message, 'E-mail inválido');
});

test('rota inexistente responde 404 em português', async () => {
  const resposta = await app.inject({ method: 'GET', url: '/nao-existe' });
  assert.equal(resposta.statusCode, 404);
  assert.equal(resposta.json().message, 'Rota não encontrada');
});
