import { config } from './config';
import { buildApp } from './app';
import { prisma } from './lib/prisma';
import { emailHabilitado } from './lib/mailer';
import { encerrarFila, iniciarFila, modoFila } from './lib/queue';
import { armazenamentoAtual } from './lib/storage';
import { gerarHistoricoFinal } from './services/academico';
import { statusCademi } from './lib/cademi';
import { iniciarSincronizacaoAutomatica, pararSincronizacaoAutomatica } from './services/cademi';
import { iniciarRotinas, pararRotinas } from './services/rotinas';

const iniciar = async () => {
  try {
    await prisma.$connect();
  } catch (erro) {
    console.error(
      'Não foi possível conectar ao banco de dados. Confira DATABASE_URL em apps/api/.env e se o PostgreSQL está rodando.\n',
      (erro as Error).message,
    );
    process.exit(1);
  }

  const app = await buildApp();
  iniciarFila(gerarHistoricoFinal);
  const cademiAutomatica = iniciarSincronizacaoAutomatica();
  iniciarRotinas();

  const encerrar = async (sinal: string) => {
    console.info(`\n[api] ${sinal} recebido, encerrando...`);
    await app.close().catch(() => undefined);
    pararSincronizacaoAutomatica();
    pararRotinas();
    await encerrarFila();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void encerrar('SIGINT'));
  process.once('SIGTERM', () => void encerrar('SIGTERM'));

  await app.listen({ port: config.port, host: config.host });

  console.info(
    [
      `API rodando em http://localhost:${config.port}`,
      `  Armazenamento de arquivos: ${armazenamentoAtual() === 'google-drive' ? 'Google Drive' : `local (${config.storageDir})`}`,
      `  E-mail: ${emailHabilitado() ? 'SMTP' : 'somente console (SMTP não configurado)'}`,
      `  Fila de históricos: ${modoFila() === 'redis' ? 'Redis/BullMQ' : 'no próprio processo'}`,
      `  Notas da Cademi: ${
        {
          desativada: 'não configurada',
          pendente: 'configurada, aguardando a implementação da leitura de notas (src/lib/cademi.ts)',
          ativa: cademiAutomatica
            ? `ativa (importação automática a cada ${config.cademi.intervaloMinutos} min)`
            : 'ativa (importação pelo botão na turma)',
        }[statusCademi()]
      }`,
    ].join('\n'),
  );
};

iniciar().catch((erro) => {
  console.error('Falha ao iniciar a API:', erro);
  process.exit(1);
});
