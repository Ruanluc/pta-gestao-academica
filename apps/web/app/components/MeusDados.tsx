'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import { formatarData, paraInputData } from '../lib/formato';
import { portalApi } from '../lib/portal';
import { CAMPOS_EDITAVEIS, ROTULOS_CAMPOS, type CampoEditavel } from '../lib/tipos';
import { Aviso, Campo, Cartao, useMensagem } from './ui';

export type DadosAlunoPortal = Record<CampoEditavel, string | null>;

export type UltimaSolicitacao = {
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA';
  dados: Partial<Record<CampoEditavel, { atual: string; novo: string }>>;
  motivoRecusa: string | null;
  criadoEm: string;
  analisadoEm: string | null;
} | null;

const paraFormulario = (dados: DadosAlunoPortal) =>
  Object.fromEntries(
    CAMPOS_EDITAVEIS.map((campo) => [campo, campo === 'dataNascimento' ? paraInputData(dados[campo]) : dados[campo] ?? '']),
  ) as Record<CampoEditavel, string>;

const exibir = (campo: CampoEditavel, valor: string | null) =>
  !valor ? '—' : campo === 'dataNascimento' ? formatarData(valor) : valor;

/** "Meus dados" no portal: campo vazio o aluno preenche direto; mudar um dado preenchido vai para a secretaria. */
export function MeusDados({ dados, ultimaSolicitacao, onSalvo }: { dados: DadosAlunoPortal; ultimaSolicitacao: UltimaSolicitacao; onSalvo: () => void }) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(() => paraFormulario(dados));
  const [salvando, setSalvando] = useState(false);
  const { mensagem, definir, erro, limpar } = useMensagem();

  useEffect(() => {
    if (!editando) setForm(paraFormulario(dados));
  }, [dados, editando]);

  const salvar = async (evento: FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    limpar();
    try {
      const resposta = await portalApi<{ aplicados: CampoEditavel[]; emAnalise: CampoEditavel[] }>('/portal/dados', {
        method: 'PUT',
        json: form,
      });
      const partes: string[] = [];
      if (resposta.aplicados.length) partes.push(`Atualizado: ${resposta.aplicados.map((campo) => ROTULOS_CAMPOS[campo]).join(', ')}.`);
      if (resposta.emAnalise.length) {
        partes.push(`Enviado para a secretaria aprovar: ${resposta.emAnalise.map((campo) => ROTULOS_CAMPOS[campo]).join(', ')}.`);
      }
      definir({ tipo: 'sucesso', texto: partes.join(' ') || 'Nenhuma alteração.' });
      setEditando(false);
      onSalvo();
    } catch (falha) {
      erro(falha);
    } finally {
      setSalvando(false);
    }
  };

  const pendente = ultimaSolicitacao?.status === 'PENDENTE' ? ultimaSolicitacao : null;
  const recusada = ultimaSolicitacao?.status === 'RECUSADA' ? ultimaSolicitacao : null;

  return (
    <Cartao
      titulo="Meus dados"
      descricao="Campos em branco você mesmo preenche. Para alterar um dado já preenchido, a secretaria precisa aprovar. O CPF só pode ser alterado pela secretaria."
      acoes={
        !editando ? (
          <button type="button" onClick={() => setEditando(true)} className="btn btn-secundario btn-sm">
            <Pencil className="h-3.5 w-3.5" /> Corrigir dados
          </button>
        ) : null
      }
    >
      <Aviso mensagem={mensagem} onFechar={limpar} />

      {pendente ? (
        <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
          <p className="font-medium">Correção aguardando a secretaria:</p>
          <ul className="mt-1 list-inside list-disc">
            {(Object.entries(pendente.dados) as Array<[CampoEditavel, { atual: string; novo: string }]>).map(([campo, valores]) => (
              <li key={campo}>
                {ROTULOS_CAMPOS[campo]}: {valores.novo || '(vazio)'}
              </li>
            ))}
          </ul>
        </div>
      ) : recusada ? (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Sua última correção não foi aprovada. Motivo: {recusada.motivoRecusa ?? 'não informado'}.
        </p>
      ) : null}

      {editando ? (
        <form onSubmit={salvar}>
          <div className="grid gap-4 md:grid-cols-2">
            {CAMPOS_EDITAVEIS.map((campo) => (
              <Campo key={campo} rotulo={ROTULOS_CAMPOS[campo]}>
                <input
                  type={campo === 'dataNascimento' ? 'date' : campo === 'email' ? 'email' : 'text'}
                  value={form[campo]}
                  onChange={(evento) => setForm((atual) => ({ ...atual, [campo]: evento.target.value }))}
                  required={campo === 'nome' || campo === 'email'}
                  className="input"
                />
              </Campo>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <button type="submit" disabled={salvando} className="btn btn-primario">
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" onClick={() => setEditando(false)} className="btn btn-secundario">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {CAMPOS_EDITAVEIS.map((campo) => (
            <div key={campo}>
              <dt className="text-xs text-slate-500">{ROTULOS_CAMPOS[campo]}</dt>
              <dd className="mt-0.5 break-words text-sm font-medium text-slate-900">{exibir(campo, dados[campo])}</dd>
            </div>
          ))}
        </dl>
      )}
    </Cartao>
  );
}
