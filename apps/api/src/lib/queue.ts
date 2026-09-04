import { Queue, Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import IORedis from 'ioredis';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Readable } from 'stream';
import { uploadToGoogleDrive } from './googleDrive';

const prisma = new PrismaClient();
const queueName = 'pdf-generation-queue';

const connectionOptions = {
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null as null,
};

let connection: IORedis | null = null;
let pdfGenerationQueue: Queue | null = null;

const getConnection = () => {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', connectionOptions as any);
  }
  return connection;
};

export const getPdfGenerationQueue = () => {
  if (!pdfGenerationQueue) {
    pdfGenerationQueue = new Queue(queueName, { connection: getConnection() });
  }
  return pdfGenerationQueue;
};

const buildPdfBuffer = async (content: string) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const lines = content.split('\n');

  page.drawText(lines[0] ?? 'Histórico escolar', {
    x: 50,
    y: 750,
    size: 20,
    font,
    color: rgb(0.12, 0.12, 0.12),
  });

  lines.slice(1).forEach((line, index) => {
    page.drawText(line, {
      x: 50,
      y: 720 - index * 20,
      size: 12,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  });

  return Buffer.from(await pdfDoc.save());
};

export const createPdfGenerationWorker = () => {
  try {
    const queueConnection = getConnection();
    new Worker(
      queueName,
      async (job) => {
        const { studentId } = job.data as { studentId: string };
        console.log(`[queue] processando histórico ${studentId}`);

        const student = await prisma.student.findUnique({
          where: { id: studentId },
          include: { grades: true },
        });

        if (!student) {
          return { ok: false, reason: 'student-not-found', studentId };
        }

        const isGreen = student.documentStatus === 'VERDE_TUDO_CERTO';
        const hasAll100 = student.grades.length > 0 && student.grades.every((grade) => grade.value === 100);

        if (!isGreen || !hasAll100) {
          return { ok: false, reason: 'conditions-not-met', studentId };
        }

        const htmlContent = [
          '<!DOCTYPE html>',
          '<html>',
          '<body>',
          '<h1>Histórico escolar</h1>',
          `<p>Aluno: ${student.name}</p>`,
          `<p>Status documental: ${student.documentStatus}</p>`,
          '<p>Notas: 100%.</p>',
          '</body>',
          '</html>',
        ].join('\n');

        const pdfBuffer = await buildPdfBuffer(htmlContent);
        const result = await uploadToGoogleDrive({
          stream: Readable.from(pdfBuffer),
          filename: `historico-${student.name.toLowerCase().replace(/\s+/g, '-')}.pdf`,
          mimeType: 'application/pdf',
          folderId: student.googleDriveFolderId,
        });

        await prisma.document.create({
          data: {
            studentId: student.id,
            driveUrl: result.webViewLink || result.fileId,
            approvalStatus: 'PENDENTE',
          },
        });

        return { ok: true, studentId, fileId: result.fileId, driveUrl: result.webViewLink };
      },
      { connection: queueConnection },
    );
  } catch (error) {
    console.warn('BullMQ worker não foi inicializado:', error);
  }
};

export const createHistoricoWorker = () => {
  try {
    const queueConnection = getConnection();
    new Worker(
      'historico-escolar',
      async (job) => {
        const { matriculaId } = job.data as { matriculaId: string };
        console.log(`[queue] processando historico ${matriculaId}`);
        return { ok: true, matriculaId };
      },
      { connection: queueConnection },
    );
  } catch (error) {
    console.warn('BullMQ worker não foi inicializado:', error);
  }
};
