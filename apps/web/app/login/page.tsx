'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, setAuthToken } from '../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, senha }),
      });

      if (!response.ok) {
        throw new Error('Credenciais inválidas');
      }

      const data = await response.json();
      setAuthToken(data.token);
      router.push('/');
    } catch (error: any) {
      setError(error.message || 'Não foi possível entrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Acesso ao sistema</h1>
        <p className="mt-2 text-sm text-slate-600">Entre com suas credenciais para acessar a gestão escolar.</p>

        <label className="mt-6 block text-sm font-medium text-slate-700">
          E-mail
          <input value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Senha
          <input type="password" value={senha} onChange={(event) => setSenha(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required />
        </label>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

        <button type="submit" disabled={loading} className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-70">
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
