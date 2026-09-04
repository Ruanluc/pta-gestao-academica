import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PTA Gestão Acadêmica',
  description: 'MVP de gestão acadêmica de pós-graduação',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
