"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.turmaRoutes = void 0;
const main_1 = require("../main");
const auth_1 = require("../lib/auth");
const normalizeTurmaPayload = (data) => {
    const turma = { ...data };
    return {
        name: turma.name ?? turma.nome ?? 'Nova turma',
    };
};
const turmaRoutes = async (app) => {
    app.get('/', async (request, reply) => {
        const payload = await (0, auth_1.getAuthPayload)(request, reply);
        if (!payload)
            return;
        if (!(0, auth_1.hasRequiredRole)(payload.role, ['ADMIN', 'SECRETARIA'])) {
            return reply.code(403).send({ message: 'Acesso negado' });
        }
        try {
            return await main_1.prisma.module.findMany({ orderBy: { createdAt: 'asc' } });
        }
        catch {
            return main_1.inMemoryStore.turmas;
        }
    });
    app.post('/', async (request, reply) => {
        const payload = await (0, auth_1.getAuthPayload)(request, reply);
        if (!payload)
            return;
        if (!(0, auth_1.hasRequiredRole)(payload.role, ['ADMIN', 'SECRETARIA'])) {
            return reply.code(403).send({ message: 'Acesso negado' });
        }
        try {
            const data = normalizeTurmaPayload(request.body);
            const turma = await main_1.prisma.module.create({ data });
            return reply.code(201).send(turma);
        }
        catch {
            const fallback = {
                id: `turma-${Date.now()}`,
                ...normalizeTurmaPayload(request.body),
            };
            main_1.inMemoryStore.turmas.unshift(fallback);
            return reply.code(201).send(fallback);
        }
    });
};
exports.turmaRoutes = turmaRoutes;
