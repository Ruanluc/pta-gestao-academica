'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getAuthToken } from '../lib/auth';

const STORAGE_KEY = 'pta-alunos';

const getStatusConfig = (status?: string) => {
  switch (status) {
    case 'VERMELHO_FALTA_DOCUMENTACAO':
      return {
        label: 'Falta documentação',
        icon: '●',
        className: 'border-red-200 bg-red-50 text-red-700',
      };
    case 'AMARELO_FALTA_AVALIACAO':
      return {
        label: 'Falta avaliação',
        icon: '●',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
      };
    case 'VERDE_TUDO_CERTO':
    default:
      return {
        label: 'Tudo certo',
        icon: '●',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      };
  }
};

export default function AlunosPage() {
  const router = useRouter();
  const [alunos, setAlunos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    nome: '',
    cpf: '',
    email: '',
    telefone: '',
    dataNascimento: '',
    nacionalidade: '',
    naturalidade: '',
    filiacao: '',
    rgNumero: '',
    rgOrgaoEmissor: '',
    condicaoGraduacao: 'CURSANDO',
  });

  const saveAlunos = (nextAlunos: any[]) => {
    setAlunos(nextAlunos);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAlunos));
  };

  const loadAlunos = async () => {
    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    try {
      const res = await apiFetch('/alunos');
      if (res.ok) {
        const data = await res.json();
        const nextAlunos = Array.isArray(data) ? data : [];
        saveAlunos(nextAlunos);
        return;
      }
    } catch {
      // fallback to local persistence
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        saveAlunos(JSON.parse(saved));
      } catch {
        saveAlunos([]);
      }
    } else {
      saveAlunos([]);
    }
  };

  useEffect(() => {
    loadAlunos();
  }, []);

  const handleChange = (event: any) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: any) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const payload = {
        ...form,
        dataNascimento: form.dataNascimento ? new Date(form.dataNascimento).toISOString() : null,
      };

      const res = await apiFetch('/alunos', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok && res.status !== 201) {
        const errorText = await res.text();
        throw new Error(`Erro ${res.status}: ${errorText || 'Não foi possível cadastrar'}`);
      }

      const created = await res.json();
      const novoAluno = created || {
        id: `aluno-${Date.now()}`,
        ...payload,
      };

      const nextAlunos = [novoAluno, ...alunos];
      saveAlunos(nextAlunos);

      setMessage('✓ Aluno cadastrado com sucesso.');
      setForm({
        nome: '',
        cpf: '',
        email: '',
        telefone: '',
        dataNascimento: '',
        nacionalidade: '',
        naturalidade: '',
        filiacao: '',
        rgNumero: '',
        rgOrgaoEmissor: '',
        condicaoGraduacao: 'CURSANDO',
      });
    } catch (error: any) {
      console.error('Erro ao cadastrar aluno:', error);
      setMessage(`✗ ${error.message || 'Erro ao cadastrar aluno.'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Alunos</h1>
        <p className="mt-2 text-slate-600">Cadastro manual de alunos como alternativa ao fluxo de documentação completa.</p>

        <form onSubmit={handleSubmit} className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Nome completo
              <input name="nome" value={form.nome} onChange={handleChange} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              CPF
              <input name="cpf" value={form.cpf} onChange={handleChange} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              E-mail
              <input type="email" name="email" value={form.email} onChange={handleChange} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Telefone
              <input name="telefone" value={form.telefone} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Data de nascimento
              <input type="date" name="dataNascimento" value={form.dataNascimento} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Condição de graduação
              <select name="condicaoGraduacao" value={form.condicaoGraduacao} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                <option value="CURSANDO">Cursando</option>
                <option value="CONCLUIDO_COM_DIPLOMA">Concluído com diploma</option>
                <option value="CONCLUIDO_SEM_DIPLOMA">Concluído sem diploma</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Nacionalidade
              <input name="nacionalidade" value={form.nacionalidade} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Naturalidade
              <input name="naturalidade" value={form.naturalidade} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Nome da mãe
              <input name="filiacao" value={form.filiacao} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              RG
              <input name="rgNumero" value={form.rgNumero} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Órgão emissor
              <input name="rgOrgaoEmissor" value={form.rgOrgaoEmissor} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button type="submit" disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-70">
              {loading ? 'Cadastrando...' : 'Cadastrar aluno'}
            </button>
            {message ? <span className="text-sm text-slate-600">{message}</span> : null}
          </div>
        </form>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {alunos.length === 0 ? <p className="text-slate-500">Nenhum aluno cadastrado ainda.</p> : alunos.map((aluno) => {
            const status = getStatusConfig(aluno.documentStatus);
            return (
              <div key={aluno.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{aluno.name ?? aluno.nome}</h2>
                    <p className="mt-1 text-sm text-slate-600">CPF: {aluno.cpf}</p>
                    <p className="text-sm text-slate-600">E-mail: {aluno.email}</p>
                  </div>
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${status.className}`}>
                    <span className="text-base leading-none">{status.icon}</span>
                    {status.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
