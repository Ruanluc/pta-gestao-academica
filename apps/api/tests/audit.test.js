const test = require('node:test');
const assert = require('node:assert/strict');

const { createAuditLog } = require('../dist/lib/audit');
const { prisma } = require('../dist/main');

const cleanup = async () => {
  await prisma.$disconnect().catch(() => undefined);
};

test.after(async () => {
  await cleanup();
});

test('createAuditLog stores an audit entry via the supplied prisma client', async () => {
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
