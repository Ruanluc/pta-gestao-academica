"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disciplinaRoutes = void 0;
const main_1 = require("../main");
const disciplinaRoutes = async (app) => {
    app.get('/', async () => {
        return main_1.prisma.module.findMany({ orderBy: { createdAt: 'asc' } });
    });
    app.post('/', async (request, reply) => {
        const data = request.body;
        const disciplina = await main_1.prisma.module.create({
            data: {
                name: data.name ?? data.nome ?? 'Novo módulo',
            },
        });
        return reply.code(201).send(disciplina);
    });
};
exports.disciplinaRoutes = disciplinaRoutes;
