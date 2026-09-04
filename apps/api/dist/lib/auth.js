"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.getAuthPayload = exports.hasRequiredRole = exports.verifyToken = exports.createToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const createToken = (payload, request) => {
    if (request?.server?.jwt?.sign) {
        return request.server.jwt.sign(payload, { expiresIn: '8h' });
    }
    return jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '8h' });
};
exports.createToken = createToken;
const verifyToken = (token, request) => {
    if (request?.server?.jwt?.verify) {
        const decoded = request.server.jwt.verify(token);
        if (!decoded.id || !decoded.role) {
            throw new Error('Token inválido');
        }
        return decoded;
    }
    const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'dev-secret');
    if (!decoded.id || !decoded.role) {
        throw new Error('Token inválido');
    }
    return decoded;
};
exports.verifyToken = verifyToken;
const hasRequiredRole = (userRole, allowedRoles) => allowedRoles.includes(userRole);
exports.hasRequiredRole = hasRequiredRole;
const getAuthPayload = async (request, reply) => {
    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
        await reply.code(401).send({ message: 'Token de acesso ausente' });
        return null;
    }
    try {
        return (0, exports.verifyToken)(authorization.replace('Bearer ', '').trim(), request);
    }
    catch {
        await reply.code(401).send({ message: 'Token inválido ou expirado' });
        return null;
    }
};
exports.getAuthPayload = getAuthPayload;
const requireRole = (allowedRoles) => async (request, reply) => {
    const payload = await (0, exports.getAuthPayload)(request, reply);
    if (!payload)
        return;
    if (!(0, exports.hasRequiredRole)(payload.role, allowedRoles)) {
        await reply.code(403).send({ message: 'Acesso negado' });
        return;
    }
    request.auth = payload;
};
exports.requireRole = requireRole;
