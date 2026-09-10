import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from './components/AppShell';

export const metadata: Metadata = {
  title: 'PTA Gestão Acadêmica',
  description: 'Gestão acadêmica de pós-graduação',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
