'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import { formatarDataHora } from '../lib/formato';
import type { LoteResumo } from '../lib/tipos';
import { useUsuario } from '../components/AppShell';
import { PrazoLote, SeletorAptos, StatusLoteBadge } from '../components/Lotes';
import { Aviso, Cabecalho, Carregando, Cartao, useMensagem, Vazio } from '../components/ui';

export default function LotesPage() {
  const router = useRouter();
  const { usuario } = useUsuario();
  const equipe = usuario.role !== 'CERTIFICADORA';

  const [lotes, setLotes] = useState<LoteResumo[] | null>(null);
  const [criando, setCriando] = useState(false);
  const [referencia, setReferencia] = useState(() => new Date().toISOString().slice(0, 7));
  const { mensagem, erro } = useMensagem();

  useEffect(() => {
    api<LoteResumo[]>('/lotes').then(setLotes).catch(erro);
  }, [erro]);

  const criar = async (matriculaIds: string[]) => {
    const lote = await api<{ id: string }>('/lotes', { method: 'POST', json: { referencia, matriculaIds } });
    router.push(`/lotes/${lote.id}`);
  };

  return (
    <div>
      <Cabecalho
        titulo="Certificação"
        descricao={
          equipe
            ? 'Lotes enviados à certificadora no fim de cada mês. O prazo de entrega começa a contar no envio do lote.'
            : 'Lotes enviados pela instituição. Abra um lote para acessar os arquivos e registrar os certificados emitidos.'
        }
        acoes={
          equipe && !criando ? (
            <button type="button" onClick={() => setCriando(true)} className="btn btn-primario">
              <Plus className="h-4 w-4" /> Novo lote
            </button>
          ) : null
        }
      />

      {criando ? (
        <Cartao titulo="Novo lote" descricao="Alunos aptos: histórico final gerado e documentação aprovada." className="mb-6">
          <SeletorAptos
            textoBotao="Criar lote"
            onConfirmar={criar}
            onCancelar={() => setCriando(false)}
            extra={
              <label className="rotulo mb-4 block w-52">
                Mês de referência
                <input type="month" value={referencia} onChange={(evento) => setReferencia(evento.target.value)} required className="input" />
              </label>
            }
          />
        </Cartao>
      ) : null}

      <Aviso mensagem={mensagem} />

      {!lotes ? (
        !mensagem && <Carregando />
      ) : lotes.length === 0 ? (
        <Vazio>{equipe ? 'Nenhum lote criado ainda.' : 'Nenhum lote foi enviado a você ainda.'}</Vazio>
      ) : (
        <Cartao>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Lote</th>
                  <th>Situação</th>
                  <th className="text-center">Alunos</th>
                  <th className="text-center">Certificados</th>
                  <th>Enviado em</th>
                  <th>Prazo</th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((lote) => (
                  <tr key={lote.id} className="hover:bg-slate-50">
                    <td>
                      <Link href={`/lotes/${lote.id}`} className="link">
                        {lote.referencia}
                      </Link>
                      {lote.importado ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">planilha antiga</span> : null}
                    </td>
                    <td>
                      <StatusLoteBadge status={lote.status} />
                    </td>
                    <td className="text-center">{lote.totalAlunos}</td>
                    <td className="text-center">
                      {lote.certificadosEmitidos}/{lote.totalAlunos}
                    </td>
                    <td className="text-slate-600">{lote.enviadoEm ? formatarDataHora(lote.enviadoEm) : '—'}</td>
                    <td>
                      <PrazoLote status={lote.status} prazoEm={lote.prazoEm} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      )}
    </div>
  );
}
