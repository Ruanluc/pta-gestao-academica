"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alunoRoutes = void 0;
const main_1 = require("../main");
const auth_1 = require("../lib/auth");
const normalizeAlunoPayload = (data) => {
    const payload = { ...data };
    const birthDate = payload.birthDate ?? payload.dataNascimento;
    const name = payload.name ?? payload.nome ?? 'Aluno';
    const phone = payload.phone ?? payload.telefone;
    const googleDriveFolderId = payload.googleDriveFolderId ?? payload.driveFolderId;
    return {
        name,
        cpf: payload.cpf,
        email: payload.email ?? '',
        phone: phone ?? null,
        birthDate: birthDate ? new Date(birthDate) : null,
        googleDriveFolderId: googleDriveFolderId ?? null,
        documentStatus: payload.documentStatus ?? 'VERDE_TUDO_CERTO',
    };
};
const alunoRoutes = async (app) => {
    app.get('/', async (request, reply) => {
        const payload = await (0, auth_1.getAuthPayload)(request, reply);
        if (!payload)
            return;
        if (!(0, auth_1.hasRequiredRole)(payload.role, ['ADMIN', 'SECRETARIA', 'PROFESSOR'])) {
            return reply.code(403).send({ message: 'Acesso negado' });
        }
        try {
            return await main_1.prisma.student.findMany({ orderBy: { name: 'asc' } });
        }
        catch {
            return main_1.inMemoryStore.alunos;
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
            const data = normalizeAlunoPayload(request.body);
            const aluno = await main_1.prisma.student.create({ data });
            return reply.code(201).send(aluno);
        }
        catch {
            const fallback = {
                id: `aluno-${Date.now()}`,
                ...normalizeAlunoPayload(request.body),
            };
            main_1.inMemoryStore.alunos.unshift(fallback);
            return reply.code(201).send(fallback);
        }
    });
};
exports.alunoRoutes = alunoRoutes;
