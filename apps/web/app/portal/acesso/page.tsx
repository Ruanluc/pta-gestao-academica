'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { mensagemErro } from '../../lib/formato';
import { portalApi, setSessaoAluno } from '../../lib/portal';
import { PaginaPortal } from '../../components/PaginaPortal';
import { Carregando } from '../../components/ui';

export default function AcessoPortalPage() {
  const router = useRouter();
  const iniciado = useRef(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;

    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setErro('Link de acesso inválido.');
      return;
    }

    portalApi<{ sessao: string }>('/portal/acesso', { method: 'POST', json: { token }, publico: true })
      .then((resposta) => {
        setSessaoAluno(resposta.sessao);
        router.replace('/portal');
      })
      .catch((falha) => setErro(mensagemErro(falha)));
  }, [router]);

  return (
    <PaginaPortal largura="max-w-md">
      <div className="cartao text-center">
        {erro ? (
          <>
            <p className="font-semibold text-slate-900">Não foi possível entrar</p>
            <p className="mt-2 text-sm text-slate-600">{erro}</p>
            <Link href="/portal/entrar" className="btn btn-primario mt-5">
              Pedir um novo link
            </Link>
          </>
        ) : (
          <div className="flex justify-center">
            <Carregando texto="Validando seu link de acesso..." />
          </div>
        )}
      </div>
    </PaginaPortal>
  );
}
