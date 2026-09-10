import type { Readable } from 'stream';
import { prisma } from '../lib/prisma';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { criarPastaDrive, driveHabilitado, enviarArquivoDrive, linkPastaDrive } from '../lib/googleDrive';
import { ROTULOS_DOCUMENTO } from '../lib/semaforo';
import { abrirArquivo } from '../lib/storage';

export type DependenciasDrive = {
  habilitado: () => boolean;
  criarPasta: (nome: string) => Promise<string>;
  enviar: (arquivo: { stream: Readable; nome: string; mimeType: string; pastaId: string }) => Promise<{ id: string; link: string | null }>;
};

const dependenciasPadrao: DependenciasDrive = {
  habilitado: driveHabilitado,
  criarPasta: (nome) => criarPastaDrive(nome),
  enviar: (arquivo) => enviarArquivoDrive(arquivo),
};

const mensagem = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

const exportacoesEmAndamento = new Set<string>();

/**
 * O histórico pode ser regenerado durante a exportação (o PDF novo é salvo e o antigo apagado).
 * Se o arquivo lido sumiu, relê a referência atual da matrícula e tenta de novo.
 */
const abrirHistoricoAtual = async (matriculaId: string, ref: string) => {
  try {
    return await abrirArquivo(ref);
  } catch (erro) {
    const atual = await prisma.matricula.findUnique({ where: { id: matriculaId }, select: { historicoRef: true } });
    if (!atual?.historicoRef || atual.historicoRef === ref) throw erro;
    return abrirArquivo(atual.historicoRef);
  }
};

/**
 * Exporta a pasta do aluno para o Google Drive (manual): cria a pasta dele (uma vez) e envia os
 * documentos e históricos que ainda não estão lá. Rodar de novo só envia o que for novo.
 */
export const exportarPastaAluno = async (alunoId: string, usuarioId: string | null, dependencias: DependenciasDrive = dependenciasPadrao) => {
  if (!dependencias.habilitado()) {
    throw new HttpError(503, 'Google Drive não configurado: preencha GOOGLE_DRIVE_FOLDER_ID e as credenciais do Google no .env da API.');
  }
  if (exportacoesEmAndamento.has(alunoId)) throw new HttpError(409, 'A pasta deste aluno já está sendo exportada');

  exportacoesEmAndamento.add(alunoId);
  try {
    const aluno = await prisma.aluno.findUnique({
      where: { id: alunoId },
      include: {
        documentos: { orderBy: { criadoEm: 'asc' } },
        matriculas: { include: { turma: { select: { nome: true } } } },
      },
    });
    if (!aluno) throw new HttpError(404, 'Aluno não encontrado');

    let pastaId = aluno.driveFolderId;
    if (!pastaId) {
      try {
        pastaId = await dependencias.criarPasta(`${aluno.nome} - CPF ${aluno.cpf}`);
      } catch (erro) {
        throw new HttpError(502, `Não foi possível criar a pasta do aluno no Google Drive: ${mensagem(erro)}`);
      }
      await prisma.aluno.update({ where: { id: aluno.id }, data: { driveFolderId: pastaId } });
    }

    const enviados: string[] = [];
    const falhas: Array<{ arquivo: string; erro: string }> = [];
    let jaNoDrive = 0;

    for (const documento of aluno.documentos) {
      if (documento.driveFileId || documento.arquivoRef.startsWith('drive:')) {
        jaNoDrive += 1;
        continue;
      }
      const nome = `${ROTULOS_DOCUMENTO[documento.tipo]} - ${documento.nomeArquivo}`;
      try {
        const enviado = await dependencias.enviar({
          stream: await abrirArquivo(documento.arquivoRef),
          nome,
          mimeType: documento.mimeType,
          pastaId,
        });
        await prisma.documento.update({ where: { id: documento.id }, data: { driveFileId: enviado.id, driveLink: enviado.link } });
        enviados.push(nome);
      } catch (erro) {
        falhas.push({ arquivo: nome, erro: mensagem(erro) });
      }
    }

    for (const matricula of aluno.matriculas) {
      if (!matricula.historicoRef) continue;
      if (matricula.historicoDriveFileId || matricula.historicoRef.startsWith('drive:')) {
        jaNoDrive += 1;
        continue;
      }
      const nome = `Histórico escolar - ${matricula.turma.nome}.pdf`;
      try {
        const enviado = await dependencias.enviar({
          stream: await abrirHistoricoAtual(matricula.id, matricula.historicoRef),
          nome,
          mimeType: 'application/pdf',
          pastaId,
        });
        await prisma.matricula.update({
          where: { id: matricula.id },
          data: { historicoDriveFileId: enviado.id, historicoLink: enviado.link },
        });
        enviados.push(nome);
      } catch (erro) {
        falhas.push({ arquivo: nome, erro: mensagem(erro) });
      }
    }

    const exportadoEm = new Date();
    await prisma.aluno.update({ where: { id: alunoId }, data: { driveExportadoEm: exportadoEm } });

    await registrarAuditoria({
      usuarioId,
      acao: 'EXPORTAR_PASTA_DRIVE',
      entidade: 'Aluno',
      entidadeId: alunoId,
      detalhes: { pastaId, enviados, jaNoDrive, falhas },
    });

    return { pastaId, pastaLink: linkPastaDrive(pastaId), enviados, jaNoDrive, falhas, exportadoEm };
  } finally {
    exportacoesEmAndamento.delete(alunoId);
  }
};
