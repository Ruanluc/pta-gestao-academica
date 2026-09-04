import { prisma } from '../main';

export const createAuditLog = async (
  userId: string | undefined,
  action: string,
  details: Record<string, unknown> | string | undefined,
  prismaClient: any = prisma,
) => {
  const serializedDetails = typeof details === 'string' ? details : JSON.stringify(details ?? {});

  return prismaClient.auditLog.create({
    data: {
      userId: userId ?? undefined,
      action,
      details: serializedDetails,
      entity: 'System',
      entityId: userId ?? 'anonymous',
    },
  });
};

export const writeAuditLog = async ({
  usuarioId,
  usuarioNome,
  entidade,
  entidadeId,
  acao,
  detalhes,
}: {
  usuarioId?: string;
  usuarioNome?: string;
  entidade: string;
  entidadeId: string;
  acao: string;
  detalhes?: string;
}) => {
  await prisma.auditLog.create({
    data: {
      userId: usuarioId ?? undefined,
      action: acao,
      details: detalhes,
      entity: entidade,
      entityId: entidadeId,
    },
  });
};
