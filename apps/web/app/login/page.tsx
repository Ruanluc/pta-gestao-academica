'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { getAuthToken, setAuthToken } from '../lib/auth';
import { Aviso, Campo, cls, useMensagem } from '../components/ui';

type Modo = 'senha' | 'link' | 'primeiro';
type StatusAuth = { possuiUsuarios: boolean; magicLinkDisponivel: boolean };

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>('senha');
  const [status, setStatus] = useState<StatusAuth | null>(null);
  const [form, setForm] = useState({ nome: '', email: '', senha: '' });
  const [enviando, setEnviando] = useState(false);
  const { mensagem, definir, erro, sucesso, limpar } = useMensagem();

  useEffect(() => {
    if (getAuthToken()) {
      router.replace('/');
      return;
    }
    if (new URLSearchParams(window.location.search).get('expirou')) {
      definir({ tipo: 'erro', texto: 'Sua sessão expirou. Entre novamente.' });
    }
    api<StatusAuth>('/auth/status')
      .then((resposta) => {
        setStatus(resposta);
        if (!resposta.possuiUsuarios) setModo('primeiro');
      })
      .catch(erro);
  }, [router, definir, erro]);

  const entrar = (token: string) => {
    setAuthToken(token);
    router.replace('/');
  };

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    limpar();

    try {
      if (modo === 'senha') {
        const resposta = await api<{ token: string }>('/auth/login', { method: 'POST', json: { email: form.email, senha: form.senha } });
        entrar(resposta.token);
      } else if (modo === 'link') {
        const resposta = await api<{ message: string }>('/auth/magic-link', { method: 'POST', json: { email: form.email } });
        sucesso(resposta.message);
      } else {
        const resposta = await api<{ token: string }>('/auth/bootstrap-admin', { method: 'POST', json: form });
        entrar(resposta.token);
      }
    } catch (falha) {
      erro(falha);
    } finally {
      setEnviando(false);
    }
  };

  const alterar = (campo: keyof typeof form) => (evento: React.ChangeEvent<HTMLInputElement>) =>
    setForm((atual) => ({ ...atual, [campo]: evento.target.value }));

  const titulos: Record<Modo, { titulo: string; descricao: string; botao: string }> = {
    senha: { titulo: 'Acesso ao sistema', descricao: 'Entre com seu e-mail e senha.', botao: 'Entrar' },
    link: { titulo: 'Entrar sem senha', descricao: 'Enviaremos um link de acesso válido por 15 minutos.', botao: 'Enviar link' },
    primeiro: {
      titulo: 'Primeiro acesso',
      descricao: 'Nenhum usuário cadastrado ainda. Crie a conta do administrador do sistema.',
      botao: 'Criar administrador',
    },
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">PTA</span>
          <span className="text-lg font-semibold text-slate-900">Gestão Acadêmica</span>
        </div>

        <form onSubmit={enviar} className="cartao">
          <h1 className="text-xl font-semibold">{titulos[modo].titulo}</h1>
          <p className="mt-1 text-sm text-slate-600">{titulos[modo].descricao}</p>

          {modo !== 'primeiro' && status?.magicLinkDisponivel ? (
            <div className="mt-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm">
              {(['senha', 'link'] as Modo[]).map((opcao) => (
                <button
                  key={opcao}
                  type="button"
                  onClick={() => {
                    setModo(opcao);
                    limpar();
                  }}
                  className={cls('rounded-md py-1.5 font-medium', modo === opcao ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
                >
                  {opcao === 'senha' ? 'Senha' : 'Link por e-mail'}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            <Aviso mensagem={mensagem} />
            {modo === 'primeiro' ? (
              <Campo rotulo="Nome">
                <input value={form.nome} onChange={alterar('nome')} required minLength={2} className="input" />
              </Campo>
            ) : null}
            <Campo rotulo="E-mail">
              <input type="email" autoComplete="email" value={form.email} onChange={alterar('email')} required className="input" />
            </Campo>
            {modo !== 'link' ? (
              <Campo rotulo="Senha" dica={modo === 'primeiro' ? 'Mínimo de 8 caracteres.' : undefined}>
                <input
                  type="password"
                  autoComplete={modo === 'primeiro' ? 'new-password' : 'current-password'}
                  value={form.senha}
                  onChange={alterar('senha')}
                  required
                  minLength={modo === 'primeiro' ? 8 : 1}
                  className="input"
                />
              </Campo>
            ) : null}
          </div>

          <button type="submit" disabled={enviando} className="btn btn-primario mt-6 w-full">
            {enviando ? 'Aguarde...' : titulos[modo].botao}
          </button>
        </form>
      </div>
    </main>
  );
}
