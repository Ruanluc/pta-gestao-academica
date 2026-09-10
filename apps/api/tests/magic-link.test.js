require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');

const { consumirMagicLink, criarMagicLink, hashToken } = require('../dist/lib/magicLink');

const criarStub = () => {
  const registros = [];
  return {
    registros,
    magicLink: {
      create: async ({ data }) => {
        const registro = { id: `link-${registros.length + 1}`, usado: false, ...data };
        registros.push(registro);
        return registro;
      },
      findUnique: async ({ where }) => registros.find((registro) => registro.tokenHash === where.tokenHash) ?? null,
      updateMany: async ({ where, data }) => {
        const alvo = registros.find((registro) => registro.id === where.id && registro.usado === where.usado);
        if (!alvo) return { count: 0 };
        Object.assign(alvo, data);
        return { count: 1 };
      },
    },
  };
};

test('o banco guarda apenas o hash do token', async () => {
  const stub = criarStub();
  const token = await criarMagicLink(stub, 'usuario-1');

  assert.equal(stub.registros.length, 1);
  assert.notEqual(stub.registros[0].tokenHash, token);
  assert.equal(stub.registros[0].tokenHash, hashToken(token));
});

test('o link funciona uma única vez', async () => {
  const stub = criarStub();
  const token = await criarMagicLink(stub, 'usuario-1');

  const primeiro = await consumirMagicLink(stub, token);
  assert.equal(primeiro?.usuarioId, 'usuario-1');
  assert.equal(await consumirMagicLink(stub, token), null);
});

test('link expirado ou desconhecido é recusado', async () => {
  const stub = criarStub();
  const token = await criarMagicLink(stub, 'usuario-1');
  stub.registros[0].expiraEm = new Date(Date.now() - 1000);

  assert.equal(await consumirMagicLink(stub, token), null);
  assert.equal(await consumirMagicLink(stub, 'token-que-nao-existe'), null);
});
