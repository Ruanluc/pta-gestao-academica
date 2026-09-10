'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { formatarData } from '../lib/formato';
import type { Turma } from '../lib/tipos';
import { useUsuario } from '../components/AppShell';
import { TurmaForm } from '../components/TurmaForm';
import { Aviso, Cabecalho, Carregando, Cartao, cls, useMensagem, Vazio } from '../components/ui';

export default function TurmasPage() {
  const router = useRouter();
  const { usuario } = useUsuario();
  const podeCadastrar = usuario.role !== 'PROFESSOR';

  const [turmas, setTurmas] = useState<Turma[] | null>(null);
  const [filtro, setFiltro] = useState<'ativas' | 'todas'>('ativas');
  const [mostrarForm, setMostrarForm] = useState(false);
  const { mensagem, erro } = useMensagem();

  const carregar = useCallback(async () => {
    try {
      setTurmas(await api<Turma[]>(filtro === 'ativas' ? '/turmas?ativa=true' : '/turmas'));
    } catch (falha) {
      erro(falha);
    }
  }, [filtro, erro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div>
      <Cabecalho
        titulo="Turmas"
        descricao="Cada turma tem seus módulos, com avaliação individual, e seus alunos matriculados."
        acoes={
          podeCadastrar && !mostrarForm ? (
            <button type="button" onClick={() => setMostrarForm(true)} className="btn btn-primario">
              <Plus className="h-4 w-4" /> Nova turma
            </button>
          ) : null
        }
      />

      {mostrarForm ? (
        <Cartao titulo="Nova turma" className="mb-6">
          <TurmaForm onSalvo={(turma) => router.push(`/turmas/${turma.id}`)} onCancelar={() => setMostrarForm(false)} />
        </Cartao>
      ) : null}

      <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 text-sm">
        {(['ativas', 'todas'] as const).map((opcao) => (
          <button
            key={opcao}
            type="button"
            onClick={() => setFiltro(opcao)}
            className={cls('rounded-md px-3 py-1.5 font-medium', filtro === opcao ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
          >
            {opcao === 'ativas' ? 'Ativas' : 'Todas'}
          </button>
        ))}
      </div>

      <Aviso mensagem={mensagem} />

      {!turmas ? (
        !mensagem && <Carregando />
      ) : turmas.length === 0 ? (
        <Vazio>Nenhuma turma {filtro === 'ativas' ? 'ativa ' : ''}cadastrada.</Vazio>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {turmas.map((turma) => (
            <Link key={turma.id} href={`/turmas/${turma.id}`} className="cartao transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                  <BookOpen className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{turma.nome}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatarData(turma.dataInicio)} a {formatarData(turma.dataFim)}
                  </p>
                </div>
                {!turma.ativa ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Inativa</span> : null}
              </div>
              <div className="mt-4 flex gap-4 text-sm text-slate-600">
                <span>{turma.cargaHoraria}h</span>
                <span>{turma._count?.disciplinas ?? 0} módulo(s)</span>
                <span>{turma._count?.matriculas ?? 0} aluno(s)</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
