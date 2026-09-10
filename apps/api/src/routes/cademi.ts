import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { autenticar, EQUIPE, usuarioLogado } from '../lib/auth';
import { cademiConfigurada, cademiImplementada, statusCademi } from '../lib/cademi';
import { idParams } from '../lib/validation';
import { lerDetalhesSincronizacao, sincronizarTurmaCademi } from '../services/cademi';

export const cademiRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', autenticar(EQUIPE));

  app.get('/status', async () => ({
    status: statusCademi(),
    configurada: cademiConfigurada(),
    implementada: cademiImplementada(),
    sincronizacaoAutomaticaMinutos: config.cademi.intervaloMinutos,
  }));

  /** Importa agora as notas da Cademi para os módulos vinculados da turma. */
  app.post('/turmas/:id/sincronizar', async (request) => {
    const { id } = idParams.parse(request.params);
    return sincronizarTurmaCademi(id, { usuarioId: usuarioLogado(request).id });
  });

  app.get('/turmas/:id/sincronizacoes', async (request) => {
    const { id } = idParams.parse(request.params);

    const sincronizacoes = await prisma.sincronizacaoCademi.findMany({
      where: { turmaId: id },
      orderBy: { iniciadoEm: 'desc' },
      take: 10,
      include: { usuario: { select: { nome: true } } },
    });

    return sincronizacoes.map((item) => ({ ...item, detalhes: lerDetalhesSincronizacao(item.detalhes) }));
  });
};
