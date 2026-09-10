'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { setAuthToken } from '../lib/auth';
import { mensagemErro } from '../lib/formato';
import { Carregando } from '../components/ui';

export default function MagicLinkPage() {
  const router = useRouter();
  const iniciado = useRef(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    // O link só pode ser usado uma vez: evita a segunda chamada do modo estrito do React
    if (iniciado.current) return;
    iniciado.current = true;

    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setErro('Link de acesso inválido.');
      return;
    }

    api<{ token: string }>('/auth/magic-validate', { method: 'POST', json: { token } })
      .then((resposta) => {
        setAuthToken(resposta.token);
        router.replace('/');
      })
      .catch((falha) => setErro(mensagemErro(falha)));
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="cartao w-full max-w-md text-center">
        {erro ? (
          <>
            <p className="font-semibold text-slate-900">Não foi possível entrar</p>
            <p className="mt-2 text-sm text-slate-600">{erro}</p>
            <Link href="/login" className="btn btn-primario mt-5">
              Voltar para o login
            </Link>
          </>
        ) : (
          <div className="flex justify-center">
            <Carregando texto="Validando seu link de acesso..." />
          </div>
        )}
      </div>
    </main>
  );
}
