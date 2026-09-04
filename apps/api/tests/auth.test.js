const test = require('node:test');
const assert = require('node:assert/strict');

const { createToken, verifyToken, hasRequiredRole } = require('../dist/lib/auth');
const { prisma } = require('../dist/main');

const cleanup = async () => {
  await prisma.$disconnect().catch(() => undefined);
};

test.after(async () => {
  await cleanup();
});

test('createToken and verifyToken round-trip user payload', () => {
  const payload = { id: 'user-1', role: 'ADMIN' };
  const token = createToken(payload);
  const decoded = verifyToken(token);

  assert.equal(decoded.id, payload.id);
  assert.equal(decoded.role, payload.role);
});

test('hasRequiredRole returns true only for allowed roles', () => {
  assert.equal(hasRequiredRole('ADMIN', ['ADMIN', 'SECRETARIA']), true);
  assert.equal(hasRequiredRole('PROFESSOR', ['ADMIN', 'SECRETARIA']), false);
  assert.equal(hasRequiredRole('SECRETARIA', ['ADMIN', 'SECRETARIA']), true);
});
