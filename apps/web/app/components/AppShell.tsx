'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  BookOpen,
  ClipboardList,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  ShieldAlert,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { clearAuthToken, getAuthToken, limparDadosAntigos } from '../lib/auth';
import { mensagemErro } from '../lib/formato';
import { ROTULOS_ROLE, type Role, type Usuario } from '../lib/tipos';
import { Carregando, cls } from './ui';

type ContextoUsuario = { usuario: Usuario; recarregar: () => Promise<void> };

const UsuarioContext = createContext<ContextoUsuario | null>(null);

export const useUsuario = () => {
  const contexto = useContext(UsuarioContext);
  if (!contexto) throw new Error('useUsuario deve ser usado dentro do AppShell');
  return contexto;
};

// Páginas sem o menu da equipe: login, inscrição pública e portal do aluno
const rotaPublica = (pathname: string) =>
  ['/login', '/magic'].includes(pathname) ||
  pathname.startsWith('/inscricao/') ||
  pathname === '/portal' ||
  pathname.startsWith('/portal/');
const TODOS: Role[] = ['ADMIN', 'SECRETARIA', 'PROFESSOR'];

type ItemMenu = { href: string; rotulo: string; icone: LucideIcon; perfis: Role[] };

const MENU: ItemMenu[] = [
  { href: '/', rotulo: 'Início', icone: LayoutDashboard, perfis: TODOS },
  { href: '/turmas', rotulo: 'Turmas', icone: BookOpen, perfis: TODOS },
  { href: '/alunos', rotulo: 'Alunos', icone: GraduationCap, perfis: TODOS },
  { href: '/notas', rotulo: 'Notas', icone: ClipboardList, perfis: TODOS },
  { href: '/documentos', rotulo: 'Documentos', icone: FileText, perfis: ['ADMIN', 'SECRETARIA'] },
  { href: '/usuarios', rotulo: 'Usuários', icone: Users, perfis: ['ADMIN'] },
  { href: '/auditoria', rotulo: 'Auditoria', icone: ScrollText, perfis: ['ADMIN'] },
];

const itemAtivo = (href: string, pathname: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

function Marca() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">PTA</span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-slate-900">Gestão Acadêmica</span>
        <span className="block text-xs text-slate-500">Pós-graduação</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const publica = rotaPublica(pathname);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [erro, setErro] = useState('');
  const [menuAberto, setMenuAberto] = useState(false);

  const carregar = useCallback(async () => {
    if (!getAuthToken()) {
      router.replace('/login');
      return;
    }
    try {
      setUsuario(await api<Usuario>('/auth/me'));
      setErro('');
    } catch (falha) {
      // 401 já é tratado pelo apiFetch (volta para o login)
      if (falha instanceof ApiError && falha.status === 401) return;
      setErro(mensagemErro(falha));
    }
  }, [router]);

  useEffect(() => {
    limparDadosAntigos();
  }, []);

  useEffect(() => {
    if (!publica && !usuario) void carregar();
  }, [publica, usuario, carregar]);

  useEffect(() => {
    setMenuAberto(false);
  }, [pathname]);

  if (publica) return <>{children}</>;

  if (erro) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="cartao max-w-md text-center">
          <p className="font-semibold text-slate-900">Não foi possível carregar o sistema</p>
          <p className="mt-2 text-sm text-slate-600">{erro}</p>
          <button type="button" onClick={() => void carregar()} className="btn btn-primario mt-4">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!usuario) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Carregando texto="Carregando sessão..." />
      </div>
    );
  }

  const sair = () => {
    clearAuthToken();
    setUsuario(null);
    router.replace('/login');
  };

  const itens = MENU.filter((item) => item.perfis.includes(usuario.role));
  const itemAtual = MENU.find((item) => itemAtivo(item.href, pathname));
  const permitido = !itemAtual || itemAtual.perfis.includes(usuario.role);

  const navegacao = (
    <nav className="flex flex-1 flex-col gap-1">
      {itens.map((item) => {
        const Icone = item.icone;
        const ativo = itemAtivo(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cls(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              ativo ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            <Icone className="h-4 w-4" />
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );

  const rodape = (
    <div className="border-t border-slate-200 pt-4">
      <p className="truncate text-sm font-semibold text-slate-900">{usuario.nome}</p>
      <p className="truncate text-xs text-slate-500">
        {usuario.email} · {ROTULOS_ROLE[usuario.role]}
      </p>
      <div className="mt-3 flex gap-2">
        <Link href="/conta" className="btn btn-secundario btn-sm flex-1">
          <KeyRound className="h-3.5 w-3.5" /> Senha
        </Link>
        <button type="button" onClick={sair} className="btn btn-secundario btn-sm flex-1">
          <LogOut className="h-3.5 w-3.5" /> Sair
        </button>
      </div>
    </div>
  );

  return (
    <UsuarioContext.Provider value={{ usuario, recarregar: carregar }}>
      <div className="min-h-screen lg:flex">
        <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-slate-200 bg-white p-5 lg:sticky lg:top-0 lg:flex lg:h-screen">
          <Marca />
          {navegacao}
          {rodape}
        </aside>

        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <Marca />
          <button type="button" onClick={() => setMenuAberto((aberto) => !aberto)} className="btn btn-fantasma btn-sm" aria-label="Abrir menu">
            {menuAberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
        {menuAberto ? <div className="flex flex-col gap-4 border-b border-slate-200 bg-white p-4 lg:hidden">{navegacao}{rodape}</div> : null}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-6xl">
            {permitido ? (
              children
            ) : (
              <div className="cartao flex items-center gap-3 text-slate-700">
                <ShieldAlert className="h-5 w-5 text-rose-600" /> Seu perfil não tem acesso a esta página.
              </div>
            )}
          </div>
        </main>
      </div>
    </UsuarioContext.Provider>
  );
}
