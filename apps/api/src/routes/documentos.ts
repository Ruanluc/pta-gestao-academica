import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../main';
import { getAuthPayload, hasRequiredRole } from '../lib/auth';
import { uploadToGoogleDrive } from '../lib/googleDrive';
import { writeAuditLog } from '../lib/audit';
import { Readable } from 'stream';

export const documentoRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    const payload = await getAuthPayload(request, reply);
    if (!payload) return;
    if (!hasRequiredRole(payload.role, ['ADMIN', 'SECRETARIA', 'PROFESSOR'])) {
      return reply.code(403).send({ message: 'Acesso negado' });
    }

    return prisma.document.findMany({
      where: { deletedAt: null },
      include: { student: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.post('/', async (request, reply) => {
    const payload = await getAuthPayload(request, reply);
    if (!payload) return;
    if (!hasRequiredRole(payload.role, ['ADMIN', 'SECRETARIA'])) {
      return reply.code(403).send({ message: 'Acesso negado' });
    }

    const data = request.body as any;
    const documento = await prisma.document.create({
      data: {
        studentId: data.studentId ?? data.alunoId,
        uploadedById: data.uploadedById ?? data.usuarioId ?? null,
        driveUrl: data.driveUrl ?? data.googleDriveLink ?? '',
        approvalStatus: data.approvalStatus ?? data.status ?? 'PENDENTE',
      },
    });
    await writeAuditLog({
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
    const payload = await getAuthPayload(request, reply);
    if (!payload) return;
    if (!hasRequiredRole(payload.role, ['ADMIN', 'SECRETARIA'])) {
      return reply.code(403).send({ message: 'Acesso negado' });
    }

    const requestWithFile = request as any;
    const file = await requestWithFile.file();
    if (!file) {
      return reply.code(400).send({ message: 'Arquivo ausente' });
    }

    const filename = file.filename || 'arquivo-upload';
    const mimeType = file.mimetype || 'application/octet-stream';
    const folderId = requestWithFile.body?.folderId ?? null;

    const upload = await uploadToGoogleDrive({
      stream: file.file as Readable,
      filename,
      mimeType,
      folderId,
    });

    await writeAuditLog({
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
