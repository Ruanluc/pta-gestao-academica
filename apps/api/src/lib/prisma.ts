import '../config';
import { PrismaClient } from '@prisma/client';

// Instância única do Prisma para toda a API
export const prisma = new PrismaClient();
