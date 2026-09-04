"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consumeMagicLinkToken = exports.validateMagicLinkToken = exports.createMagicLinkRecord = exports.buildMagicLinkExpiration = void 0;
const crypto_1 = require("crypto");
const buildMagicLinkExpiration = (minutes = 15) => new Date(Date.now() + minutes * 60 * 1000);
exports.buildMagicLinkExpiration = buildMagicLinkExpiration;
const createMagicLinkRecord = async (prismaClient, userId, token) => {
    const safeToken = token ?? (0, crypto_1.randomBytes)(32).toString('hex');
    const expiresAt = (0, exports.buildMagicLinkExpiration)();
    return prismaClient.magicLink.create({
        data: {
            token: safeToken,
            userId,
            expiresAt,
        },
    });
};
exports.createMagicLinkRecord = createMagicLinkRecord;
const validateMagicLinkToken = async (prismaClient, token) => {
    const magicLink = await prismaClient.magicLink.findUnique({ where: { token } });
    if (!magicLink)
        return null;
    if (magicLink.used)
        return null;
    if (magicLink.expiresAt <= new Date())
        return null;
    return magicLink;
};
exports.validateMagicLinkToken = validateMagicLinkToken;
const consumeMagicLinkToken = async (prismaClient, id) => {
    return prismaClient.magicLink.update({
        where: { id },
        data: { used: true },
    });
};
exports.consumeMagicLinkToken = consumeMagicLinkToken;
