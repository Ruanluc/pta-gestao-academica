"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAuditLog = exports.createAuditLog = void 0;
const main_1 = require("../main");
const createAuditLog = async (userId, action, details, prismaClient = main_1.prisma) => {
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
exports.createAuditLog = createAuditLog;
const writeAuditLog = async ({ usuarioId, usuarioNome, entidade, entidadeId, acao, detalhes, }) => {
    await main_1.prisma.auditLog.create({
        data: {
            userId: usuarioId ?? undefined,
            action: acao,
            details: detalhes,
            entity: entidade,
            entityId: entidadeId,
        },
    });
};
exports.writeAuditLog = writeAuditLog;
