import { createHash, randomBytes } from 'crypto';

export const MINUTOS_VALIDADE_MAGIC_LINK = 15;

type RegistroMagicLink = { id: string; usuarioId: string; usado: boolean; expiraEm: Date };

type ClienteMagicLink = {
  magicLink: {
    create: (args: { data: { tokenHash: string; usuarioId: string; expiraEm: Date } }) => Promise<unknown>;
    findUnique: (args: { where: { tokenHash: string } }) => Promise<RegistroMagicLink | null>;
    updateMany: (args: { where: { id: string; usado: boolean }; data: { usado: boolean } }) => Promise<{ count: number }>;
  };
};

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const gerarToken = () => randomBytes(32).toString('base64url');

/** Cria o registro no banco (apenas o hash) e devolve o token puro para ser enviado por e-mail. */
export const criarMagicLink = async (cliente: ClienteMagicLink, usuarioId: string) => {
  const token = gerarToken();
  await cliente.magicLink.create({
    data: {
      tokenHash: hashToken(token),
      usuarioId,
      expiraEm: new Date(Date.now() + MINUTOS_VALIDADE_MAGIC_LINK * 60 * 1000),
    },
  });
  return token;
};

/** Valida e marca o token como usado. Retorna null se inválido, expirado ou já utilizado. */
export const consumirMagicLink = async (cliente: ClienteMagicLink, token: string) => {
  const registro = await cliente.magicLink.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!registro || registro.usado || registro.expiraEm <= new Date()) return null;

  // A condição `usado: false` impede que duas requisições simultâneas usem o mesmo link
  const { count } = await cliente.magicLink.updateMany({
    where: { id: registro.id, usado: false },
    data: { usado: true },
  });

  return count === 1 ? registro : null;
};
