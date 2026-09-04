"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matriculaRoutes = void 0;
const auth_1 = require("../lib/auth");
const matriculaRoutes = async (app) => {
    app.get('/', async (request, reply) => {
        const payload = await (0, auth_1.getAuthPayload)(request, reply);
        if (!payload)
            return;
        if (!(0, auth_1.hasRequiredRole)(payload.role, ['ADMIN', 'SECRETARIA', 'PROFESSOR'])) {
            return reply.code(403).send({ message: 'Acesso negado' });
        }
        return [];
    });
    app.post('/', async (request, reply) => {
        const payload = await (0, auth_1.getAuthPayload)(request, reply);
        if (!payload)
            return;
        if (!(0, auth_1.hasRequiredRole)(payload.role, ['ADMIN', 'SECRETARIA'])) {
            return reply.code(403).send({ message: 'Acesso negado' });
        }
        const data = request.body;
        return reply.code(201).send({ id: `matricula-${Date.now()}`, ...data });
    });
};
exports.matriculaRoutes = matriculaRoutes;
