'use client';

import Link from 'next/link';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Copy, Loader2, X } from 'lucide-react';
import { mensagemErro } from '../lib/formato';
import {
  ROTULOS_SEMAFORO,
  ROTULOS_SITUACAO,
  ROTULOS_STATUS_DOCUMENTO,
  type SituacaoDisciplina,
  type StatusDocumento,
  type StatusSemaforo,
} from '../lib/tipos';

export const cls = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export function Cabecalho({
  titulo,
  descricao,
  acoes,
  voltar,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  voltar?: { href: string; rotulo: string };
}) {
  return (
    <div className="mb-6">
      {voltar ? (
        <Link href={voltar.href} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> {voltar.rotulo}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-900">{titulo}</h1>
          {descricao ? <div className="mt-1 text-sm text-slate-600">{descricao}</div> : null}
        </div>
        {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
      </div>
    </div>
  );
}

export function Cartao({
  titulo,
  descricao,
  acoes,
  children,
  className,
}: {
  titulo?: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cls('cartao', className)}>
      {titulo || acoes ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {titulo ? <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2> : null}
            {descricao ? <p className="mt-1 text-sm text-slate-600">{descricao}</p> : null}
          </div>
          {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Campo({
  rotulo,
  children,
  dica,
  className,
}: {
  rotulo: ReactNode;
  children: ReactNode;
  dica?: ReactNode;
  className?: string;
}) {
  return (
    <label className={cls('rotulo', className)}>
      {rotulo}
      {children}
      {dica ? <span className="mt-1 block text-xs font-normal text-slate-500">{dica}</span> : null}
    </label>
  );
}

export type Mensagem = { tipo: 'erro' | 'sucesso'; texto: string } | null;

export function useMensagem() {
  const [mensagem, definir] = useState<Mensagem>(null);
  const erro = useCallback((valor: unknown) => definir({ tipo: 'erro', texto: mensagemErro(valor) }), []);
  const sucesso = useCallback((texto: string) => definir({ tipo: 'sucesso', texto }), []);
  const limpar = useCallback(() => definir(null), []);
  return { mensagem, definir, erro, sucesso, limpar };
}

export function Aviso({ mensagem, onFechar }: { mensagem: Mensagem; onFechar?: () => void }) {
  if (!mensagem) return null;
  const erro = mensagem.tipo === 'erro';
  const Icone = erro ? AlertCircle : CheckCircle2;

  return (
    <div
      role={erro ? 'alert' : 'status'}
      className={cls(
        'mb-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm',
        erro ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800',
      )}
    >
      <Icone className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{mensagem.texto}</span>
      {onFechar ? (
        <button type="button" onClick={onFechar} aria-label="Fechar aviso" className="opacity-60 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function Carregando({ texto = 'Carregando...' }: { texto?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> {texto}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

const CORES_SEMAFORO: Record<StatusSemaforo, string> = {
  VERDE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  AMARELO: 'border-amber-200 bg-amber-50 text-amber-700',
  VERMELHO: 'border-rose-200 bg-rose-50 text-rose-700',
};

const PONTO_SEMAFORO: Record<StatusSemaforo, string> = {
  VERDE: 'bg-emerald-500',
  AMARELO: 'bg-amber-500',
  VERMELHO: 'bg-rose-500',
};

export function SemaforoBadge({ status }: { status: StatusSemaforo }) {
  return (
    <span className={cls('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', CORES_SEMAFORO[status])}>
      <span className={cls('h-2 w-2 rounded-full', PONTO_SEMAFORO[status])} />
      {ROTULOS_SEMAFORO[status]}
    </span>
  );
}

const CORES_DOCUMENTO: Record<StatusDocumento, string> = {
  PENDENTE: 'border-amber-200 bg-amber-50 text-amber-700',
  APROVADO: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  REJEITADO: 'border-rose-200 bg-rose-50 text-rose-700',
};

export function StatusDocumentoBadge({ status }: { status: StatusDocumento }) {
  return (
    <span className={cls('inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', CORES_DOCUMENTO[status])}>
      {ROTULOS_STATUS_DOCUMENTO[status]}
    </span>
  );
}

const CORES_SITUACAO: Record<SituacaoDisciplina, string> = {
  APROVADO: 'text-emerald-700',
  REPROVADO: 'text-rose-700',
  PENDENTE: 'text-slate-500',
};

export function SituacaoTexto({ situacao }: { situacao: SituacaoDisciplina }) {
  return <span className={cls('text-xs font-semibold', CORES_SITUACAO[situacao])}>{ROTULOS_SITUACAO[situacao]}</span>;
}

/** Campo somente leitura com botão de copiar (links para enviar a alunos). */
export function CampoCopiavel({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
    } catch {
      // Sem acesso à área de transferência (ex.: página sem HTTPS): seleciona para copiar à mão
      campo.current?.select();
      document.execCommand('copy');
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="flex gap-2">
      <input ref={campo} readOnly value={valor} onFocus={(evento) => evento.target.select()} className="input mt-0 font-mono text-xs" />
      <button type="button" onClick={() => void copiar()} className="btn btn-secundario">
        {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}
