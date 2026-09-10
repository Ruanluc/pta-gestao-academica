require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');

const { criarSessaoAluno, verificarSessaoAluno } = require('../dist/lib/acessoAluno');
const { createToken, verifyToken } = require('../dist/lib/auth');
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

test('a sessão do aluno não vale como token da equipe', () => {
  const sessao = criarSessaoAluno('aluno-1');
  assert.equal(verificarSessaoAluno(sessao), 'aluno-1');
  assert.throws(() => verifyToken(sessao));
});

test('o token da equipe não vale no portal do aluno', () => {
  assert.throws(() => verificarSessaoAluno(createToken({ id: 'usuario-1', role: 'ADMIN' })));
});

test('rotas do portal exigem a sessão do aluno', async () => {
  let resposta = await app.inject({ method: 'GET', url: '/portal/eu' });
  assert.equal(resposta.statusCode, 401);

  const tokenEquipe = createToken({ id: 'usuario-1', role: 'ADMIN' });
  resposta = await app.inject({ method: 'GET', url: '/portal/eu', headers: { authorization: `Bearer ${tokenEquipe}` } });
  assert.equal(resposta.statusCode, 401);
  assert.match(resposta.json().message, /portal/);
});

test('rotas da equipe recusam a sessão do aluno', async () => {
  const sessao = criarSessaoAluno('aluno-1');
  const resposta = await app.inject({ method: 'GET', url: '/alunos', headers: { authorization: `Bearer ${sessao}` } });
  assert.equal(resposta.statusCode, 401);
});

test('link de acesso e de inscrição malformados são recusados antes do banco', async () => {
  let resposta = await app.inject({ method: 'POST', url: '/portal/acesso', payload: { token: 'x' } });
  assert.equal(resposta.statusCode, 400);
  resposta = await app.inject({ method: 'GET', url: '/publico/inscricao/curto' });
  assert.equal(resposta.statusCode, 400);
});
