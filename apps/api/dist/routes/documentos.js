"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentoRoutes = void 0;
const main_1 = require("../main");
const auth_1 = require("../lib/auth");
const googleDrive_1 = require("../lib/googleDrive");
const audit_1 = require("../lib/audit");
const documentoRoutes = async (app) => {
    app.get('/', async (request, reply) => {
        const payload = await (0, auth_1.getAuthPayload)(request, reply);
        if (!payload)
            return;
        if (!(0, auth_1.hasRequiredRole)(payload.role, ['ADMIN', 'SECRETARIA', 'PROFESSOR'])) {
            return reply.code(403).send({ message: 'Acesso negado' });
        }
        return main_1.prisma.document.findMany({
            where: { deletedAt: null },
            include: { student: true },
            orderBy: { createdAt: 'desc' },
        });
    });
    app.post('/', async (request, reply) => {
        const payload = await (0, auth_1.getAuthPayload)(request, reply);
        if (!payload)
            return;
        if (!(0, auth_1.hasRequiredRole)(payload.role, ['ADMIN', 'SECRETARIA'])) {
            return reply.code(403).send({ message: 'Acesso negado' });
        }
        const data = request.body;
        const documento = await main_1.prisma.document.create({
            data: {
                studentId: data.studentId ?? data.alunoId,
                uploadedById: data.uploadedById ?? data.usuarioId ?? null,
                driveUrl: data.driveUrl ?? data.googleDriveLink ?? '',
                approvalStatus: data.approvalStatus ?? data.status ?? 'PENDENTE',
            },
        });
        await (0, audit_1.writeAuditLog)({
            usuarioId: payload.id,
            usuarioNome: payload.role,
            entidade: 'Documento',
            entidadeId: documento.id,
            acao: 'CRIAR',
            detalhes: JSON.stringify({ studentId: documento.studentId, approvalStatus: documento.approvalStatus }),
        });
        return reply.code(201).send(documento);
    });
    app.post('/upload', async (request, reply) => {
        const payload = await (0, auth_1.getAuthPayload)(request, reply);
        if (!payload)
            return;
        if (!(0, auth_1.hasRequiredRole)(payload.role, ['ADMIN', 'SECRETARIA'])) {
            return reply.code(403).send({ message: 'Acesso negado' });
        }
        const requestWithFile = request;
        const file = await requestWithFile.file();
        if (!file) {
            return reply.code(400).send({ message: 'Arquivo ausente' });
        }
        const filename = file.filename || 'arquivo-upload';
        const mimeType = file.mimetype || 'application/octet-stream';
        const folderId = requestWithFile.body?.folderId ?? null;
        const upload = await (0, googleDrive_1.uploadToGoogleDrive)({
            stream: file.file,
            filename,
            mimeType,
            folderId,
        });
        await (0, audit_1.writeAuditLog)({
            usuarioId: payload.id,
            usuarioNome: payload.role,
            entidade: 'Documento',
            entidadeId: 'upload',
            acao: 'UPLOAD',
            detalhes: JSON.stringify({ filename, mimeType, fileId: upload.fileId }),
        });
        return reply.code(201).send(upload);
    });
};
exports.documentoRoutes = documentoRoutes;
