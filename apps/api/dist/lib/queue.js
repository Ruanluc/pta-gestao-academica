"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHistoricoWorker = exports.createPdfGenerationWorker = exports.getPdfGenerationQueue = void 0;
const bullmq_1 = require("bullmq");
const client_1 = require("@prisma/client");
const ioredis_1 = __importDefault(require("ioredis"));
const pdf_lib_1 = require("pdf-lib");
const stream_1 = require("stream");
const googleDrive_1 = require("./googleDrive");
const prisma = new client_1.PrismaClient();
const queueName = 'pdf-generation-queue';
const connectionOptions = {
    host: '127.0.0.1',
    port: 6379,
    maxRetriesPerRequest: null,
};
let connection = null;
let pdfGenerationQueue = null;
const getConnection = () => {
    if (!connection) {
        connection = new ioredis_1.default(process.env.REDIS_URL || 'redis://127.0.0.1:6379', connectionOptions);
    }
    return connection;
};
const getPdfGenerationQueue = () => {
    if (!pdfGenerationQueue) {
        pdfGenerationQueue = new bullmq_1.Queue(queueName, { connection: getConnection() });
    }
    return pdfGenerationQueue;
};
exports.getPdfGenerationQueue = getPdfGenerationQueue;
const buildPdfBuffer = async (content) => {
    const pdfDoc = await pdf_lib_1.PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const font = await pdfDoc.embedFont(pdf_lib_1.StandardFonts.Helvetica);
    const lines = content.split('\n');
    page.drawText(lines[0] ?? 'Histórico escolar', {
        x: 50,
        y: 750,
        size: 20,
        font,
        color: (0, pdf_lib_1.rgb)(0.12, 0.12, 0.12),
    });
    lines.slice(1).forEach((line, index) => {
        page.drawText(line, {
            x: 50,
            y: 720 - index * 20,
            size: 12,
            font,
            color: (0, pdf_lib_1.rgb)(0.2, 0.2, 0.2),
        });
    });
    return Buffer.from(await pdfDoc.save());
};
const createPdfGenerationWorker = () => {
    try {
        const queueConnection = getConnection();
        new bullmq_1.Worker(queueName, async (job) => {
            const { studentId } = job.data;
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
            const result = await (0, googleDrive_1.uploadToGoogleDrive)({
                stream: stream_1.Readable.from(pdfBuffer),
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
        }, { connection: queueConnection });
    }
    catch (error) {
        console.warn('BullMQ worker não foi inicializado:', error);
    }
};
exports.createPdfGenerationWorker = createPdfGenerationWorker;
const createHistoricoWorker = () => {
    try {
        const queueConnection = getConnection();
        new bullmq_1.Worker('historico-escolar', async (job) => {
            const { matriculaId } = job.data;
            console.log(`[queue] processando historico ${matriculaId}`);
            return { ok: true, matriculaId };
        }, { connection: queueConnection });
    }
    catch (error) {
        console.warn('BullMQ worker não foi inicializado:', error);
    }
};
exports.createHistoricoWorker = createHistoricoWorker;
