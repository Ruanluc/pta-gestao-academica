'use client';

import { useState } from 'react';
import { apiFetch } from '../lib/auth';

export default function UsuariosPage() {
  const [form, setForm] = useState({ nome: '', email: '', senha: '', role: 'SECRETARIA' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
      });

      if (!response.ok) throw new Error('Não foi possível cadastrar o usuário');
      setMessage('Usuário cadastrado com sucesso.');
      setForm({ nome: '', email: '', senha: '', role: 'SECRETARIA' });
    } catch (error: any) {
      setMessage(error.message || 'Erro ao cadastrar usuário');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Cadastro de usuários</h1>
        <p className="mt-2 text-slate-600">Crie novos usuários com perfil administrativo ou de secretaria.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <label className="block text-sm font-medium text-slate-700">
            Nome
            <input value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" required />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            E-mail
            <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" required />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Senha
            <input type="password" value={form.senha} onChange={(event) => setForm({ ...form, senha: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" required />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Perfil
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">
              <option value="ADMIN">ADMIN</option>
              <option value="SECRETARIA">SECRETARIA</option>
              <option value="PROFESSOR">PROFESSOR</option>
            </select>
          </label>

          <button type="submit" disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-70">
            {loading ? 'Cadastrando...' : 'Cadastrar usuário'}
          </button>
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </form>
      </div>
    </main>
  );
}
