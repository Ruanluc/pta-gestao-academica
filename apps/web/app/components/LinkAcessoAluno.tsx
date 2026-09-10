'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '../lib/api';
import { formatarDataHora } from '../lib/formato';
import { Aviso, CampoCopiavel, Cartao, useMensagem } from './ui';

type LinkGerado = { link: string; expiraEm: string; emailEnviado: boolean };

export function LinkAcessoAluno({
  alunoId,
  email,
  acessoExpiraEm,
  onGerado,
}: {
  alunoId: string;
  email: string;
  acessoExpiraEm: string | null;
  onGerado: () => void;
}) {
  const [gerado, setGerado] = useState<LinkGerado | null>(null);
  const [gerando, setGerando] = useState(false);
  const { mensagem, erro, limpar } = useMensagem();
  const linkValido = Boolean(acessoExpiraEm && new Date(acessoExpiraEm) > new Date());

  const gerar = async () => {
    if (linkValido && !gerado && !window.confirm('O aluno já tem um link válido. Gerar um novo invalida o anterior. Continuar?')) return;
    setGerando(true);
    limpar();
    try {
      setGerado(await api<LinkGerado>(`/alunos/${alunoId}/link-acesso`, { method: 'POST' }));
      onGerado();
    } catch (falha) {
      erro(falha);
    } finally {
      setGerando(false);
    }
  };

  return (
    <Cartao
      titulo="Portal do aluno"
      descricao="O aluno acessa o portal por um link pessoal, sem senha, para enviar os documentos e acompanhar a situação."
      acoes={
        <button type="button" disabled={gerando} onClick={() => void gerar()} className="btn btn-secundario">
          <KeyRound className="h-4 w-4" /> {gerando ? 'Gerando...' : 'Gerar link de acesso'}
        </button>
      }
    >
      <Aviso mensagem={mensagem} onFechar={limpar} />
      {gerado ? (
        <div className="space-y-2">
          <CampoCopiavel valor={gerado.link} />
          <p className="text-sm text-slate-600">
            {gerado.emailEnviado
              ? `Link enviado para ${email}. `
              : 'O envio de e-mail não está configurado: copie o link e envie ao aluno (por exemplo, pelo WhatsApp). '}
            Válido até {formatarDataHora(gerado.expiraEm)}.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          {linkValido
            ? `Há um link de acesso válido até ${formatarDataHora(acessoExpiraEm)}. Por segurança, ele não pode ser exibido de novo; gere outro se o aluno precisar.`
            : 'Nenhum link de acesso válido no momento.'}
        </p>
      )}
    </Cartao>
  );
}
