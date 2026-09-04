"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notaRoutes = void 0;
const main_1 = require("../main");
const auth_1 = require("../lib/auth");
const audit_1 = require("../lib/audit");
const queue_1 = require("../lib/queue");
const notaRoutes = async (app) => {
    app.get('/', async (request, reply) => {
        const payload = await (0, auth_1.getAuthPayload)(request, reply);
        if (!payload)
            return;
        if (!(0, auth_1.hasRequiredRole)(payload.role, ['ADMIN', 'SECRETARIA', 'PROFESSOR'])) {
            return reply.code(403).send({ message: 'Acesso negado' });
        }
        return main_1.prisma.grade.findMany({
            where: { deletedAt: null },
            include: { student: true, module: true },
        });
    });
    app.post('/', async (request, reply) => {
        const payload = await (0, auth_1.getAuthPayload)(request, reply);
        if (!payload)
            return;
        if (!(0, auth_1.hasRequiredRole)(payload.role, ['ADMIN', 'SECRETARIA', 'PROFESSOR'])) {
            return reply.code(403).send({ message: 'Acesso negado' });
        }
        const data = request.body;
        const nota = await main_1.prisma.grade.create({
            data: {
                studentId: data.studentId ?? data.alunoId,
                moduleId: data.moduleId ?? data.disciplinaId,
                value: data.value ?? data.media ?? 0,
                createdById: payload.id,
            },
        });
        await (0, audit_1.writeAuditLog)({
            usuarioId: payload.id,
            usuarioNome: payload.role,
            entidade: 'Grade',
            entidadeId: nota.id,
            acao: 'CRIAR',
            detalhes: JSON.stringify({ studentId: nota.studentId, moduleId: nota.moduleId, value: nota.value }),
        });
        try {
            const queue = (0, queue_1.getPdfGenerationQueue)();
            await queue.add('verificar-historico', { studentId: nota.studentId }, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
            });
        }
        catch (queueError) {
            console.warn('Falha ao despachar verificação para a fila:', queueError);
        }
        return reply.code(201).send({ ...nota, queued: true });
    });
    app.put('/:id', async (request, reply) => {
        const payload = await (0, auth_1.getAuthPayload)(request, reply);
        if (!payload)
            return;
        if (!(0, auth_1.hasRequiredRole)(payload.role, ['ADMIN', 'SECRETARIA', 'PROFESSOR'])) {
            return reply.code(403).send({ message: 'Acesso negado' });
        }
        const { id } = request.params;
        const data = request.body;
        const nota = await main_1.prisma.grade.update({
            where: { id },
            data: {
                value: data.value ?? data.media,
                updatedAt: new Date(),
            },
        });
        await (0, audit_1.writeAuditLog)({
            usuarioId: payload.id,
            usuarioNome: payload.role,
            entidade: 'Grade',
            entidadeId: id,
            acao: 'ATUALIZAR',
            detalhes: JSON.stringify(data),
        });
        try {
            const queue = (0, queue_1.getPdfGenerationQueue)();
            await queue.add('verificar-historico', { studentId: nota.studentId }, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
            });
        }
        catch (queueError) {
            console.warn('Falha ao despachar verificação para a fila:', queueError);
        }
        return { ...nota, queued: true };
    });
};
exports.notaRoutes = notaRoutes;
