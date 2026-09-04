"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = require("crypto");
const main_1 = require("../main");
const auth_1 = require("../lib/auth");
const audit_1 = require("../lib/audit");
const magicLink_1 = require("../lib/magicLink");
const authRoutes = async (app) => {
    app.post('/login', async (request, reply) => {
        const { email, senha } = request.body;
        if (!email || !senha) {
            return reply.code(400).send({ message: 'E-mail e senha são obrigatórios' });
        }
        const user = await main_1.prisma.user.findUnique({ where: { email } });
        if (!user || !(await bcryptjs_1.default.compare(senha, user.password))) {
            return reply.code(401).send({ message: 'Credenciais inválidas' });
        }
        const token = (0, auth_1.createToken)({ id: user.id, role: user.role }, request);
        await (0, audit_1.createAuditLog)(user.id, 'LOGIN', { email });
        return { token, user: { id: user.id, email: user.email, role: user.role } };
    });
    app.post('/register', async (request, reply) => {
        const { email, senha, role } = request.body;
        if (!email || !senha) {
            return reply.code(400).send({ message: 'E-mail e senha são obrigatórios' });
        }
        const existingUser = await main_1.prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return reply.code(409).send({ message: 'Usuário já existe' });
        }
        const password = await bcryptjs_1.default.hash(senha, 10);
        const user = await main_1.prisma.user.create({
            data: { email, password, role: role || 'SECRETARIA' },
        });
        return reply.code(201).send({ id: user.id, email: user.email, role: user.role });
    });
    app.post('/magic-link', async (request, reply) => {
        const { email } = request.body;
        if (!email) {
            return reply.code(400).send({ message: 'E-mail é obrigatório' });
        }
        const user = await main_1.prisma.user.findUnique({ where: { email } });
        if (!user) {
            return reply.code(404).send({ message: 'Usuário não encontrado' });
        }
        const token = (0, crypto_1.randomBytes)(32).toString('hex');
        await (0, magicLink_1.createMagicLinkRecord)(main_1.prisma, user.id, token);
        const magicUrl = `http://localhost:3000/magic?token=${token}`;
        console.log(`[magic-link] Enviando e-mail para ${email}: ${magicUrl}`);
        return reply.code(200).send({
            message: 'Magic link gerado com sucesso',
            magicUrl,
        });
    });
    app.post('/magic-validate', async (request, reply) => {
        const { token } = request.body;
        if (!token) {
            return reply.code(400).send({ message: 'Token é obrigatório' });
        }
        const magicLink = await (0, magicLink_1.validateMagicLinkToken)(main_1.prisma, token);
        if (!magicLink) {
            return reply.code(401).send({ message: 'Token inválido ou expirado' });
        }
        await (0, magicLink_1.consumeMagicLinkToken)(main_1.prisma, magicLink.id);
        const user = await main_1.prisma.user.findUnique({ where: { id: magicLink.userId } });
        const jwtToken = (0, auth_1.createToken)({ id: magicLink.userId, role: user?.role }, request);
        await (0, audit_1.createAuditLog)(magicLink.userId, 'MAGIC_LINK_VALIDADO', { token });
        return reply.code(200).send({
            token: jwtToken,
            user: { id: magicLink.userId },
        });
    });
    app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
        const payload = request.auth;
        if (!payload)
            return;
        const user = await main_1.prisma.user.findUnique({ where: { id: payload.id } });
        if (!user) {
            return reply.code(404).send({ message: 'Usuário não encontrado' });
        }
        return { id: user.id, role: user.role, email: user.email };
    });
    app.post('/bootstrap-admin', async (request, reply) => {
        const { email, senha } = request.body;
        const existing = await main_1.prisma.user.findUnique({ where: { email } });
        if (existing) {
            return reply.code(409).send({ message: 'Usuário já existe' });
        }
        const password = await bcryptjs_1.default.hash(senha, 10);
        const user = await main_1.prisma.user.create({
            data: { email, password, role: 'ADMIN' },
        });
        return reply.code(201).send({ id: user.id, email: user.email, role: user.role });
    });
};
exports.authRoutes = authRoutes;
