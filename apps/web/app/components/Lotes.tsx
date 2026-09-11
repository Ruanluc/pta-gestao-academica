'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { formatarData, mascararCpf } from '../lib/formato';
import { ROTULOS_STATUS_LOTE, type Aptos, type StatusLote } from '../lib/tipos';
import { Aviso, Carregando, cls, useMensagem, Vazio } from './ui';

const UM_DIA = 24 * 60 * 60 * 1000;

export const diasAte = (data: string) => Math.ceil((new Date(data).getTime() - Date.now()) / UM_DIA);

const dataLocal = (data: string) => new Date(data).toLocaleDateString('pt-BR');

export function StatusLoteBadge({ status }: { status: StatusLote }) {
  const cores: Record<StatusLote, string> = {
    ABERTO: 'border-slate-200 bg-slate-50 text-slate-700',
    ENVIADO: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    CONCLUIDO: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
  return (
    <span className={cls('inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', cores[status])}>
      {ROTULOS_STATUS_LOTE[status]}
    </span>
  );
}

export function PrazoLote({ status, prazoEm }: { status: StatusLote; prazoEm: string | null }) {
  if (status === 'CONCLUIDO') return <span className="text-xs font-medium text-emerald-700">Concluído</span>;
  if (!prazoEm) return <span className="text-xs text-slate-400">—</span>;

  const dias = diasAte(prazoEm);
  if (dias < 0) return <span className="text-xs font-semibold text-rose-700">Vencido há {-dias} dia(s)</span>;
  if (dias <= 5) {
    return (
      <span className="text-xs font-semibold text-amber-700">
        {dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia(s)`} ({dataLocal(prazoEm)})
      </span>
    );
  }
  return (
    <span className="text-xs text-slate-600">
      {dataLocal(prazoEm)} · {dias} dias
    </span>
  );
}

/** Lista de alunos aptos a entrar em um lote, com seleção; mostra também quem tem pendência e por quê. */
export function SeletorAptos({
  textoBotao,
  onConfirmar,
  onCancelar,
  extra,
}: {
  textoBotao: string;
  onConfirmar: (matriculaIds: string[]) => Promise<void>;
  onCancelar: () => void;
  extra?: ReactNode;
}) {
  const [dados, setDados] = useState<Aptos | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const { mensagem, erro, limpar } = useMensagem();

  useEffect(() => {
    api<Aptos>('/lotes/aptos')
      .then((resposta) => {
        setDados(resposta);
        setSelecionados(new Set(resposta.aptas.map((apta) => apta.matriculaId)));
      })
      .catch(erro);
  }, [erro]);

  const alternar = (id: string) =>
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(id)) proximos.delete(id);
      else proximos.add(id);
      return proximos;
    });

  const confirmar = async () => {
    setEnviando(true);
    limpar();
    try {
      await onConfirmar(Array.from(selecionados));
    } catch (falha) {
      erro(falha);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div>
      {extra}
      <Aviso mensagem={mensagem} onFechar={limpar} />
      {!dados ? (
        <Carregando />
      ) : (
        <>
          {dados.aptas.length === 0 ? (
            <Vazio>Nenhum aluno apto no momento. É preciso ter o histórico final gerado e a documentação aprovada.</Vazio>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {selecionados.size} de {dados.aptas.length} selecionado(s)
                </span>
                <span className="flex gap-3">
                  <button type="button" className="link" onClick={() => setSelecionados(new Set(dados.aptas.map((apta) => apta.matriculaId)))}>
                    Todos
                  </button>
                  <button type="button" className="link" onClick={() => setSelecionados(new Set())}>
                    Nenhum
                  </button>
                </span>
              </div>
              <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                {dados.aptas.map((apta) => (
                  <li key={apta.matriculaId}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selecionados.has(apta.matriculaId)}
                        onChange={() => alternar(apta.matriculaId)}
                        className="h-4 w-4 accent-indigo-600"
                      />
                      <span className="flex-1">
                        <span className="font-medium text-slate-900">{apta.aluno.nome}</span>
                        <span className="ml-2 text-slate-500">{mascararCpf(apta.aluno.cpf)}</span>
                      </span>
                      <span className="text-xs text-slate-500">{apta.turma.nome}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          {dados.comPendencia.length ? (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-amber-700">
                {dados.comPendencia.length} aluno(s) concluíram os módulos, mas ainda têm documentação pendente
              </summary>
              <ul className="mt-2 space-y-1.5 text-slate-600">
                {dados.comPendencia.map((item) => (
                  <li key={item.matriculaId}>
                    <span className="font-medium text-slate-800">{item.aluno.nome}</span> ({item.turma.nome}): {item.pendencias.join('; ')}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button type="button" disabled={enviando || selecionados.size === 0} onClick={() => void confirmar()} className="btn btn-primario">
              {enviando ? 'Salvando...' : textoBotao}
            </button>
            <button type="button" onClick={onCancelar} className="btn btn-secundario">
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export { formatarData };
