import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config';

let transporter: Transporter | null | undefined;

const obterTransporter = () => {
  if (transporter !== undefined) return transporter;

  const { host, port, secure, user, pass } = config.smtp;
  transporter = host
    ? nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined })
    : null;

  return transporter;
};

export const emailHabilitado = () => obterTransporter() !== null;

/** Envia e-mail via SMTP. Sem SMTP configurado, apenas escreve a mensagem no console da API. */
export const enviarEmail = async ({ para, assunto, texto, html }: { para: string; assunto: string; texto: string; html?: string }) => {
  const atual = obterTransporter();

  if (!atual) {
    // Em produção o conteúdo não vai para o log: os e-mails levam links de acesso pessoais
    if (config.producao) {
      console.warn(`[email] SMTP não configurado: e-mail "${assunto}" para ${para} não foi enviado`);
    } else {
      console.info(`[email] SMTP não configurado. Mensagem para ${para}\nAssunto: ${assunto}\n${texto}`);
    }
    return;
  }

  await atual.sendMail({
    from: config.smtp.from ?? config.smtp.user,
    to: para,
    subject: assunto,
    text: texto,
    html,
  });
};
