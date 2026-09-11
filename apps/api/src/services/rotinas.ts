import { enviarLembretesPendencias, verificarPrazosLotes } from './notificacoes';

const SEIS_HORAS = 6 * 60 * 60 * 1000;

let temporizador: NodeJS.Timeout | null = null;
let executando = false;

/** Tarefas periódicas: lembretes de pendências aos alunos e prazos dos lotes para a equipe. */
export const executarRotinas = async () => {
  if (executando) return;
  executando = true;
  try {
    const lembretes = await enviarLembretesPendencias();
    const prazos = await verificarPrazosLotes();
    if (lembretes || prazos) console.info(`[rotinas] ${lembretes} lembrete(s) de pendências e ${prazos} aviso(s) de prazo enviados`);
  } catch (erro) {
    console.error('[rotinas] falha ao executar tarefas periódicas:', erro);
  } finally {
    executando = false;
  }
};

export const iniciarRotinas = () => {
  // Primeira execução um minuto depois de a API subir, depois a cada 6 horas
  const primeira = setTimeout(() => void executarRotinas(), 60_000);
  primeira.unref();
  temporizador = setInterval(() => void executarRotinas(), SEIS_HORAS);
  temporizador.unref();
};

export const pararRotinas = () => {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
};
