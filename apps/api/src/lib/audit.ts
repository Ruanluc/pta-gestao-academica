import { prisma } from './prisma';

type ClienteAuditoria = {
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export type RegistroAuditoria = {
  usuarioId?: string | null;
  acao: string;
  entidade: string;
  entidadeId: string;
  detalhes?: unknown;
};

/** Grava um registro de auditoria. Falhas são apenas logadas para não derrubar a operação principal. */
export const registrarAuditoria = async (
  { usuarioId, acao, entidade, entidadeId, detalhes }: RegistroAuditoria,
  cliente: ClienteAuditoria = prisma as unknown as ClienteAuditoria,
) => {
  try {
    await cliente.auditLog.create({
      data: {
        usuarioId: usuarioId ?? null,
        acao,
        entidade,
        entidadeId,
        detalhes: detalhes === undefined ? null : typeof detalhes === 'string' ? detalhes : JSON.stringify(detalhes),
      },
    });
  } catch (erro) {
    console.error('[auditoria] falha ao registrar ação', acao, erro);
  }
};
