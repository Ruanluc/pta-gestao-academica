'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatarDataHora } from '../lib/formato';
import type { RegistroAuditoria } from '../lib/tipos';
import { Aviso, Cabecalho, Carregando, Cartao, useMensagem, Vazio } from '../components/ui';

const ENTIDADES = ['Usuario', 'Aluno', 'Turma', 'Disciplina', 'Matricula', 'Documento', 'Nota'];

const formatarDetalhes = (detalhes: string | null) => {
  if (!detalhes) return null;
  try {
    return JSON.stringify(JSON.parse(detalhes), null, 2);
  } catch {
    return detalhes;
  }
};

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState<RegistroAuditoria[] | null>(null);
  const [entidade, setEntidade] = useState('');
  const { mensagem, erro } = useMensagem();

  const carregar = useCallback(async () => {
    try {
      setRegistros(await api<RegistroAuditoria[]>(`/auditoria?limite=200${entidade ? `&entidade=${entidade}` : ''}`));
    } catch (falha) {
      erro(falha);
    }
  }, [entidade, erro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div>
      <Cabecalho titulo="Auditoria" descricao="Últimas 200 ações registradas no sistema." />
      <Cartao>
        <select value={entidade} onChange={(evento) => setEntidade(evento.target.value)} className="input mb-4 mt-0 w-auto">
          <option value="">Todas as entidades</option>
          {ENTIDADES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <Aviso mensagem={mensagem} />

        {!registros ? (
          !mensagem && <Carregando />
        ) : registros.length === 0 ? (
          <Vazio>Nenhum registro.</Vazio>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((registro) => {
                  const detalhes = formatarDetalhes(registro.detalhes);
                  return (
                    <tr key={registro.id} className="align-top">
                      <td className="whitespace-nowrap text-slate-600">{formatarDataHora(registro.criadoEm)}</td>
                      <td className="text-slate-700">{registro.usuario?.nome ?? 'Sistema'}</td>
                      <td>
                        <span className="font-medium text-slate-900">{registro.acao}</span>
                        <p className="text-xs text-slate-500">{registro.entidade}</p>
                      </td>
                      <td className="max-w-md">
                        {detalhes ? (
                          <details>
                            <summary className="cursor-pointer text-xs text-indigo-600">ver</summary>
                            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-50 p-2 text-xs text-slate-700">{detalhes}</pre>
                          </details>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </div>
  );
}
