'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { formatarData, mensagemErro } from '../../lib/formato';
import { portalApi, setSessaoAluno } from '../../lib/portal';
import { AlunoForm, type FormAluno } from '../../components/AlunoForm';
import { PaginaPortal } from '../../components/PaginaPortal';
import { Carregando } from '../../components/ui';

type TurmaPublica = { nome: string; dataInicio: string; dataFim: string };

export default function InscricaoPage({ params }: { params: { codigo: string } }) {
  const router = useRouter();
  const [turma, setTurma] = useState<TurmaPublica | null>(null);
  const [erro, setErro] = useState('');
  const [concluido, setConcluido] = useState('');
  const caminho = `/publico/inscricao/${encodeURIComponent(params.codigo)}`;

  useEffect(() => {
    portalApi<{ turma: TurmaPublica }>(caminho, { publico: true })
      .then((resposta) => setTurma(resposta.turma))
      .catch((falha) => setErro(mensagemErro(falha)));
  }, [caminho]);

  const enviar = async (dados: FormAluno) => {
    const resposta = await portalApi<{ message: string; sessao?: string }>(caminho, { method: 'POST', json: dados, publico: true });
    if (resposta.sessao) {
      setSessaoAluno(resposta.sessao);
      router.replace('/portal?bemvindo=1');
      return;
    }
    setConcluido(resposta.message);
  };

  return (
    <PaginaPortal>
      {erro ? (
        <div className="cartao text-center">
          <p className="font-semibold text-slate-900">Não foi possível abrir a inscrição</p>
          <p className="mt-2 text-sm text-slate-600">{erro}</p>
          <p className="mt-2 text-sm text-slate-500">Confira o link com a secretaria do curso.</p>
        </div>
      ) : !turma ? (
        <Carregando />
      ) : concluido ? (
        <div className="cartao text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="mt-3 font-semibold text-slate-900">Inscrição registrada</p>
          <p className="mt-2 text-sm text-slate-600">{concluido}</p>
          <Link href="/portal/entrar" className="btn btn-secundario mt-5">
            Não recebi o link
          </Link>
        </div>
      ) : (
        <div className="cartao">
          <h1 className="text-2xl font-semibold text-slate-900">Inscrição</h1>
          <p className="mt-1 text-slate-600">
            {turma.nome} · {formatarData(turma.dataInicio)} a {formatarData(turma.dataFim)}
          </p>
          <p className="mb-6 mt-4 text-sm text-slate-600">
            Preencha seus dados. Ao concluir, você já poderá enviar os documentos exigidos pelo portal do aluno. Seus dados
            serão usados apenas para fins acadêmicos desta instituição.
          </p>
          <AlunoForm enviar={enviar} textoBotao="Concluir inscrição" camposInternos={false} exigirDadosHistorico />
        </div>
      )}
    </PaginaPortal>
  );
}
