import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

/** Cria o primeiro administrador a partir de ADMIN_EMAIL / ADMIN_SENHA / ADMIN_NOME do .env. */
const executar = async () => {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const senha = process.env.ADMIN_SENHA?.trim();
  const nome = process.env.ADMIN_NOME?.trim() || 'Administrador';

  if (!email || !senha) {
    console.error('Defina ADMIN_EMAIL e ADMIN_SENHA em apps/api/.env para criar o primeiro administrador.');
    process.exitCode = 1;
    return;
  }

  if (senha.length < 8) {
    console.error('ADMIN_SENHA deve ter pelo menos 8 caracteres.');
    process.exitCode = 1;
    return;
  }

  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    console.info(`Usuário ${email} já existe (perfil ${existente.role}). Nada a fazer.`);
    return;
  }

  await prisma.usuario.create({
    data: { nome, email, senhaHash: await bcrypt.hash(senha, 10), role: 'ADMIN' },
  });

  console.info(`Administrador ${email} criado com sucesso.`);
};

executar()
  .catch((erro) => {
    console.error('Falha ao executar o seed:', erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
