'use client';

import { useState } from 'react';
import { Link2, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import type { Turma } from '../lib/tipos';
import { Aviso, CampoCopiavel, Cartao, cls, useMensagem } from './ui';

export function InscricaoTurma({ turma, onAlterado }: { turma: Turma; onAlterado: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const { mensagem, erro, sucesso, limpar } = useMensagem();
  const origem = typeof window !== 'undefined' ? window.location.origin : '';
  const link = turma.codigoInscricao ? `${origem}/inscricao/${turma.codigoInscricao}` : null;

  const alterar = async (dados: { abertas: boolean; gerarNovoLink?: boolean }, texto: string) => {
    setOcupado(true);
    limpar();
    try {
      await api(`/turmas/${turma.id}/inscricao`, { method: 'POST', json: dados });
      sucesso(texto);
      onAlterado();
    } catch (falha) {
      erro(falha);
    } finally {
      setOcupado(false);
    }
  };

  const gerarNovoLink = () => {
    if (!window.confirm('Gerar um novo link? O link atual deixará de funcionar para quem ainda não se inscreveu.')) return;
    void alterar({ abertas: turma.inscricoesAbertas, gerarNovoLink: true }, 'Novo link de inscrição gerado.');
  };

  return (
    <Cartao
      titulo="Inscrição online"
      descricao="Envie o link aos alunos: eles preenchem os dados, ficam matriculados nesta turma e já podem enviar os documentos pelo portal."
      acoes={
        <span
          className={cls(
            'rounded-full px-2.5 py-0.5 text-xs font-medium',
            turma.inscricoesAbertas ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
          )}
        >
          {turma.inscricoesAbertas ? 'Inscrições abertas' : 'Inscrições encerradas'}
        </span>
      }
    >
      <Aviso mensagem={mensagem} onFechar={limpar} />
      {!turma.ativa ? (
        <p className="mb-3 text-sm text-amber-700">A turma está inativa: o link de inscrição só funciona com a turma ativa.</p>
      ) : null}
      {turma.inscricoesAbertas && link ? <CampoCopiavel valor={link} /> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {turma.inscricoesAbertas ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void alterar({ abertas: false }, 'Inscrições encerradas: o link não aceita mais inscrições.')}
            className="btn btn-secundario"
          >
            Encerrar inscrições
          </button>
        ) : (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void alterar({ abertas: true }, 'Inscrições abertas. Copie o link e envie aos alunos.')}
            className="btn btn-primario"
          >
            <Link2 className="h-4 w-4" /> Abrir inscrições
          </button>
        )}
        {link ? (
          <button type="button" disabled={ocupado} onClick={gerarNovoLink} className="btn btn-fantasma">
            <RefreshCw className="h-4 w-4" /> Gerar novo link
          </button>
        ) : null}
      </div>
    </Cartao>
  );
}
