import { createHash } from 'crypto';
import { Readable } from 'stream';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { criarPastaDrive, driveHabilitado, envioAutomaticoDrive } from '../lib/googleDrive';
import { gerarPdfHistorico, type DadosHistorico } from '../lib/historico';
import { slugificar } from '../lib/http';
import { agendarHistorico } from '../lib/queue';
import { calcularSemaforo, dadosFaltantesHistorico, matriculaConcluida, situacaoDisciplina } from '../lib/semaforo';
import { removerArquivo, salvarArquivo } from '../lib/storage';

/**
 * Recalcula o semáforo do aluno e dispara (ou invalida) o histórico final de cada matrícula.
 * Deve ser chamado sempre que documentos, notas, dados pessoais, matrículas ou módulos mudarem.
 */
export const atualizarSituacaoAluno = async (alunoId: string) => {
  const aluno = await prisma.aluno.findUnique({
    where: { id: alunoId },
    include: {
      documentos: { select: { tipo: true, status: true } },
      notas: { select: { disciplinaId: true, media: true, frequencia: true } },
      matriculas: {
        select: {
          id: true,
          historicoRef: true,
          turma: { select: { nome: true, disciplinas: { select: { id: true } } } },
        },
      },
    },
  });

  if (!aluno) return null;

  const resultado = calcularSemaforo(
    {
      condicaoGraduacao: aluno.condicaoGraduacao,
      documentos: aluno.documentos,
      dadosPessoais: aluno,
      turmas: aluno.matriculas.map((matricula) => matricula.turma),
      notas: aluno.notas,
    },
    config.regras,
  );

  if (resultado.status !== aluno.statusSemaforo) {
    await prisma.aluno.update({ where: { id: alunoId }, data: { statusSemaforo: resultado.status } });
  }

  // O histórico final sai quando o aluno conclui todos os módulos (e tem os dados que vão no histórico)
  const dadosCompletos = dadosFaltantesHistorico(aluno).length === 0;

  for (const matricula of aluno.matriculas) {
    const concluida = dadosCompletos && matriculaConcluida(matricula.turma.disciplinas, aluno.notas, config.regras);

    if (concluida) {
      await agendarHistorico(matricula.id);
    } else if (matricula.historicoRef) {
      // Deixou de estar apto (ex.: nota alterada): o histórico final antigo não vale mais
      await prisma.matricula.update({
        where: { id: matricula.id },
        data: { historicoRef: null, historicoLink: null, historicoGeradoEm: null, historicoDriveFileId: null, historicoHash: null },
      });
      await removerArquivo(matricula.historicoRef);
    }
  }

  return resultado;
};

/** Versão que nunca lança erro, para usar depois de uma operação já concluída. */
export const sincronizarAluno = async (alunoId: string) => {
  try {
    return await atualizarSituacaoAluno(alunoId);
  } catch (erro) {
    console.error(`[situacao] falha ao atualizar situação do aluno ${alunoId}:`, erro);
    return null;
  }
};

export const sincronizarTurma = async (turmaId: string) => {
  const matriculas = await prisma.matricula.findMany({ where: { turmaId }, select: { alunoId: true } });
  for (const matricula of matriculas) {
    await sincronizarAluno(matricula.alunoId);
  }
};

/** Cria (uma única vez) a pasta do aluno no Google Drive. */
export const garantirPastaAluno = async (alunoId: string) => {
  if (!driveHabilitado()) return null;

  const aluno = await prisma.aluno.findUnique({ where: { id: alunoId }, select: { id: true, nome: true, cpf: true, driveFolderId: true } });
  if (!aluno) throw new HttpError(404, 'Aluno não encontrado');
  if (aluno.driveFolderId) return aluno.driveFolderId;

  try {
    const pastaId = await criarPastaDrive(`${aluno.nome} - CPF ${aluno.cpf}`);
    await prisma.aluno.update({ where: { id: aluno.id }, data: { driveFolderId: pastaId } });
    return pastaId;
  } catch (erro) {
    throw new HttpError(502, `Falha ao criar a pasta do aluno no Google Drive: ${(erro as Error).message}`);
  }
};

/** Pasta do Drive só quando o envio automático está ligado; senão os arquivos ficam no servidor. */
export const pastaDriveEnvioAutomatico = async (alunoId: string) => (envioAutomaticoDrive() ? garantirPastaAluno(alunoId) : null);

