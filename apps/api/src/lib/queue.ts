import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';

type Processador = (matriculaId: string) => Promise<void>;

const NOME_FILA = 'historico-escolar';

let processador: Processador | null = null;
let fila: Queue | null = null;
let worker: Worker | null = null;
const conexoes: IORedis[] = [];

export const modoFila = () => (fila ? 'redis' : 'processo');

/**
 * Com REDIS_URL, a geração de históricos roda numa fila BullMQ (com novas tentativas).
 * Sem Redis, roda no próprio processo da API logo após a requisição.
 */
export const iniciarFila = (novoProcessador: Processador) => {
  processador = novoProcessador;

  if (!config.redisUrl) {
    console.info('[fila] REDIS_URL não definido: os históricos serão gerados no próprio processo da API');
    return;
  }

  let ultimoAviso = 0;
  const avisar = (erro: Error) => {
    if (Date.now() - ultimoAviso < 60_000) return;
    ultimoAviso = Date.now();
    console.warn(`[fila] Redis indisponível (${erro.message}). Enquanto isso, os históricos serão gerados no processo da API.`);
  };

  // A conexão da fila falha rápido (sem fila offline) para podermos cair no modo local
  const conexaoFila = new IORedis(config.redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  const conexaoWorker = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  conexaoFila.on('error', avisar);
  conexaoWorker.on('error', avisar);
  conexoes.push(conexaoFila, conexaoWorker);

  fila = new Queue(NOME_FILA, { connection: conexaoFila });
  fila.on('error', avisar);

  worker = new Worker<{ matriculaId: string }>(NOME_FILA, async (job) => novoProcessador(job.data.matriculaId), {
    connection: conexaoWorker,
  });
  worker.on('error', avisar);
  worker.on('failed', (job, erro) => {
    console.error(`[fila] falha ao gerar histórico da matrícula ${job?.data.matriculaId}:`, erro.message);
  });
};

const executarNoProcesso = (matriculaId: string) => {
  const atual = processador;
  if (!atual) return;

  setImmediate(() => {
    atual(matriculaId).catch((erro) => console.error(`[historico] falha ao gerar histórico da matrícula ${matriculaId}:`, erro));
  });
};

export const agendarHistorico = async (matriculaId: string) => {
  if (fila) {
    try {
      await fila.add(
        'gerar-historico',
        { matriculaId },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
      );
      return;
    } catch (erro) {
      console.warn('[fila] não foi possível enfileirar, gerando no processo:', (erro as Error).message);
    }
  }

  executarNoProcesso(matriculaId);
};

export const encerrarFila = async () => {
  await worker?.close().catch(() => undefined);
  await fila?.close().catch(() => undefined);
  conexoes.forEach((conexao) => conexao.disconnect());
};
