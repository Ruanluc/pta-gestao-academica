'use client';

import { useCallback, useEffect, useState } from 'react';
import { CloudDownload } from 'lucide-react';
import { api } from '../lib/api';
import { formatarDataHora } from '../lib/formato';
import type { SincronizacaoCademi, StatusCademi } from '../lib/tipos';
import { Aviso, Cartao, cls, useMensagem } from './ui';

const ROTULO_STATUS: Record<SincronizacaoCademi['status'], string> = {
  EM_ANDAMENTO: 'Em andamento',
  SUCESSO: 'Concluída',
  PARCIAL: 'Concluída com pendências',
  ERRO: 'Erro',
};

const COR_STATUS: Record<SincronizacaoCademi['status'], string> = {
  EM_ANDAMENTO: 'text-slate-600',
  SUCESSO: 'text-emerald-700',
  PARCIAL: 'text-amber-700',
  ERRO: 'text-rose-700',
};

const descricaoStatus = (status: StatusCademi | null) => {
  if (!status) return 'Carregando...';
  if (status.status === 'desativada') return 'Integração não configurada. Preencha CADEMI_API_URL e CADEMI_API_TOKEN no .env da API.';
  if (status.status === 'pendente') return 'Credenciais configuradas. Falta implementar a leitura das notas da API da Cademi.';
  return status.sincronizacaoAutomaticaMinutos > 0
    ? `Ativa. Importação automática a cada ${status.sincronizacaoAutomaticaMinutos} minuto(s), além do botão abaixo.`
    : 'Ativa. As notas são importadas pelo botão abaixo.';
};

function ListaPendencias({ titulo, itens }: { titulo: string; itens?: string[] }) {
  if (!itens?.length) return null;
  return (
    <div className="mt-2">
      <p className="font-medium text-slate-700">{titulo}</p>
      <ul className="list-inside list-disc text-slate-600">
        {itens.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function CademiTurma({
  turmaId,
  modulosVinculados,
  totalModulos,
  onImportado,
}: {
  turmaId: string;
  modulosVinculados: number;
  totalModulos: number;
  onImportado: () => void;
}) {
  const [status, setStatus] = useState<StatusCademi | null>(null);
  const [historico, setHistorico] = useState<SincronizacaoCademi[]>([]);
  const [importando, setImportando] = useState(false);
  const { mensagem, definir, erro, sucesso, limpar } = useMensagem();

  const carregar = useCallback(async () => {
    try {
      const [atual, lista] = await Promise.all([
        api<StatusCademi>('/cademi/status'),
        api<SincronizacaoCademi[]>(`/cademi/turmas/${turmaId}/sincronizacoes`),
      ]);
      setStatus(atual);
      setHistorico(lista);
    } catch (falha) {
      erro(falha);
    }
  }, [turmaId, erro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const importar = async () => {
    setImportando(true);
    limpar();
    try {
      const resultado = await api<SincronizacaoCademi>(`/cademi/turmas/${turmaId}/sincronizar`, { method: 'POST' });
      const texto = `${resultado.notasImportadas} nota(s) importada(s) da Cademi.`;
      if (resultado.status === 'PARCIAL') {
        definir({ tipo: 'erro', texto: `${texto} Alguns registros não foram aplicados; veja os detalhes no histórico.` });
      } else {
        sucesso(texto);
      }
      onImportado();
    } catch (falha) {
      erro(falha);
    } finally {
      setImportando(false);
      await carregar();
    }
  };

  return (
    <Cartao
      titulo="Notas da Cademi"
      descricao={descricaoStatus(status)}
      acoes={
        <button type="button" disabled={importando || modulosVinculados === 0} onClick={() => void importar()} className="btn btn-primario">
          <CloudDownload className="h-4 w-4" /> {importando ? 'Importando...' : 'Importar notas da Cademi'}
        </button>
      }
    >
      <Aviso mensagem={mensagem} onFechar={limpar} />

      <p className={cls('text-sm', modulosVinculados === 0 ? 'text-amber-700' : 'text-slate-600')}>
        {modulosVinculados === 0
          ? 'Nenhum módulo vinculado. Edite os módulos acima e preencha o "ID na Cademi" para poder importar.'
          : `${modulosVinculados} de ${totalModulos} módulo(s) vinculado(s) à Cademi. Os alunos são reconhecidos pelo ID na Cademi, CPF ou e-mail.`}
      </p>

      {historico.length ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Últimas importações</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
            {historico.map((item) => {
              const detalhes = item.detalhes;
              const temDetalhes =
                detalhes?.erro ||
                detalhes?.alunosNaoEncontrados?.length ||
                detalhes?.modulosNaoEncontrados?.length ||
                detalhes?.ignorados?.length;
              return (
                <li key={item.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-700">
                      {formatarDataHora(item.iniciadoEm)} · {item.automatica ? 'automática' : item.usuario?.nome ?? 'manual'}
                    </span>
                    <span className={cls('font-medium', COR_STATUS[item.status])}>
                      {ROTULO_STATUS[item.status]}
                      {item.status !== 'ERRO' ? ` · ${item.notasImportadas} nota(s)` : ''}
                    </span>
                  </div>
                  {temDetalhes ? (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-indigo-600">detalhes</summary>
                      {detalhes?.erro ? <p className="mt-2 text-rose-700">{detalhes.erro}</p> : null}
                      <ListaPendencias titulo="Alunos da Cademi não encontrados nesta turma" itens={detalhes?.alunosNaoEncontrados} />
                      <ListaPendencias titulo="IDs de módulo da Cademi sem módulo correspondente" itens={detalhes?.modulosNaoEncontrados} />
                      <ListaPendencias
                        titulo="Registros ignorados"
                        itens={detalhes?.ignorados?.map((ignorado) => `${ignorado.registro}: ${ignorado.motivo}`)}
                      />
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </Cartao>
  );
}
