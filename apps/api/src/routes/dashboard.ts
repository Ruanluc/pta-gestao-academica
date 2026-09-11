import type { FastifyPluginAsync } from 'fastify';
import type { StatusSemaforo } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { autenticar } from '../lib/auth';
import { emailHabilitado } from '../lib/mailer';
import { modoFila } from '../lib/queue';
import { statusCademi } from '../lib/cademi';
import { driveHabilitado, envioAutomaticoDrive } from '../lib/googleDrive';
import { armazenamentoAtual } from '../lib/storage';

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', autenticar());

  app.get('/', async () => {
    const [turmasAtivas, totalTurmas, totalAlunos, documentosPendentes, porStatus] = await Promise.all([
      prisma.turma.count({ where: { ativa: true } }),
      prisma.turma.count(),
      prisma.aluno.count(),
      prisma.documento.count({ where: { status: 'PENDENTE' } }),
      prisma.aluno.groupBy({ by: ['statusSemaforo'], _count: { _all: true } }),
    ]);

    const [lotesAbertos, lotesComCertificadora, solicitacoesPendentes, proximoLote] = await Promise.all([
      prisma.loteCertificacao.count({ where: { status: 'ABERTO' } }),
      prisma.loteCertificacao.count({ where: { status: 'ENVIADO' } }),
      prisma.solicitacaoAlteracao.count({ where: { status: 'PENDENTE' } }),
      prisma.loteCertificacao.findFirst({
        where: { status: 'ENVIADO', prazoEm: { not: null } },
        orderBy: { prazoEm: 'asc' },
        select: { id: true, referencia: true, prazoEm: true, itens: { where: { certificadoEmitidoEm: null }, select: { id: true } } },
      }),
    ]);

    const semaforo: Record<StatusSemaforo, number> = { VERDE: 0, AMARELO: 0, VERMELHO: 0 };
    for (const grupo of porStatus) semaforo[grupo.statusSemaforo] = grupo._count._all;

    return {
      turmasAtivas,
      totalTurmas,
      totalAlunos,
      documentosPendentes,
      semaforo,
      solicitacoesPendentes,
      certificacao: {
        lotesAbertos,
        lotesComCertificadora,
        proximoPrazo: proximoLote
          ? { id: proximoLote.id, referencia: proximoLote.referencia, prazoEm: proximoLote.prazoEm, pendentes: proximoLote.itens.length }
          : null,
      },
      regras: config.regras,
      integracoes: {
        armazenamento: armazenamentoAtual(),
        email: emailHabilitado() ? 'smtp' : 'console',
        fila: modoFila(),
        cademi: statusCademi(),
        drive: !driveHabilitado() ? 'desativado' : envioAutomaticoDrive() ? 'automatico' : 'manual',
      },
    };
  });
};
