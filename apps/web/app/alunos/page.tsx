'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api } from '../lib/api';
import { mascararCpf } from '../lib/formato';
import { ROTULOS_SEMAFORO, type Aluno, type AlunoLista, type StatusSemaforo } from '../lib/tipos';
import { useUsuario } from '../components/AppShell';
import { AlunoForm } from '../components/AlunoForm';
import { Aviso, Cabecalho, Carregando, Cartao, SemaforoBadge, useMensagem, Vazio } from '../components/ui';

export default function AlunosPage() {
  const router = useRouter();
  const { usuario } = useUsuario();
  const podeCadastrar = usuario.role !== 'PROFESSOR';

  const [alunos, setAlunos] = useState<AlunoLista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<StatusSemaforo | ''>('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [pronto, setPronto] = useState(false);
  const { mensagem, erro, limpar } = useMensagem();

  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);
    setStatus((parametros.get('status') as StatusSemaforo | null) ?? '');
    setPronto(true);
  }, []);

  const carregar = useCallback(async () => {
    const parametros = new URLSearchParams();
    if (busca.trim()) parametros.set('busca', busca.trim());
    if (status) parametros.set('status', status);

    setCarregando(true);
    try {
      setAlunos(await api<AlunoLista[]>(`/alunos?${parametros}`));
      limpar();
    } catch (falha) {
      erro(falha);
    } finally {
      setCarregando(false);
    }
  }, [busca, status, erro, limpar]);

  useEffect(() => {
    if (!pronto) return;
    const espera = setTimeout(() => void carregar(), 300);
    return () => clearTimeout(espera);
  }, [carregar, pronto]);

  const aoCadastrar = (aluno: Aluno) => {
    router.push(`/alunos/${aluno.id}`);
  };

  return (
    <div>
      <Cabecalho
        titulo="Alunos"
        descricao="Cadastro, documentação e situação acadêmica de cada aluno."
        acoes={
          podeCadastrar && !mostrarForm ? (
            <button type="button" onClick={() => setMostrarForm(true)} className="btn btn-primario">
              <Plus className="h-4 w-4" /> Novo aluno
            </button>
          ) : null
        }
      />

      {mostrarForm ? (
        <Cartao titulo="Novo aluno" className="mb-6">
          <AlunoForm onSalvo={aoCadastrar} onCancelar={() => setMostrarForm(false)} />
        </Cartao>
      ) : null}

      <Cartao>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Buscar por nome, CPF ou e-mail"
              className="input mt-0 pl-9"
            />
          </div>
          <select value={status} onChange={(evento) => setStatus(evento.target.value as StatusSemaforo | '')} className="input mt-0 w-auto">
            <option value="">Todas as situações</option>
            {(Object.keys(ROTULOS_SEMAFORO) as StatusSemaforo[]).map((valor) => (
              <option key={valor} value={valor}>
                {ROTULOS_SEMAFORO[valor]}
              </option>
            ))}
          </select>
        </div>

        <Aviso mensagem={mensagem} />

        {carregando && alunos.length === 0 ? (
          <Carregando />
        ) : alunos.length === 0 ? (
          <Vazio>{busca || status ? 'Nenhum aluno encontrado com esses filtros.' : 'Nenhum aluno cadastrado ainda.'}</Vazio>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF</th>
                  <th className="hidden md:table-cell">Turmas</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {alunos.map((aluno) => (
                  <tr key={aluno.id} className="hover:bg-slate-50">
                    <td>
                      <Link href={`/alunos/${aluno.id}`} className="link">
                        {aluno.nome}
                      </Link>
                      <p className="text-xs text-slate-500">{aluno.email}</p>
                    </td>
                    <td className="whitespace-nowrap text-slate-600">{mascararCpf(aluno.cpf)}</td>
                    <td className="hidden text-slate-600 md:table-cell">
                      {aluno.matriculas.length ? aluno.matriculas.map((matricula) => matricula.turma.nome).join(', ') : '—'}
                    </td>
                    <td>
                      <SemaforoBadge status={aluno.statusSemaforo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </div>
  );
}
