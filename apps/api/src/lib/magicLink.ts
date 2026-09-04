import { randomBytes } from 'crypto';

export const buildMagicLinkExpiration = (minutes = 15) => new Date(Date.now() + minutes * 60 * 1000);

export const createMagicLinkRecord = async (prismaClient: any, userId: string, token?: string) => {
  const safeToken = token ?? randomBytes(32).toString('hex');
  const expiresAt = buildMagicLinkExpiration();

  return prismaClient.magicLink.create({
    data: {
      token: safeToken,
      userId,
      expiresAt,
    },
  });
};

export const validateMagicLinkToken = async (prismaClient: any, token: string) => {
  const magicLink = await prismaClient.magicLink.findUnique({ where: { token } });
  if (!magicLink) return null;
  if (magicLink.used) return null;
  if (magicLink.expiresAt <= new Date()) return null;
  return magicLink;
};

export const consumeMagicLinkToken = async (prismaClient: any, id: string) => {
  return prismaClient.magicLink.update({
    where: { id },
    data: { used: true },
  });
};
