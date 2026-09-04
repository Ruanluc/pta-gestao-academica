"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inMemoryStore = exports.prisma = void 0;
require("reflect-metadata");
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = require("path");
const client_1 = require("@prisma/client");
const auth_1 = require("./routes/auth");
const turmas_1 = require("./routes/turmas");
const alunos_1 = require("./routes/alunos");
const disciplinas_1 = require("./routes/disciplinas");
const matriculas_1 = require("./routes/matriculas");
const documentos_1 = require("./routes/documentos");
const notas_1 = require("./routes/notas");
const queue_1 = require("./lib/queue");
const auth_2 = require("./lib/auth");
dotenv_1.default.config({ path: (0, path_1.resolve)(__dirname, '../.env') });
if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET deve ser definido no arquivo .env');
}
const app = (0, fastify_1.default)({ logger: false });
exports.prisma = new client_1.PrismaClient();
exports.inMemoryStore = {
    turmas: [],
    alunos: [],
};
app.register(cors_1.default, { origin: true });
app.register(jwt_1.default, { secret: process.env.JWT_SECRET });
app.register(multipart_1.default, {
    limits: {
        fileSize: 50 * 1024 * 1024,
        files: 1,
    },
});
app.decorate('authenticate', async (request, reply) => {
    const payload = await (0, auth_2.getAuthPayload)(request, reply);
    if (payload) {
        request.auth = payload;
    }
});
app.get('/health', async () => ({ ok: true }));
app.register(auth_1.authRoutes, { prefix: '/auth' });
app.register(turmas_1.turmaRoutes, { prefix: '/turmas' });
app.register(alunos_1.alunoRoutes, { prefix: '/alunos' });
app.register(disciplinas_1.disciplinaRoutes, { prefix: '/disciplinas' });
app.register(matriculas_1.matriculaRoutes, { prefix: '/matriculas' });
app.register(documentos_1.documentoRoutes, { prefix: '/documentos' });
app.register(notas_1.notaRoutes, { prefix: '/notas' });
(0, queue_1.createHistoricoWorker)();
(0, queue_1.createPdfGenerationWorker)();
const start = async () => {
    try {
        await app.listen({ port: 3000, host: '0.0.0.0' });
        console.log('API running on http://localhost:3000');
    }
    catch (err) {
        console.error('Failed to start API:', err);
        process.exit(1);
    }
};
if (require.main === module) {
    start();
}
