import { HttpError } from './errors';

/** Limitador simples em memória (suficiente para uma única instância da API). */
export const criarLimitador = ({ max, janelaMs }: { max: number; janelaMs: number }) => {
  const tentativas = new Map<string, { total: number; expiraEm: number }>();

  return (chave: string) => {
    const agora = Date.now();

    if (tentativas.size > 10_000) {
      for (const [item, registro] of tentativas) {
        if (registro.expiraEm < agora) tentativas.delete(item);
      }
    }

    const registro = tentativas.get(chave);
    if (!registro || registro.expiraEm < agora) {
      tentativas.set(chave, { total: 1, expiraEm: agora + janelaMs });
      return;
    }

    registro.total += 1;
    if (registro.total > max) {
      throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
    }
  };
};
