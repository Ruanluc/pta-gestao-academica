const test = require('node:test');
const assert = require('node:assert/strict');

const { createToken, verifyToken, hasRequiredRole } = require('../dist/lib/auth');
const { prisma } = require('../dist/main');

test.after(async () => {
  await prisma.$disconnect().catch(() => undefined);
});
const { createAuditLog } = require('../dist/lib/audit');
const {
  buildMagicLinkExpiration,
  createMagicLinkRecord,
  validateMagicLinkToken,
  consumeMagicLinkToken,
} = require('../dist/lib/magicLink');

test('createToken and verifyToken round-trip user payload without a Fastify request', () => {
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

test('createAuditLog stores a real audit entry for the supplied prisma client', async () => {
  const created = [];
  const prismaStub = {
    auditLog: {
      create: async ({ data }) => {
        created.push(data);
        return { id: 'log-1', ...data };
      },
    },
  };

  await createAuditLog('user-1', 'LOGIN', { result: 'ok' }, prismaStub);

  assert.equal(created.length, 1);
  assert.equal(created[0].userId, 'user-1');
  assert.equal(created[0].action, 'LOGIN');
  assert.equal(created[0].details, '{"result":"ok"}');
});

test('magic-link helpers create, validate and consume a token', async () => {
  const created = [];
  const prismaStub = {
    magicLink: {
      create: async ({ data }) => {
        created.push(data);
        return { id: 'magic-1', ...data };
      },
      findUnique: async ({ where }) => {
        const record = created.find((item) => item.token === where.token);
        if (!record) return null;
        return { id: 'magic-1', ...record, used: false, expiresAt: new Date(Date.now() + 60_000) };
      },
      update: async ({ where, data }) => {
        const record = created.find((item) => item.id === where.id);
        if (!record) return null;
        record.used = data.used;
        return { id: 'magic-1', ...record };
      },
    },
  };

  const token = 'token-123';
  const createdLink = await createMagicLinkRecord(prismaStub, 'user-1', token);
  assert.equal(createdLink.token, token);
  assert.equal(createdLink.userId, 'user-1');

  const validated = await validateMagicLinkToken(prismaStub, token);
  assert.equal(validated?.token, token);

  const consumed = await consumeMagicLinkToken(prismaStub, validated.id);
  assert.equal(consumed.used, true);
});
