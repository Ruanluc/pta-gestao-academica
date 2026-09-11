import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { autenticar, createToken, QUALQUER_PERFIL, usuarioLogado } from '../lib/auth';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { consumirMagicLink, criarMagicLink, MINUTOS_VALIDADE_MAGIC_LINK } from '../lib/magicLink';
import { emailHabilitado, enviarEmail } from '../lib/mailer';
import { criarLimitador } from '../lib/rateLimit';
import { emailSchema, textoObrigatorio } from '../lib/validation';

export const senhaSchema = z.string().min(8, 'A senha deve ter pelo menos 8 caracteres').max(100);

export const usuarioPublico = (usuario: { id: string; nome: string; email: string; role: string; ativo: boolean }) => ({
  id: usuario.id,
  nome: usuario.nome,
  email: usuario.email,
  role: usuario.role,
  ativo: usuario.ativo,
});

// Faz o login levar o mesmo tempo existindo ou não o usuário (evita descobrir e-mails cadastrados)
const HASH_FALSO = bcrypt.hashSync('senha-que-nao-existe', 10);

const limitarLogin = criarLimitador({ max: 10, janelaMs: 15 * 60 * 1000 });
const limitarMagicLink = criarLimitador({ max: 5, janelaMs: 15 * 60 * 1000 });

export const authRoutes: FastifyPluginAsync = async (app) => {
  /** Informa ao frontend se é o primeiro acesso (nenhum usuário cadastrado). */
  app.get('/status', async () => ({
    possuiUsuarios: (await prisma.usuario.count()) > 0,
    magicLinkDisponivel: emailHabilitado() || !config.producao,
  }));

  app.post('/login', async (request) => {
    const { email, senha } = z
      .object({ email: emailSchema, senha: z.string().min(1, 'Informe a senha') })
      .parse(request.body ?? {});

    limitarLogin(`${request.ip}:${email}`);

    const usuario = await prisma.usuario.findUnique({ where: { email } });
    const senhaCorreta = await bcrypt.compare(senha, usuario?.senhaHash ?? HASH_FALSO);

    if (!usuario || !senhaCorreta || !usuario.ativo) {
      throw new HttpError(401, 'E-mail ou senha inválidos');
    }

    await registrarAuditoria({ usuarioId: usuario.id, acao: 'LOGIN', entidade: 'Usuario', entidadeId: usuario.id });

    return { token: createToken({ id: usuario.id, role: usuario.role }), usuario: usuarioPublico(usuario) };
  });

  app.post('/magic-link', async (request) => {
    const { email } = z.object({ email: emailSchema }).parse(request.body ?? {});
    limitarMagicLink(email);

    if (!emailHabilitado() && config.producao) {
      throw new HttpError(503, 'O envio de e-mails não está configurado no servidor');
    }

    const usuario = await prisma.usuario.findUnique({ where: { email } });

    if (usuario?.ativo) {
      const token = await criarMagicLink(prisma, usuario.id);
      const link = `${config.webUrl}/magic?token=${encodeURIComponent(token)}`;

      await enviarEmail({
        para: usuario.email,
        assunto: 'Seu link de acesso - PTA Gestão Acadêmica',
        texto: `Olá, ${usuario.nome}!\n\nUse o link abaixo para entrar no sistema:\n${link}\n\nEle expira em ${MINUTOS_VALIDADE_MAGIC_LINK} minutos e só pode ser usado uma vez. Se você não pediu este acesso, ignore este e-mail.`,
        html: `<p>Olá, ${usuario.nome}!</p><p><a href="${link}">Clique aqui para entrar no sistema</a>.</p><p>O link expira em ${MINUTOS_VALIDADE_MAGIC_LINK} minutos e só pode ser usado uma vez. Se você não pediu este acesso, ignore este e-mail.</p>`,
      });

      await registrarAuditoria({ usuarioId: usuario.id, acao: 'MAGIC_LINK_SOLICITADO', entidade: 'Usuario', entidadeId: usuario.id });
    }

    // Mesma resposta sempre, para não revelar quais e-mails estão cadastrados
    return { message: 'Se o e-mail estiver cadastrado, você receberá um link de acesso em instantes.' };
  });

  app.post('/magic-validate', async (request) => {
    const { token } = z.object({ token: z.string().min(10, 'Token inválido') }).parse(request.body ?? {});

    const registro = await consumirMagicLink(prisma, token);
    if (!registro) throw new HttpError(401, 'Link inválido, expirado ou já utilizado');

    const usuario = await prisma.usuario.findUnique({ where: { id: registro.usuarioId } });
    if (!usuario || !usuario.ativo) throw new HttpError(401, 'Usuário inativo ou inexistente');

    await registrarAuditoria({ usuarioId: usuario.id, acao: 'LOGIN_MAGIC_LINK', entidade: 'Usuario', entidadeId: usuario.id });

    return { token: createToken({ id: usuario.id, role: usuario.role }), usuario: usuarioPublico(usuario) };
  });

  app.get('/me', { onRequest: autenticar(QUALQUER_PERFIL) }, async (request) => {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioLogado(request).id } });
    if (!usuario) throw new HttpError(404, 'Usuário não encontrado');
    return usuarioPublico(usuario);
  });

  app.put('/senha', { onRequest: autenticar(QUALQUER_PERFIL) }, async (request) => {
    const { senhaAtual, novaSenha } = z
      .object({ senhaAtual: z.string().min(1, 'Informe a senha atual'), novaSenha: senhaSchema })
      .parse(request.body ?? {});

    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioLogado(request).id } });
    if (!usuario || !(await bcrypt.compare(senhaAtual, usuario.senhaHash))) {
      throw new HttpError(400, 'Senha atual incorreta');
    }

    await prisma.usuario.update({ where: { id: usuario.id }, data: { senhaHash: await bcrypt.hash(novaSenha, 10) } });
    await registrarAuditoria({ usuarioId: usuario.id, acao: 'SENHA_ALTERADA', entidade: 'Usuario', entidadeId: usuario.id });

    return { message: 'Senha alterada com sucesso' };
  });

  /** Cria o primeiro administrador. Só funciona enquanto não existir nenhum usuário. */
  app.post('/bootstrap-admin', async (request, reply) => {
    if ((await prisma.usuario.count()) > 0) {
      throw new HttpError(403, 'O sistema já possui usuários. Peça a um administrador para criar sua conta.');
    }

    const dados = z
      .object({ nome: textoObrigatorio(2, 150), email: emailSchema, senha: senhaSchema })
      .parse(request.body ?? {});

    const usuario = await prisma.usuario.create({
      data: { nome: dados.nome, email: dados.email, senhaHash: await bcrypt.hash(dados.senha, 10), role: 'ADMIN' },
    });

    await registrarAuditoria({ usuarioId: usuario.id, acao: 'BOOTSTRAP_ADMIN', entidade: 'Usuario', entidadeId: usuario.id });

    return reply.code(201).send({
      token: createToken({ id: usuario.id, role: usuario.role }),
      usuario: usuarioPublico(usuario),
    });
  });
};
