import { config } from '../config';
import { prisma } from '../lib/prisma';
import { gerarLinkAcessoAluno } from '../lib/acessoAluno';
import { ROTULOS_CAMPOS, type CampoEditavel } from '../lib/correcaoDados';
import { emailHabilitado, enviarEmail } from '../lib/mailer';
import { avaliarDocumentacao, dadosFaltantesHistorico, ROTULOS_DOCUMENTO } from '../lib/semaforo';

type Mensagem = { titulo: string; paragrafos: string[]; botao?: { texto: string; link: string } };

const escaparHtml = (texto: string) =>
  texto.replace(/[&<>"]/g, (caractere) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[caractere] ?? caractere);

export const montarEmail = ({ titulo, paragrafos, botao }: Mensagem) => ({
  texto: [...paragrafos, ...(botao ? [`${botao.texto}: ${botao.link}`] : [])].join('\n\n'),
  html: [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1e293b;max-width:560px">',
    `<h2 style="font-size:18px;margin:0 0 12px">${escaparHtml(titulo)}</h2>`,
    ...paragrafos.map((paragrafo) => `<p style="margin:0 0 10px">${escaparHtml(paragrafo)}</p>`),
    botao
      ? `<p style="margin:16px 0"><a href="${escaparHtml(botao.link)}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none">${escaparHtml(botao.texto)}</a></p>`
      : '',
    `<p style="color:#64748b;font-size:12px;margin-top:20px">${escaparHtml(config.instituicao)}</p>`,
    '</div>',
  ].join(''),
});

type Aviso = {
  para: string;
  tipo: string;
  assunto: string;
  mensagem: Mensagem;
  alunoId?: string | null;
  /** Com referência, o mesmo aviso (tipo + referência + destinatário) só é enviado uma vez */
  referencia?: string | null;
};

/** Envia e registra um aviso. Nunca lança erro: avisos não podem derrubar a operação principal. */
export const enviarAviso = async ({ para, tipo, assunto, mensagem, alunoId = null, referencia = null }: Aviso) => {
  if (!config.avisos.email) return false;

  try {
    if (referencia && (await prisma.notificacao.findFirst({ where: { tipo, referencia, para } }))) return false;

    const { texto, html } = montarEmail(mensagem);
    let erro: string | null = null;
    try {
      await enviarEmail({ para, assunto, texto, html });
    } catch (falha) {
      erro = (falha as Error).message;
    }

    await prisma.notificacao.create({
      data: { para, tipo, referencia, alunoId, assunto, enviado: !erro && emailHabilitado(), erro },
    });
    return !erro;
  } catch (falha) {
    console.error(`[avisos] falha ao processar aviso ${tipo}:`, falha);
    return false;
  }
};

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0];

const formatarData = (data: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(data);

/** Protege cada aviso: qualquer erro é logado e ignorado. */
const seguro =
  <A extends unknown[]>(nome: string, funcao: (...args: A) => Promise<unknown>) =>
  async (...args: A) => {
    try {
      await funcao(...args);
    } catch (erro) {
      console.error(`[avisos] ${nome}:`, erro);
    }
  };

/** Link pessoal de acesso ao portal (gera um novo, que substitui o anterior). */
const linkDoPortal = async (alunoId: string) => (await gerarLinkAcessoAluno(alunoId)).link;

export const avisarDocumentoRejeitado = seguro('documento rejeitado', async (documentoId: string) => {
  const documento = await prisma.documento.findUnique({
    where: { id: documentoId },
    include: { aluno: { select: { id: true, nome: true, email: true } } },
  });
  if (!documento || documento.status !== 'REJEITADO') return;

  await enviarAviso({
    para: documento.aluno.email,
    alunoId: documento.aluno.id,
    tipo: 'DOCUMENTO_REJEITADO',
    assunto: 'Um documento precisa ser reenviado',
    mensagem: {
      titulo: 'Documento recusado',
      paragrafos: [
        `Olá, ${primeiroNome(documento.aluno.nome)}!`,
        `O documento "${ROTULOS_DOCUMENTO[documento.tipo]}" (${documento.nomeArquivo}) foi recusado pela secretaria.`,
        `Motivo: ${documento.motivoRejeicao ?? 'não informado'}.`,
        'Envie uma nova versão pelo portal do aluno.',
      ],
      botao: { texto: 'Abrir o portal do aluno', link: await linkDoPortal(documento.aluno.id) },
    },
  });
});

export const avisarDocumentacaoCompleta = seguro('documentação completa', async (alunoId: string) => {
  const aluno = await prisma.aluno.findUnique({ where: { id: alunoId }, select: { id: true, nome: true, email: true } });
  if (!aluno) return;

  await enviarAviso({
    para: aluno.email,
    alunoId,
    tipo: 'DOCUMENTACAO_COMPLETA',
    referencia: alunoId,
    assunto: 'Sua documentação foi aprovada',
    mensagem: {
      titulo: 'Documentação aprovada',
      paragrafos: [`Olá, ${primeiroNome(aluno.nome)}!`, 'Todos os documentos exigidos foram analisados e aprovados pela secretaria.'],
    },
  });
});

export const avisarModulosConcluidos = seguro('módulos concluídos', async (matriculaId: string) => {
  const matricula = await prisma.matricula.findUnique({
    where: { id: matriculaId },
    include: { aluno: { select: { id: true, nome: true, email: true } }, turma: { select: { nome: true } } },
  });
  if (!matricula) return;

  await enviarAviso({
    para: matricula.aluno.email,
    alunoId: matricula.aluno.id,
    tipo: 'MODULOS_CONCLUIDOS',
    referencia: matriculaId,
    assunto: 'Você concluiu todos os módulos!',
    mensagem: {
      titulo: 'Parabéns pela conclusão!',
      paragrafos: [
        `Olá, ${primeiroNome(matricula.aluno.nome)}!`,
        `Você foi aprovado em todos os módulos de ${matricula.turma.nome}.`,
        'Seu histórico escolar foi gerado e, com a documentação aprovada, seguirá no próximo lote enviado à certificadora.',
      ],
    },
  });
});

export const avisarCertificadoEmitido = seguro('certificado emitido', async (itemLoteId: string) => {
  const item = await prisma.itemLote.findUnique({
    where: { id: itemLoteId },
    include: { matricula: { include: { aluno: { select: { id: true, nome: true, email: true } }, turma: { select: { nome: true } } } } },
  });
  if (!item?.certificadoEmitidoEm) return;
  const { aluno, turma } = item.matricula;

  await enviarAviso({
    para: aluno.email,
    alunoId: aluno.id,
    tipo: 'CERTIFICADO_EMITIDO',
    referencia: itemLoteId,
    assunto: 'Seu certificado foi emitido',
    mensagem: {
      titulo: 'Certificado emitido',
      paragrafos: [
        `Olá, ${primeiroNome(aluno.nome)}!`,
        `O certificado de ${turma.nome} foi emitido pela certificadora em ${formatarData(item.certificadoEmitidoEm)}${
          item.certificadoNumero ? ` (nº ${item.certificadoNumero})` : ''
        }.`,
        'A secretaria entrará em contato com as orientações de entrega.',
      ],
    },
  });
});

export const avisarSolicitacaoAnalisada = seguro('solicitação analisada', async (solicitacaoId: string) => {
  const solicitacao = await prisma.solicitacaoAlteracao.findUnique({
    where: { id: solicitacaoId },
    include: { aluno: { select: { id: true, nome: true, email: true } } },
  });
  if (!solicitacao || solicitacao.status === 'PENDENTE') return;

  const campos = Object.keys(JSON.parse(solicitacao.dados) as Record<string, unknown>)
    .map((campo) => ROTULOS_CAMPOS[campo as CampoEditavel] ?? campo)
    .join(', ');
  const aprovada = solicitacao.status === 'APROVADA';

  await enviarAviso({
    para: solicitacao.aluno.email,
    alunoId: solicitacao.aluno.id,
    tipo: aprovada ? 'CORRECAO_APROVADA' : 'CORRECAO_RECUSADA',
    referencia: solicitacaoId,
    assunto: aprovada ? 'Correção dos seus dados aprovada' : 'Correção dos seus dados não aprovada',
    mensagem: {
      titulo: aprovada ? 'Dados atualizados' : 'Correção não aprovada',
      paragrafos: [
        `Olá, ${primeiroNome(solicitacao.aluno.nome)}!`,
        aprovada
          ? `A secretaria aprovou a correção de: ${campos}.`
          : `A secretaria não aprovou a correção de: ${campos}. Motivo: ${solicitacao.motivoRecusa ?? 'não informado'}.`,
      ],
      botao: aprovada ? undefined : { texto: 'Abrir o portal do aluno', link: await linkDoPortal(solicitacao.aluno.id) },
    },
  });
});

export const avisarCertificadorasNovoLote = seguro('novo lote', async (loteId: string) => {
  const lote = await prisma.loteCertificacao.findUnique({ where: { id: loteId }, include: { _count: { select: { itens: true } } } });
  if (!lote) return;
  const certificadoras = await prisma.usuario.findMany({ where: { role: 'CERTIFICADORA', ativo: true }, select: { email: true } });

  for (const certificadora of certificadoras) {
    await enviarAviso({
      para: certificadora.email,
      tipo: 'LOTE_ENVIADO',
      referencia: loteId,
      assunto: `Novo lote de certificação: ${lote.referencia}`,
      mensagem: {
        titulo: `Lote ${lote.referencia} enviado`,
        paragrafos: [
          `Foi enviado um lote com ${lote._count.itens} aluno(s) para certificação.`,
          lote.prazoEm ? `Prazo de entrega: ${formatarData(lote.prazoEm)}.` : '',
          'Os históricos e documentos estão na pasta do lote no Google Drive, compartilhada com este e-mail. Registre os certificados emitidos no sistema.',
        ].filter(Boolean),
        botao: { texto: 'Abrir o lote', link: `${config.webUrl}/lotes/${loteId}` },
      },
    });
  }
});

/** Lembrete periódico para quem ainda tem documento faltando/recusado ou dados incompletos. */
export const enviarLembretesPendencias = async (agora = new Date()) => {
  const dias = config.avisos.lembretePendenciasDias;
  if (dias <= 0 || !config.avisos.email) return 0;
  const limite = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);

  const alunos = await prisma.aluno.findMany({
    where: {
      criadoEm: { lt: limite }, // quem acabou de se inscrever ainda não recebe lembrete
      matriculas: { some: { turma: { ativa: true } } },
      OR: [{ ultimoLembreteEm: null }, { ultimoLembreteEm: { lt: limite } }],
    },
    include: { documentos: { select: { tipo: true, status: true } } },
  });

  let enviados = 0;
  for (const aluno of alunos) {
    const { faltando, rejeitados } = avaliarDocumentacao(aluno.condicaoGraduacao, aluno.documentos);
    const dadosFaltando = dadosFaltantesHistorico(aluno);
    if (!faltando.length && !rejeitados.length && !dadosFaltando.length) continue;

    const itens = [
      ...faltando.map((tipo) => `Enviar: ${ROTULOS_DOCUMENTO[tipo]}`),
      ...rejeitados.map((tipo) => `Reenviar (recusado): ${ROTULOS_DOCUMENTO[tipo]}`),
      ...(dadosFaltando.length ? [`Completar seus dados: ${dadosFaltando.join(', ')}`] : []),
    ];

    await enviarAviso({
      para: aluno.email,
      alunoId: aluno.id,
      tipo: 'LEMBRETE_PENDENCIAS',
      assunto: 'Pendências na sua documentação',
      mensagem: {
        titulo: 'Ainda falta pouco',
        paragrafos: [`Olá, ${primeiroNome(aluno.nome)}!`, 'Para concluirmos o seu cadastro, ainda precisamos de:', ...itens.map((item) => `- ${item}`)],
        botao: { texto: 'Abrir o portal do aluno', link: await linkDoPortal(aluno.id) },
      },
    });
    await prisma.aluno.update({ where: { id: aluno.id }, data: { ultimoLembreteEm: agora } });
    enviados += 1;
  }
  return enviados;
};

/** Avisa a equipe quando o prazo de um lote está perto de vencer ou já venceu (uma vez cada). */
export const verificarPrazosLotes = async (agora = new Date()) => {
  const lotes = await prisma.loteCertificacao.findMany({
    where: { status: 'ENVIADO', prazoEm: { not: null } },
    include: { itens: { where: { certificadoEmitidoEm: null }, select: { id: true } } },
  });
  if (!lotes.length) return 0;

  const equipe = await prisma.usuario.findMany({ where: { ativo: true, role: { in: ['ADMIN', 'SECRETARIA'] } }, select: { email: true } });
  let avisos = 0;

  for (const lote of lotes) {
    if (!lote.prazoEm || lote.itens.length === 0) continue;
    const diasRestantes = Math.ceil((lote.prazoEm.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000));
    const vencido = diasRestantes < 0;
    if (!vencido && diasRestantes > config.certificacao.alertaDias) continue;

    for (const pessoa of equipe) {
      const enviado = await enviarAviso({
        para: pessoa.email,
        tipo: vencido ? 'LOTE_VENCIDO' : 'LOTE_PRAZO',
        referencia: lote.id,
        assunto: vencido ? `Prazo vencido: lote ${lote.referencia}` : `Prazo do lote ${lote.referencia} vence em ${diasRestantes} dia(s)`,
        mensagem: {
          titulo: vencido ? 'Prazo da certificadora vencido' : 'Prazo da certificadora perto do fim',
          paragrafos: [
            `Lote ${lote.referencia}: ${lote.itens.length} certificado(s) ainda não registrado(s).`,
            `Prazo: ${formatarData(lote.prazoEm)}.`,
          ],
          botao: { texto: 'Abrir o lote', link: `${config.webUrl}/lotes/${lote.id}` },
        },
      });
      if (enviado) avisos += 1;
    }
  }
  return avisos;
};
