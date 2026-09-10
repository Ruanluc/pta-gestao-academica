'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { mascararCpf } from '../../lib/formato';
import { portalApi } from '../../lib/portal';
import { PaginaPortal } from '../../components/PaginaPortal';
import { Aviso, Campo, useMensagem } from '../../components/ui';

export default function EntrarPortalPage() {
  const [form, setForm] = useState({ cpf: '', email: '' });
  const [enviando, setEnviando] = useState(false);
  const { mensagem, definir, erro, sucesso, limpar } = useMensagem();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('expirou')) {
      definir({ tipo: 'erro', texto: 'Sua sessão no portal expirou. Peça um novo link de acesso.' });
    }
  }, [definir]);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    limpar();
    try {
      const resposta = await portalApi<{ message: string }>('/portal/solicitar-link', { method: 'POST', json: form, publico: true });
      sucesso(resposta.message);
    } catch (falha) {
      erro(falha);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <PaginaPortal largura="max-w-md">
      <form onSubmit={enviar} className="cartao">
        <h1 className="text-xl font-semibold text-slate-900">Receber link de acesso</h1>
        <p className="mt-1 text-sm text-slate-600">
          Informe o CPF e o e-mail usados na inscrição. Enviaremos um link pessoal para você acessar o portal.
        </p>
        <div className="mt-5 space-y-4">
          <Aviso mensagem={mensagem} />
          <Campo rotulo="CPF">
            <input
              value={form.cpf}
              onChange={(evento) => setForm({ ...form, cpf: mascararCpf(evento.target.value) })}
              inputMode="numeric"
              placeholder="000.000.000-00"
              required
              className="input"
            />
          </Campo>
          <Campo rotulo="E-mail">
            <input type="email" value={form.email} onChange={(evento) => setForm({ ...form, email: evento.target.value })} required className="input" />
          </Campo>
        </div>
        <button type="submit" disabled={enviando} className="btn btn-primario mt-6 w-full">
          {enviando ? 'Enviando...' : 'Enviar link'}
        </button>
        <p className="mt-4 text-xs text-slate-500">Não recebeu? Confira a caixa de spam ou peça o link à secretaria do curso.</p>
      </form>
    </PaginaPortal>
  );
}
