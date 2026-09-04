'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, GraduationCap, Users, FileText } from 'lucide-react';
import { clearAuthToken, getAuthToken } from './lib/auth';

const cards = [
  { href: '/turmas', title: 'Turmas', description: 'Gerencie programas e períodos letivos.', icon: BookOpen },
  { href: '/alunos', title: 'Alunos', description: 'Cadastre alunos e acompanhe documentos.', icon: GraduationCap },
  { href: '/documentos', title: 'Documentos', description: 'Controle aprovação e rejeição.', icon: FileText },
  { href: '/notas', title: 'Notas', description: 'Acompanhe médias e frequência.', icon: Users },
];

export default function HomePage() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    setLoggedIn(true);
  }, [router]);

  if (!loggedIn) return null;

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 rounded-2xl bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">MVP PTA</p>
              <h1 className="mt-2 text-3xl font-semibold">Gestão Acadêmica de Pós-Graduação</h1>
            </div>
            <button
              onClick={() => {
                clearAuthToken();
                router.replace('/login');
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
            >
              Sair
            </button>
          </div>
          <h1 className="mt-2 text-3xl font-semibold">Gestão Acadêmica de Pós-Graduação</h1>
          <p className="mt-3 max-w-2xl text-slate-600">Estrutura completa para turmas, alunos, documentos, matrículas e notas com backend em Node.js e frontend em Next.js.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.title} href={card.href} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                <div className="mb-4 inline-flex rounded-xl bg-indigo-50 p-3 text-indigo-600">
                  <Icon className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold">{card.title}</h2>
                <p className="mt-2 text-sm text-slate-600">{card.description}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
