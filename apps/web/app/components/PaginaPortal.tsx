import type { ReactNode } from 'react';

/** Moldura das páginas públicas e do portal do aluno (sem o menu da equipe). */
export function PaginaPortal({ children, acoes, largura = 'max-w-3xl' }: { children: ReactNode; acoes?: ReactNode; largura?: string }) {
  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className={`mx-auto ${largura}`}>
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">PTA</span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-slate-900">Portal do aluno</span>
              <span className="block text-xs text-slate-500">Pós-graduação</span>
            </span>
          </div>
          {acoes}
        </header>
        {children}
      </div>
    </main>
  );
}
