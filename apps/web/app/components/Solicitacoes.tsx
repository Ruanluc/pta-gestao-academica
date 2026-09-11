'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatarDataHora, mascararCpf } from '../lib/formato';
import { ROTULOS_CAMPOS, type CampoEditavel, type SolicitacaoAlteracao } from '../lib/tipos';
import { Aviso, Cartao, useMensagem } from './ui';

const exibirValor = (campo: CampoEditavel, valor: string) => {
  if (!valor) return '(vazio)';
  if (campo === 'dataNascimento' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor.split('-').reverse().join('/');
  return valor;
};

/** Correções de dados pedidas pelos alunos no portal, para a secretaria aprovar ou recusar. */
export function ListaSolicitacoes({
  alunoId,
  mostrarAluno = true,
  ocultarSeVazio = false,
  onAlterado,
}: {
  alunoId?: string;
  mostrarAluno?: boolean;
  ocultarSeVazio?: boolean;
  onAlterado?: () => void;
}) {
  const [lista, setLista] = useState<SolicitacaoAlteracao[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const { mensagem, erro, sucesso, limpar } = useMensagem();

  const carregar = useCallback(async () => {
    try {
      setLista(await api<SolicitacaoAlteracao[]>(`/solicitacoes?status=PENDENTE${alunoId ? `&alunoId=${alunoId}` : ''}`));
    } catch (falha) {
      erro(falha);
    }
  }, [alunoId, erro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const analisar = async (solicitacao: SolicitacaoAlteracao, aprovar: boolean) => {
    let motivo: string | null = null;
    if (!aprovar) {
      motivo = window.prompt('Motivo da recusa (o aluno receberá por e-mail):');
      if (!motivo?.trim()) return;
    }
    setOcupado(solicitacao.id);
    limpar();
    try {
      await api(`/solicitacoes/${solicitacao.id}/${aprovar ? 'aprovar' : 'recusar'}`, {
        method: 'POST',
        json: aprovar ? {} : { motivo: motivo?.trim() },
      });
      sucesso(aprovar ? 'Correção aprovada e dados atualizados.' : 'Correção recusada.');
      await carregar();
      onAlterado?.();
    } catch (falha) {
      erro(falha);
    } finally {
      setOcupado(null);
    }
  };

  if (!lista) return null;
  if (ocultarSeVazio && lista.length === 0 && !mensagem) return null;

  return (
    <Cartao
      titulo="Correções de dados pedidas pelo aluno"
      descricao="O aluno pediu para alterar dados que já estavam preenchidos. Confira com os documentos antes de aprovar."
    >
      <Aviso mensagem={mensagem} onFechar={limpar} />
      {lista.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma correção aguardando análise.</p>
      ) : (
        <div className="space-y-4">
          {lista.map((solicitacao) => (
            <div key={solicitacao.id} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  {mostrarAluno ? (
                    <Link href={`/alunos/${solicitacao.aluno.id}`} className="link">
                      {solicitacao.aluno.nome}
                    </Link>
                  ) : null}
                  {mostrarAluno ? <span className="ml-2 text-slate-500">{mascararCpf(solicitacao.aluno.cpf)}</span> : null}
                  <span className="ml-2 text-xs text-slate-500">pedido em {formatarDataHora(solicitacao.criadoEm)}</span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={ocupado === solicitacao.id}
                    onClick={() => void analisar(solicitacao, true)}
                    className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <Check className="h-3.5 w-3.5" /> Aprovar
                  </button>
                  <button
                    type="button"
                    disabled={ocupado === solicitacao.id}
                    onClick={() => void analisar(solicitacao, false)}
                    className="btn btn-secundario btn-sm text-rose-700"
                  >
                    <X className="h-3.5 w-3.5" /> Recusar
                  </button>
                </div>
              </div>
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Como está</th>
                    <th>Pedido do aluno</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.entries(solicitacao.dados) as Array<[CampoEditavel, { atual: string; novo: string }]>).map(([campo, valores]) => (
                    <tr key={campo}>
                      <td className="font-medium text-slate-800">{ROTULOS_CAMPOS[campo] ?? campo}</td>
                      <td className="text-slate-500 line-through">{exibirValor(campo, valores.atual)}</td>
                      <td className="font-medium text-indigo-700">{exibirValor(campo, valores.novo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </Cartao>
  );
}
