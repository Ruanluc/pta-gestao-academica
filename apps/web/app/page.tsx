'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BookOpen, ClipboardList, FileText, GraduationCap } from 'lucide-react';
import { api } from './lib/api';
import { formatarNota } from './lib/formato';
import { ROTULOS_SEMAFORO, type Dashboard, type StatusSemaforo } from './lib/tipos';
import { useUsuario } from './components/AppShell';
import { PrazoLote } from './components/Lotes';
import { Aviso, Cabecalho, Carregando, Cartao, cls, useMensagem } from './components/ui';

const CORES: Record<StatusSemaforo, string> = {
  VERDE: 'bg-emerald-500',
  AMARELO: 'bg-amber-500',
  VERMELHO: 'bg-rose-500',
};

export default function InicioPage() {
  const { usuario } = useUsuario();
  const [dados, setDados] = useState<Dashboard | null>(null);
  const { mensagem, erro } = useMensagem();

  useEffect(() => {
    api<Dashboard>('/dashboard').then(setDados).catch(erro);
  }, [erro]);

  const indicadores = dados
    ? [
        { rotulo: 'Turmas ativas', valor: dados.turmasAtivas, detalhe: `${dados.totalTurmas} no total`, href: '/turmas', icone: BookOpen },
        { rotulo: 'Alunos', valor: dados.totalAlunos, detalhe: 'cadastrados', href: '/alunos', icone: GraduationCap },
        ...(usuario.role !== 'PROFESSOR'
          ? [{ rotulo: 'Documentos', valor: dados.documentosPendentes, detalhe: 'aguardando análise', href: '/documentos', icone: FileText }]
          : []),
        { rotulo: 'Notas', valor: null, detalhe: 'lançar por aluno ou por módulo', href: '/notas', icone: ClipboardList },
      ]
    : [];

  return (
    <div>
      <Cabecalho titulo={`Olá, ${usuario.nome.split(' ')[0]}`} descricao="Resumo da gestão acadêmica de pós-graduação." />
      <Aviso mensagem={mensagem} />

      {!dados ? (
        !mensagem && <Carregando />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {indicadores.map((item) => {
              const Icone = item.icone;
              return (
                <Link key={item.href} href={item.href} className="cartao transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">{item.rotulo}</span>
                    <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                      <Icone className="h-4 w-4" />
                    </span>
                  </div>
                  {item.valor !== null ? <p className="mt-3 text-3xl font-semibold text-slate-900">{item.valor}</p> : null}
                  <p className={cls('text-sm text-slate-500', item.valor === null && 'mt-3')}>{item.detalhe}</p>
                </Link>
              );
            })}
          </div>

          {usuario.role !== 'PROFESSOR' ? (
            <Cartao titulo="Certificação e análises">
              <div className="grid gap-4 text-sm sm:grid-cols-3">
                <Link href="/lotes" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
                  <p className="text-slate-500">Lotes com a certificadora</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{dados.certificacao.lotesComCertificadora}</p>
                  <p className="text-xs text-slate-500">{dados.certificacao.lotesAbertos} em montagem</p>
                </Link>
                <Link
                  href={dados.certificacao.proximoPrazo ? `/lotes/${dados.certificacao.proximoPrazo.id}` : '/lotes'}
                  className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50"
                >
                  <p className="text-slate-500">Próximo prazo da certificadora</p>
                  {dados.certificacao.proximoPrazo ? (
                    <>
                      <p className="mt-1 font-semibold text-slate-900">Lote {dados.certificacao.proximoPrazo.referencia}</p>
                      <PrazoLote status="ENVIADO" prazoEm={dados.certificacao.proximoPrazo.prazoEm} />
                      <p className="text-xs text-slate-500">{dados.certificacao.proximoPrazo.pendentes} certificado(s) pendente(s)</p>
                    </>
                  ) : (
                    <p className="mt-1 text-slate-400">Nenhum lote aguardando</p>
                  )}
                </Link>
                <Link href="/documentos" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
                  <p className="text-slate-500">Correções de dados</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{dados.solicitacoesPendentes}</p>
                  <p className="text-xs text-slate-500">aguardando análise</p>
                </Link>
              </div>
            </Cartao>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[1.5fr,1fr]">
            <Cartao titulo="Situação dos alunos" descricao="Clique em uma faixa para ver a lista de alunos.">
              <div className="space-y-3">
                {(['VERMELHO', 'AMARELO', 'VERDE'] as StatusSemaforo[]).map((status) => {
                  const total = dados.semaforo[status];
                  const percentual = dados.totalAlunos ? (total / dados.totalAlunos) * 100 : 0;
                  return (
                    <Link key={status} href={`/alunos?status=${status}`} className="block rounded-lg p-2 hover:bg-slate-50">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 font-medium text-slate-700">
                          <span className={cls('h-2.5 w-2.5 rounded-full', CORES[status])} />
                          {ROTULOS_SEMAFORO[status]}
                        </span>
                        <span className="text-slate-600">{total}</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-slate-100">
                        <div className={cls('h-2 rounded-full', CORES[status])} style={{ width: `${percentual}%` }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Cartao>

            <Cartao titulo="Configuração do sistema">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Armazenamento de arquivos</dt>
                  <dd className="font-medium text-slate-900">
                    {dados.integracoes.armazenamento === 'google-drive' ? 'Google Drive' : 'Servidor local'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Google Drive</dt>
                  <dd className="font-medium text-slate-900">
                    {{ desativado: 'Não configurado', manual: 'Exportação manual', automatico: 'Envio automático' }[dados.integracoes.drive]}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Envio de e-mails</dt>
                  <dd className="font-medium text-slate-900">{dados.integracoes.email === 'smtp' ? 'SMTP' : 'Não configurado'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Notas da Cademi</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {{ desativada: 'Não configurada', pendente: 'Aguardando implementação', ativa: 'Ativa' }[dados.integracoes.cademi]}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Geração de históricos</dt>
                  <dd className="font-medium text-slate-900">{dados.integracoes.fila === 'redis' ? 'Fila (Redis)' : 'Automática (API)'}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-slate-100 pt-3">
                  <dt className="text-slate-500">Módulos por turma</dt>
                  <dd className="font-medium text-slate-900">{dados.regras.modulosPorTurma || 'Sem limite'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Aprovação no módulo</dt>
                  <dd className="text-right font-medium text-slate-900">
                    nota ≥ {formatarNota(dados.regras.mediaMinima)} (0 a 100)
                    {dados.regras.frequenciaMinima > 0 ? ` e frequência ≥ ${dados.regras.frequenciaMinima}%` : ''}
                  </dd>
                </div>
              </dl>
            </Cartao>
          </div>
        </div>
      )}
    </div>
  );
}
