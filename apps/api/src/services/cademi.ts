import { config } from '../config';
import { prisma } from '../lib/prisma';
import { registrarAuditoria } from '../lib/audit';
import { buscarNotasCademi, cademiConfigurada, cademiImplementada, casarNotasCademi } from '../lib/cademi';
import { HttpError } from '../lib/errors';
import { sincronizarAluno } from './academico';

const turmasEmImportacao = new Set<string>();

export const lerDetalhesSincronizacao = (detalhes: string | null) => {
  if (!detalhes) return null;
  try {
    return JSON.parse(detalhes) as Record<string, unknown>;
  } catch {
    return { erro: detalhes };
  }
};

type OpcoesSincronizacao = { usuarioId?: string | null; automatica?: boolean };

/** Importa da Cademi as notas dos módulos vinculados de uma turma (uma importação por turma de cada vez). */
export const sincronizarTurmaCademi = async (turmaId: string, opcoes: OpcoesSincronizacao = {}) => {
  if (turmasEmImportacao.has(turmaId)) {
    throw new HttpError(409, 'Já existe uma importação da Cademi em andamento para esta turma');
  }

  // Trava a turma antes de qualquer await, para duas requisições simultâneas não passarem juntas
  turmasEmImportacao.add(turmaId);
  try {
    return await executarSincronizacao(turmaId, opcoes);
  } finally {
    turmasEmImportacao.delete(turmaId);
  }
};

const executarSincronizacao = async (turmaId: string, { usuarioId = null, automatica = false }: OpcoesSincronizacao) => {
  const turma = await prisma.turma.findUnique({
    where: { id: turmaId },
    include: {
      disciplinas: { select: { id: true, nome: true, cademiId: true } },
      matriculas: { select: { aluno: { select: { id: true, cademiId: true, email: true, cpf: true } } } },
    },
  });
  if (!turma) throw new HttpError(404, 'Turma não encontrada');

  const modulosVinculados = turma.disciplinas.filter((disciplina) => disciplina.cademiId);
  if (modulosVinculados.length === 0) {
    throw new HttpError(400, 'Nenhum módulo desta turma está vinculado à Cademi. Preencha o "ID na Cademi" dos módulos.');
  }

  const sincronizacao = await prisma.sincronizacaoCademi.create({ data: { turmaId, usuarioId, automatica } });

  try {
    const registros = await buscarNotasCademi(modulosVinculados.map((disciplina) => disciplina.cademiId as string));
    const resultado = casarNotasCademi(
      turma.matriculas.map((matricula) => matricula.aluno),
      turma.disciplinas,
      registros,
    );

    // Não reaproveita um ID da Cademi que já pertence a outro aluno
    const idsNovos = resultado.vinculos.map((vinculo) => vinculo.cademiId);
    const idsEmUso = new Set(
      idsNovos.length
        ? (await prisma.aluno.findMany({ where: { cademiId: { in: idsNovos } }, select: { cademiId: true } })).map((aluno) => aluno.cademiId)
        : [],
    );
    const vinculos = resultado.vinculos.filter((vinculo) => !idsEmUso.has(vinculo.cademiId));

    const agora = new Date();
    await prisma.$transaction([
      ...resultado.notas.map((nota) =>
        prisma.nota.upsert({
          where: { alunoId_disciplinaId: { alunoId: nota.alunoId, disciplinaId: nota.disciplinaId } },
          create: {
            alunoId: nota.alunoId,
            disciplinaId: nota.disciplinaId,
            media: nota.media,
            frequencia: nota.frequencia ?? null,
            lancadoPorId: usuarioId,
            origem: 'CADEMI',
            importadoEm: agora,
          },
          update: {
            media: nota.media,
            ...(nota.frequencia !== undefined ? { frequencia: nota.frequencia } : {}),
            lancadoPorId: usuarioId,
            origem: 'CADEMI',
            importadoEm: agora,
          },
        }),
      ),
      ...vinculos.map((vinculo) => prisma.aluno.update({ where: { id: vinculo.alunoId }, data: { cademiId: vinculo.cademiId } })),
    ]);

    for (const alunoId of new Set(resultado.notas.map((nota) => nota.alunoId))) {
      await sincronizarAluno(alunoId);
    }

    const detalhes = {
      totalRecebido: registros.length,
      alunosNaoEncontrados: resultado.alunosNaoEncontrados,
      modulosNaoEncontrados: resultado.modulosNaoEncontrados,
      ignorados: resultado.ignorados,
      semNota: resultado.semNota,
      vinculosCriados: vinculos.length,
    };
    const comPendencias =
      resultado.alunosNaoEncontrados.length > 0 || resultado.modulosNaoEncontrados.length > 0 || resultado.ignorados.length > 0;

    const concluida = await prisma.sincronizacaoCademi.update({
      where: { id: sincronizacao.id },
      data: {
        status: comPendencias ? 'PARCIAL' : 'SUCESSO',
        notasImportadas: resultado.notas.length,
        notasIgnoradas: registros.length - resultado.notas.length,
        detalhes: JSON.stringify(detalhes),
        concluidoEm: new Date(),
      },
    });

    await registrarAuditoria({
      usuarioId,
      acao: 'IMPORTAR_NOTAS_CADEMI',
      entidade: 'Turma',
      entidadeId: turmaId,
      detalhes: { automatica, notasImportadas: concluida.notasImportadas, ...detalhes },
    });

    return { ...concluida, detalhes };
  } catch (erro) {
    await prisma.sincronizacaoCademi.update({
      where: { id: sincronizacao.id },
      data: { status: 'ERRO', detalhes: JSON.stringify({ erro: (erro as Error).message }), concluidoEm: new Date() },
    });
    throw erro;
  }
};

let temporizador: NodeJS.Timeout | null = null;

/** Importação periódica de todas as turmas ativas com módulos vinculados. Retorna se foi ativada. */
export const iniciarSincronizacaoAutomatica = () => {
  const minutos = config.cademi.intervaloMinutos;
  if (minutos <= 0) return false;

  if (!cademiImplementada()) {
    if (cademiConfigurada()) {
      console.warn('[cademi] importação automática não iniciada: a leitura de notas da Cademi ainda não foi implementada');
    }
    return false;
  }

  let executando = false;
  const executar = async () => {
    if (executando) return;
    executando = true;
    try {
      const turmas = await prisma.turma.findMany({
        where: { ativa: true, disciplinas: { some: { cademiId: { not: null } } } },
        select: { id: true, nome: true },
      });
      for (const turma of turmas) {
        try {
          await sincronizarTurmaCademi(turma.id, { automatica: true });
        } catch (erro) {
          console.warn(`[cademi] falha ao importar notas da turma "${turma.nome}":`, (erro as Error).message);
        }
      }
    } finally {
      executando = false;
    }
  };

  temporizador = setInterval(() => void executar().catch((erro) => console.error('[cademi]', erro)), minutos * 60_000);
  temporizador.unref();
  return true;
};

export const pararSincronizacaoAutomatica = () => {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
};
