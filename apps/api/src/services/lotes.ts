import { Readable } from 'stream';
import type { FastifyRequest } from 'fastify';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import {
  compartilharComLeitor,
  copiarArquivoDrive,
  criarPastaDrive,
  driveHabilitado,
  enviarArquivoDrive,
  linkPastaDrive,
  removerArquivoDrive,
} from '../lib/googleDrive';
import { slugificar } from '../lib/http';
import { emailHabilitado } from '../lib/mailer';
import { avaliarDocumentacao, ROTULOS_DOCUMENTO } from '../lib/semaforo';
import { removerArquivo, salvarArquivo } from '../lib/storage';
import { pastaDriveEnvioAutomatico } from './academico';
import { exportarPastaAluno } from './exportacaoDrive';
import { avisarCertificadorasNovoLote, enviarCertificadoAluno } from './notificacoes';

const mensagem = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

/** Mês de referência no fuso de Brasília, "AAAA-MM". */
export const referenciaDoMes = (data = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(data).slice(0, 7);

/**
 * Matrículas que podem ir para a certificadora: histórico final gerado (todos os módulos + dados pessoais),
 * documentação aprovada, matrícula não cancelada e ainda fora de qualquer lote. As demais voltam com o motivo.
 */
export const matriculasAptas = async () => {
  const candidatas = await prisma.matricula.findMany({
    where: { historicoRef: { not: null }, itemLote: null },
    orderBy: { aluno: { nome: 'asc' } },
    include: {
      aluno: { select: { id: true, nome: true, cpf: true, condicaoGraduacao: true, documentos: { select: { tipo: true, status: true } } } },
      turma: { select: { id: true, nome: true } },
    },
  });

  const aptas = [];
  const comPendencia = [];
  for (const matricula of candidatas) {
    const { faltando, rejeitados, aguardando } = avaliarDocumentacao(matricula.aluno.condicaoGraduacao, matricula.aluno.documentos);
    const pendencias = [
      ...(matricula.situacao === 'CANCELADO' ? ['Matrícula cancelada'] : []),
      ...faltando.map((tipo) => `Falta: ${ROTULOS_DOCUMENTO[tipo]}`),
      ...rejeitados.map((tipo) => `Recusado: ${ROTULOS_DOCUMENTO[tipo]}`),
      ...aguardando.map((tipo) => `Aguardando análise: ${ROTULOS_DOCUMENTO[tipo]}`),
    ];
    const item = {
      matriculaId: matricula.id,
      aluno: { id: matricula.aluno.id, nome: matricula.aluno.nome, cpf: matricula.aluno.cpf },
      turma: matricula.turma,
      historicoGeradoEm: matricula.historicoGeradoEm,
    };
    if (pendencias.length) comPendencia.push({ ...item, pendencias });
    else aptas.push(item);
  }
  return { aptas, comPendencia };
};

const garantirAptas = async (matriculaIds: string[]) => {
  const { aptas } = await matriculasAptas();
  const idsAptos = new Set(aptas.map((apta) => apta.matriculaId));
  const invalidas = matriculaIds.filter((id) => !idsAptos.has(id));
  if (invalidas.length) {
    throw new HttpError(
      400,
      `${invalidas.length} matrícula(s) não estão aptas: é preciso ter o histórico final gerado, a documentação aprovada e não estar em outro lote.`,
    );
  }
};

const buscarLote = async (loteId: string) => {
  const lote = await prisma.loteCertificacao.findUnique({ where: { id: loteId } });
  if (!lote) throw new HttpError(404, 'Lote não encontrado');
  return lote;
};

const exigirAberto = (lote: { status: string }) => {
  if (lote.status !== 'ABERTO') throw new HttpError(409, 'Este lote já foi enviado e não pode mais ser alterado');
};

export const criarLote = async ({ referencia, matriculaIds }: { referencia?: string; matriculaIds: string[] }, usuarioId: string) => {
  const ids = [...new Set(matriculaIds)];
  await garantirAptas(ids);

  const lote = await prisma.loteCertificacao.create({
    data: {
      referencia: referencia ?? referenciaDoMes(),
      criadoPorId: usuarioId,
      itens: { create: ids.map((matriculaId) => ({ matriculaId })) },
    },
  });

  await registrarAuditoria({ usuarioId, acao: 'CRIAR', entidade: 'LoteCertificacao', entidadeId: lote.id, detalhes: { referencia: lote.referencia, alunos: ids.length } });
  return lote;
};

export const adicionarItens = async (loteId: string, matriculaIds: string[], usuarioId: string) => {
  exigirAberto(await buscarLote(loteId));
  const ids = [...new Set(matriculaIds)];
  await garantirAptas(ids);
  await prisma.itemLote.createMany({ data: ids.map((matriculaId) => ({ loteId, matriculaId })) });
  await registrarAuditoria({ usuarioId, acao: 'ADICIONAR_ALUNOS', entidade: 'LoteCertificacao', entidadeId: loteId, detalhes: { matriculaIds: ids } });
};

export const removerItem = async (loteId: string, itemId: string, usuarioId: string) => {
  exigirAberto(await buscarLote(loteId));
  const { count } = await prisma.itemLote.deleteMany({ where: { id: itemId, loteId } });
  if (!count) throw new HttpError(404, 'Aluno não encontrado neste lote');
  await registrarAuditoria({ usuarioId, acao: 'REMOVER_ALUNO', entidade: 'LoteCertificacao', entidadeId: loteId, detalhes: { itemId } });
};

export const excluirLote = async (loteId: string, usuarioId: string) => {
  exigirAberto(await buscarLote(loteId));
  await prisma.loteCertificacao.delete({ where: { id: loteId } });
  await registrarAuditoria({ usuarioId, acao: 'EXCLUIR', entidade: 'LoteCertificacao', entidadeId: loteId });
};

export type DependenciasDriveLote = {
  habilitado: () => boolean;
  criarPasta: (nome: string, pastaPaiId?: string) => Promise<string>;
  copiar: (arquivoId: string, nome: string, pastaId: string) => Promise<string>;
  enviar: (arquivo: { stream: Readable; nome: string; mimeType: string; pastaId: string }) => Promise<{ id: string; link: string | null }>;
  remover: (arquivoId: string) => Promise<void>;
  compartilhar: (pastaId: string, email: string) => Promise<void>;
  /** Garante que os arquivos do aluno estão no Drive (exportação da pasta do aluno) */
  exportarAluno: (alunoId: string, usuarioId: string | null) => Promise<unknown>;
};

const dependenciasPadrao: DependenciasDriveLote = {
  habilitado: driveHabilitado,
  criarPasta: (nome, pastaPaiId) => criarPastaDrive(nome, pastaPaiId),
  copiar: copiarArquivoDrive,
  enviar: (arquivo) => enviarArquivoDrive(arquivo),
  remover: removerArquivoDrive,
  compartilhar: compartilharComLeitor,
  exportarAluno: (alunoId, usuarioId) => exportarPastaAluno(alunoId, usuarioId),
};

const campoCsv = (valor: string) => `"${valor.replace(/"/g, '""')}"`;
const formatarCpf = (cpf: string) => cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
const formatarData = (data: Date | null) => (data ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(data) : '');
const idNoDrive = (driveFileId: string | null, ref: string | null) => driveFileId ?? (ref?.startsWith('drive:') ? ref.slice('drive:'.length) : null);

/**
 * Monta (ou completa) a pasta do lote no Drive: "Lote de certificação AAAA-MM / Aluno - CPF /" com cópias do
 * histórico e dos documentos aprovados, uma planilha-índice, e compartilha com os usuários certificadora.
 */
export const gerarPastaDriveLote = async (loteId: string, usuarioId: string | null, dependencias: DependenciasDriveLote = dependenciasPadrao) => {
  if (!dependencias.habilitado()) {
    throw new HttpError(503, 'Google Drive não configurado: preencha GOOGLE_DRIVE_FOLDER_ID e as credenciais do Google no .env da API.');
  }

  const lote = await prisma.loteCertificacao.findUnique({
    where: { id: loteId },
    include: {
      itens: {
        orderBy: { matricula: { aluno: { nome: 'asc' } } },
        include: { matricula: { include: { aluno: { select: { id: true, nome: true, cpf: true } }, turma: { select: { nome: true } } } } },
      },
    },
  });
  if (!lote) throw new HttpError(404, 'Lote não encontrado');
  if (lote.status === 'ABERTO') throw new HttpError(409, 'Envie o lote antes de montar a pasta no Drive');

  let pastaLote = lote.driveFolderId;
  if (!pastaLote) {
    pastaLote = await dependencias.criarPasta(`Lote de certificação ${lote.referencia}`);
    await prisma.loteCertificacao.update({ where: { id: loteId }, data: { driveFolderId: pastaLote } });
  }

  const falhas: Array<{ item: string; erro: string }> = [];
  let alunosNovos = 0;

  for (const item of lote.itens) {
    if (item.driveFolderId) continue;
    const { aluno, turma } = item.matricula;
    try {
      await dependencias.exportarAluno(aluno.id, usuarioId);
      const atual = await prisma.matricula.findUnique({
        where: { id: item.matriculaId },
        select: {
          historicoRef: true,
          historicoDriveFileId: true,
          aluno: { select: { documentos: { where: { status: 'APROVADO' }, select: { tipo: true, nomeArquivo: true, driveFileId: true, arquivoRef: true } } } },
        },
      });
      const historicoId = idNoDrive(atual?.historicoDriveFileId ?? null, atual?.historicoRef ?? null);
      if (!historicoId) throw new Error('o histórico ainda não está no Google Drive');

      const pastaAluno = await dependencias.criarPasta(`${aluno.nome} - CPF ${formatarCpf(aluno.cpf)}`, pastaLote);
      await dependencias.copiar(historicoId, `Histórico escolar - ${turma.nome}.pdf`, pastaAluno);
      for (const documento of atual?.aluno.documentos ?? []) {
        const documentoId = idNoDrive(documento.driveFileId, documento.arquivoRef);
        if (documentoId) await dependencias.copiar(documentoId, `${ROTULOS_DOCUMENTO[documento.tipo]} - ${documento.nomeArquivo}`, pastaAluno);
      }

      await prisma.itemLote.update({ where: { id: item.id }, data: { driveFolderId: pastaAluno } });
      alunosNovos += 1;
    } catch (erro) {
      falhas.push({ item: aluno.nome, erro: mensagem(erro) });
    }
  }

  // Planilha-índice (substitui a anterior)
  try {
    if (lote.driveIndiceId) await dependencias.remover(lote.driveIndiceId).catch(() => undefined);
    const linhas = [
      ['Nome', 'CPF', 'Turma', 'Histórico gerado em'].map(campoCsv).join(';'),
      ...lote.itens.map((item) =>
        [item.matricula.aluno.nome, formatarCpf(item.matricula.aluno.cpf), item.matricula.turma.nome, formatarData(item.matricula.historicoGeradoEm)]
          .map(campoCsv)
          .join(';'),
      ),
    ];
    const indice = await dependencias.enviar({
      stream: Readable.from(Buffer.from(`﻿${linhas.join('\r\n')}`, 'utf8')),
      nome: `Índice do lote ${lote.referencia}.csv`,
      mimeType: 'text/csv',
      pastaId: pastaLote,
    });
    await prisma.loteCertificacao.update({ where: { id: loteId }, data: { driveIndiceId: indice.id } });
  } catch (erro) {
    falhas.push({ item: 'Planilha-índice', erro: mensagem(erro) });
  }

  // Compartilha a pasta do lote com cada usuário certificadora ativo
  const compartilhadoCom: string[] = [];
  const certificadoras = await prisma.usuario.findMany({ where: { role: 'CERTIFICADORA', ativo: true }, select: { email: true } });
  for (const certificadora of certificadoras) {
    try {
      await dependencias.compartilhar(pastaLote, certificadora.email);
      compartilhadoCom.push(certificadora.email);
    } catch (erro) {
      falhas.push({ item: `Compartilhar com ${certificadora.email}`, erro: mensagem(erro) });
    }
  }

  await registrarAuditoria({
    usuarioId,
    acao: 'PASTA_LOTE_DRIVE',
    entidade: 'LoteCertificacao',
    entidadeId: loteId,
    detalhes: { pastaLote, alunosNovos, falhas, compartilhadoCom },
  });

  return { pastaId: pastaLote, pastaLink: linkPastaDrive(pastaLote), alunosNovos, falhas, compartilhadoCom };
};

/** Envia o lote: começa a contar o prazo, avisa a certificadora e, com Drive configurado, monta a pasta. */
export const enviarLote = async (loteId: string, usuarioId: string, dependencias: DependenciasDriveLote = dependenciasPadrao) => {
  const lote = await prisma.loteCertificacao.findUnique({ where: { id: loteId }, include: { _count: { select: { itens: true } } } });
  if (!lote) throw new HttpError(404, 'Lote não encontrado');
  exigirAberto(lote);
  if (lote._count.itens === 0) throw new HttpError(400, 'Adicione ao menos um aluno antes de enviar o lote');

  const enviadoEm = new Date();
  const atualizado = await prisma.loteCertificacao.update({
    where: { id: loteId },
    data: { status: 'ENVIADO', enviadoEm, prazoEm: new Date(enviadoEm.getTime() + config.certificacao.prazoDias * 24 * 60 * 60 * 1000) },
  });

  await registrarAuditoria({ usuarioId, acao: 'ENVIAR', entidade: 'LoteCertificacao', entidadeId: loteId, detalhes: { alunos: lote._count.itens } });

  let pasta: Awaited<ReturnType<typeof gerarPastaDriveLote>> | { erro: string } | null = null;
  if (dependencias.habilitado()) {
    try {
      pasta = await gerarPastaDriveLote(loteId, usuarioId, dependencias);
    } catch (erro) {
      pasta = { erro: mensagem(erro) };
    }
  }

  await avisarCertificadorasNovoLote(loteId);
  return { lote: atualizado, pasta };
};

const buscarItemDoLoteEnviado = async (loteId: string, itemId: string) => {
  const item = await prisma.itemLote.findFirst({
    where: { id: itemId, loteId },
    include: {
      lote: { select: { status: true } },
      matricula: { select: { alunoId: true, aluno: { select: { nome: true } }, turma: { select: { nome: true } } } },
    },
  });
  if (!item) throw new HttpError(404, 'Aluno não encontrado neste lote');
  if (item.lote.status === 'ABERTO') throw new HttpError(409, 'O lote ainda não foi enviado à certificadora');
  return item;
};

/** O lote fica concluído quando todos os certificados estão registrados (e volta a "enviado" se um for desfeito). */
const atualizarStatusLote = async (loteId: string) => {
  const [lote, pendentes] = await Promise.all([
    prisma.loteCertificacao.findUnique({ where: { id: loteId }, select: { status: true } }),
    prisma.itemLote.count({ where: { loteId, certificadoEmitidoEm: null } }),
  ]);
  const status = pendentes === 0 ? 'CONCLUIDO' : 'ENVIADO';
  if (!lote || lote.status === status) return;
  await prisma.loteCertificacao.update({
    where: { id: loteId },
    data: status === 'CONCLUIDO' ? { status, concluidoEm: new Date() } : { status, concluidoEm: null },
  });
};

/** Registra (ou desfaz, com emitidoEm = null) a emissão do certificado de um aluno do lote. */
export const registrarCertificado = async (
  loteId: string,
  itemId: string,
  { numero, emitidoEm }: { numero?: string | null; emitidoEm: Date | null },
  usuarioId: string,
) => {
  const item = await buscarItemDoLoteEnviado(loteId, itemId);

  await prisma.itemLote.update({
    where: { id: itemId },
    data: emitidoEm
      ? { certificadoEmitidoEm: emitidoEm, certificadoNumero: numero ?? item.certificadoNumero ?? null, registradoPorId: usuarioId }
      : {
          certificadoEmitidoEm: null,
          certificadoNumero: null,
          registradoPorId: null,
          certificadoRef: null,
          certificadoNomeArquivo: null,
          certificadoEnviadoEm: null,
          certificadoCanal: null,
        },
  });
  if (!emitidoEm) await removerArquivo(item.certificadoRef);

  await atualizarStatusLote(loteId);

  await registrarAuditoria({
    usuarioId,
    acao: emitidoEm ? 'CERTIFICADO_REGISTRADO' : 'CERTIFICADO_DESMARCADO',
    entidade: 'LoteCertificacao',
    entidadeId: loteId,
    detalhes: { itemId, numero: numero ?? null },
  });
};

/**
 * Anexa o PDF do certificado digital (certificadora ou equipe): registra a emissão se ainda não estava
 * registrada, guarda o arquivo na pasta do aluno e envia a ele por e-mail.
 */
export const anexarCertificado = async (loteId: string, itemId: string, request: FastifyRequest, usuarioId: string) => {
  const item = await buscarItemDoLoteEnviado(loteId, itemId);

  const arquivo = await request.file();
  if (!arquivo) throw new HttpError(400, 'Envie o PDF do certificado');
  if (arquivo.mimetype !== 'application/pdf') {
    arquivo.file.resume();
    throw new HttpError(415, 'O certificado deve ser um arquivo PDF');
  }

  const { alunoId, aluno, turma } = item.matricula;
  const salvo = await salvarArquivo({
    stream: arquivo.file,
    nomeArquivo: arquivo.filename || 'certificado.pdf',
    mimeType: 'application/pdf',
    subpasta: `alunos/${alunoId}`,
    pastaDriveId: await pastaDriveEnvioAutomatico(alunoId),
  });
  if (arquivo.file.truncated) {
    await removerArquivo(salvo.ref);
    throw new HttpError(413, 'Arquivo acima do tamanho máximo permitido');
  }

  await prisma.itemLote.update({
    where: { id: itemId },
    data: {
      certificadoRef: salvo.ref,
      certificadoNomeArquivo: `certificado-${slugificar(aluno.nome)}-${slugificar(turma.nome)}.pdf`,
      certificadoEmitidoEm: item.certificadoEmitidoEm ?? new Date(),
      registradoPorId: item.registradoPorId ?? usuarioId,
      // PDF novo: ainda não foi entregue
      certificadoEnviadoEm: null,
      certificadoCanal: null,
    },
  });
  if (item.certificadoRef && item.certificadoRef !== salvo.ref) await removerArquivo(item.certificadoRef);

  await atualizarStatusLote(loteId);
  await registrarAuditoria({ usuarioId, acao: 'CERTIFICADO_ANEXADO', entidade: 'LoteCertificacao', entidadeId: loteId, detalhes: { itemId } });

  const enviadoAoAluno = await enviarCertificadoAluno(itemId);
  return { enviadoAoAluno, emailConfigurado: emailHabilitado() };
};

/** Reenvia o certificado ao aluno por e-mail. */
export const reenviarCertificadoPorEmail = async (loteId: string, itemId: string, usuarioId: string) => {
  const item = await buscarItemDoLoteEnviado(loteId, itemId);
  if (!item.certificadoRef) throw new HttpError(409, 'Anexe o PDF do certificado antes de enviá-lo ao aluno');
  if (!emailHabilitado()) throw new HttpError(503, 'O e-mail (SMTP) não está configurado. Registre a entrega manual ou configure o SMTP no .env da API.');

  if (!(await enviarCertificadoAluno(itemId, { reenviar: true }))) {
    throw new HttpError(502, 'Não foi possível enviar o e-mail. Veja o motivo nos avisos da página do aluno.');
  }
  await registrarAuditoria({ usuarioId, acao: 'CERTIFICADO_ENVIADO_EMAIL', entidade: 'LoteCertificacao', entidadeId: loteId, detalhes: { itemId } });
};

/** Registra uma entrega feita fora do sistema (ex.: WhatsApp, e-mail pessoal). */
export const registrarEntregaManual = async (loteId: string, itemId: string, enviadoEm: Date, usuarioId: string) => {
  const item = await buscarItemDoLoteEnviado(loteId, itemId);
  if (!item.certificadoEmitidoEm) throw new HttpError(409, 'Registre a emissão do certificado antes da entrega');

  await prisma.itemLote.update({ where: { id: itemId }, data: { certificadoEnviadoEm: enviadoEm, certificadoCanal: 'manual' } });
  await registrarAuditoria({ usuarioId, acao: 'CERTIFICADO_ENTREGUE_MANUAL', entidade: 'LoteCertificacao', entidadeId: loteId, detalhes: { itemId, enviadoEm } });
};