export const montarDadosHistorico = async (matriculaId: string) => {
  const matricula = await prisma.matricula.findUnique({
    where: { id: matriculaId },
    include: {
      aluno: true,
      turma: { include: { disciplinas: { orderBy: { ordem: 'asc' } } } },
    },
  });

  if (!matricula) return null;

  const { aluno, turma } = matricula;
  const notas = await prisma.nota.findMany({
    where: { alunoId: aluno.id, disciplinaId: { in: turma.disciplinas.map((disciplina) => disciplina.id) } },
  });

  const dados: DadosHistorico = {
    instituicao: config.instituicao,
    aluno: {
      nome: aluno.nome,
      cpf: aluno.cpf,
      rgNumero: aluno.rgNumero,
      rgOrgaoEmissor: aluno.rgOrgaoEmissor,
      dataNascimento: aluno.dataNascimento,
      nacionalidade: aluno.nacionalidade,
      naturalidade: aluno.naturalidade,
      filiacao: aluno.filiacao,
    },
    turma: {
      nome: turma.nome,
      curso: turma.curso,
      resolucaoMec: turma.resolucaoMec,
      cargaHoraria: turma.cargaHoraria,
      dataInicio: turma.dataInicio,
      dataFim: turma.dataFim,
    },
    disciplinas: turma.disciplinas.map((disciplina) => {
      const nota = notas.find((item) => item.disciplinaId === disciplina.id);
      return {
        ordem: disciplina.ordem,
        nome: disciplina.nome,
        cargaHoraria: disciplina.cargaHoraria,
        docente: disciplina.docente,
        titulacao: disciplina.titulacao,
        media: nota?.media ?? null,
        frequencia: nota?.frequencia ?? null,
        situacao: situacaoDisciplina(nota, config.regras),
      };
    }),
    regras: config.regras,
    concluido: dadosFaltantesHistorico(aluno).length === 0 && matriculaConcluida(turma.disciplinas, notas, config.regras),
    emitidoEm: new Date(),
  };

  return { matricula, dados };
};

const executarGeracao = async (matriculaId: string) => {
  const resultado = await montarDadosHistorico(matriculaId);
  if (!resultado || !resultado.dados.concluido) return;

  const { matricula, dados } = resultado;

  // Só gera um PDF novo se algo que aparece no histórico mudou (ex.: aprovar um documento não muda o histórico)
  const hash = createHash('sha256')
    .update(JSON.stringify({ ...dados, emitidoEm: null }))
    .digest('hex');
  if (matricula.historicoRef && matricula.historicoHash === hash) return;

  const pdf = await gerarPdfHistorico(dados);

  // Salvo na pasta do aluno, junto com os documentos
  const salvo = await salvarArquivo({
    stream: Readable.from(pdf),
    nomeArquivo: `historico-${slugificar(dados.aluno.nome)}-${slugificar(dados.turma.nome)}.pdf`,
    mimeType: 'application/pdf',
    subpasta: `alunos/${matricula.alunoId}`,
    pastaDriveId: await pastaDriveEnvioAutomatico(matricula.alunoId),
  });

  await prisma.matricula.update({
    where: { id: matriculaId },
    // Versão nova: a cópia no Drive (se houver) fica desatualizada e será reenviada na próxima exportação
    data: {
      historicoRef: salvo.ref,
      historicoLink: salvo.link,
      historicoGeradoEm: new Date(),
      historicoDriveFileId: null,
      historicoHash: hash,
    },
  });

  if (matricula.historicoRef && matricula.historicoRef !== salvo.ref) {
    await removerArquivo(matricula.historicoRef);
  }

  await registrarAuditoria({
    acao: 'HISTORICO_GERADO',
    entidade: 'Matricula',
    entidadeId: matriculaId,
    detalhes: { alunoId: matricula.alunoId, turmaId: matricula.turmaId, arquivo: salvo.ref },
  });
};

const geracoesEmAndamento = new Map<string, Promise<void>>();

/** Gera e arquiva o histórico final. Execuções para a mesma matrícula rodam em sequência. */
export const gerarHistoricoFinal = async (matriculaId: string): Promise<void> => {
  const anterior = geracoesEmAndamento.get(matriculaId) ?? Promise.resolve();
  const atual = anterior.catch(() => undefined).then(() => executarGeracao(matriculaId));
  geracoesEmAndamento.set(matriculaId, atual);

  try {
    await atual;
  } finally {
    if (geracoesEmAndamento.get(matriculaId) === atual) geracoesEmAndamento.delete(matriculaId);
  }
};
