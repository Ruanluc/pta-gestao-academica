'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import { formatarData, formatarDataHora, mascararCpf } from '../lib/formato';
import { CORES_SITUACAO_MATRICULA, ROTULOS_SITUACAO_MATRICULA, type SituacaoMatricula } from '../lib/tipos';
import { Aviso, Cabecalho, Carregando, Cartao, cls, useMensagem, Vazio } from '../components/ui';

type MatriculaFinanceiro = {
  id: string;
  numeroMatricula: string | null;
  situacao: SituacaoMatricula;
  situacaoAtualizadaEm: string | null;
  dataInclusao: string;
  dataCancelamento: string | null;
  aluno: { id: string; nome: string; cpf: string; email: string; telefone: string | null };
  turma: { id: string; nome: string; codigo: string | null };
};

type Resposta = {
  total: number;
  pagina: number;
  porPagina: number;
  matriculas: MatriculaFinanceiro[];
  porSituacao: Partial<Record<SituacaoMatricula, number>>;
};

type TurmaResumo = { id: string; nome: string; codigo: string | null; ativa: boolean };

const SITUACOES = Object.keys(ROTULOS_SITUACAO_MATRICULA) as SituacaoMatricula[];

export default function FinanceiroPage() {
  const [turmas, setTurmas] = useState<TurmaResumo[]>([]);
  const [turmaId, setTurmaId] = useState('');
  const [situacao, setSituacao] = useState<SituacaoMatricula | ''>('');
  const [textoBusca, setTextoBusca] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const { mensagem, erro, sucesso, limpar } = useMensagem();

  useEffect(() => {
    api<TurmaResumo[]>('/financeiro/turmas').then(setTurmas).catch(erro);
  }, [erro]);

  // Busca só depois que a pessoa para de digitar
  useEffect(() => {
    const espera = setTimeout(() => {
      setBusca(textoBusca.trim());
      setPagina(1);
    }, 300);
    return () => clearTimeout(espera);
  }, [textoBusca]);

  const carregar = useCallback(async () => {
    const parametros = new URLSearchParams({ pagina: String(pagina) });
    if (turmaId) parametros.set('turmaId', turmaId);
    if (situacao) parametros.set('situacao', situacao);
    if (busca) parametros.set('busca', busca);
    try {
      setDados(await api<Resposta>(`/financeiro/matriculas?${parametros}`));
    } catch (falha) {
      erro(falha);
    }
  }, [turmaId, situacao, busca, pagina, erro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const alterarSituacao = async (matricula: MatriculaFinanceiro, nova: SituacaoMatricula) => {
    if (
      nova === 'CANCELADO' &&
      !window.confirm(`Cancelar a matrícula de ${matricula.aluno.nome} (${matricula.turma.codigo ?? matricula.turma.nome})? Matrícula cancelada não entra nos lotes de certificação.`)
    ) {
      return;
    }
    setSalvando(matricula.id);
    limpar();
    try {
      const atualizada = await api<MatriculaFinanceiro>(`/financeiro/matriculas/${matricula.id}`, { method: 'PATCH', json: { situacao: nova } });
      setDados((atuais) => atuais && { ...atuais, matriculas: atuais.matriculas.map((item) => (item.id === atualizada.id ? atualizada : item)) });
      sucesso(`${matricula.aluno.nome}: ${ROTULOS_SITUACAO_MATRICULA[nova]}.`);
    } catch (falha) {
      erro(falha);
    } finally {
      setSalvando(null);
    }
  };

  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1;

  return (
    <div className="space-y-6">
      <Cabecalho
        titulo="Financeiro"
        descricao="Situação de cada matrícula (a Eduzz não tem integração, então é mantida aqui). Matrícula cancelada não entra nos lotes de certificação."
      />
      <Aviso mensagem={mensagem} onFechar={limpar} />

      <Cartao>
        <div className="grid gap-3 md:grid-cols-[1fr,1fr,1.4fr]">
          <select
            value={turmaId}
            onChange={(evento) => {
              setTurmaId(evento.target.value);
              setPagina(1);
            }}
            className="input mt-0"
            aria-label="Turma"
          >
            <option value="">Todas as turmas</option>
            {turmas.map((turma) => (
              <option key={turma.id} value={turma.id}>
                {turma.codigo ? `${turma.codigo} · ` : ''}
                {turma.nome}
                {turma.ativa ? '' : ' (encerrada)'}
              </option>
            ))}
          </select>
          <select
            value={situacao}
            onChange={(evento) => {
              setSituacao(evento.target.value as SituacaoMatricula | '');
              setPagina(1);
            }}
            className="input mt-0"
            aria-label="Situação"
          >
            <option value="">Todas as situações</option>
            {SITUACOES.map((item) => (
              <option key={item} value={item}>
                {ROTULOS_SITUACAO_MATRICULA[item]}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={textoBusca}
              onChange={(evento) => setTextoBusca(evento.target.value)}
              placeholder="Nome, e-mail, CPF ou nº de matrícula"
              className="input mt-0 pl-9"
            />
          </div>
        </div>

        {dados ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {SITUACOES.filter((item) => dados.porSituacao[item]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setSituacao(situacao === item ? '' : item);
                  setPagina(1);
                }}
                className={cls(
                  'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                  CORES_SITUACAO_MATRICULA[item],
                  situacao && situacao !== item && 'opacity-50',
                )}
              >
                {ROTULOS_SITUACAO_MATRICULA[item]}: {dados.porSituacao[item]}
              </button>
            ))}
          </div>
        ) : null}
      </Cartao>

      <Cartao titulo={dados ? `${dados.total} matrícula(s)` : 'Matrículas'}>
        {!dados ? (
          <Carregando />
        ) : dados.matriculas.length === 0 ? (
          <Vazio>Nenhuma matrícula encontrada.</Vazio>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Aluno</th>
                    <th>Turma</th>
                    <th>Matrícula</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.matriculas.map((matricula) => (
                    <tr key={matricula.id} className="align-top">
                      <td>
                        <p className="font-medium text-slate-900">{matricula.aluno.nome}</p>
                        <p className="text-xs text-slate-500">
                          CPF {mascararCpf(matricula.aluno.cpf)} · {matricula.aluno.email || 'sem e-mail'}
                        </p>
                      </td>
                      <td className="text-slate-600">{matricula.turma.codigo ?? matricula.turma.nome}</td>
                      <td className="text-xs text-slate-600">
                        <p>{matricula.numeroMatricula ? `nº ${matricula.numeroMatricula}` : 'sem número'}</p>
                        <p>entrou em {formatarData(matricula.dataInclusao)}</p>
                        {matricula.dataCancelamento ? <p className="text-rose-700">cancelada em {formatarData(matricula.dataCancelamento)}</p> : null}
                      </td>
                      <td>
                        <select
                          value={matricula.situacao}
                          disabled={salvando === matricula.id}
                          onChange={(evento) => void alterarSituacao(matricula, evento.target.value as SituacaoMatricula)}
                          className={cls('input mt-0 w-36 py-1 text-sm font-medium', CORES_SITUACAO_MATRICULA[matricula.situacao])}
                          aria-label={`Situação de ${matricula.aluno.nome}`}
                        >
                          {SITUACOES.map((item) => (
                            <option key={item} value={item}>
                              {ROTULOS_SITUACAO_MATRICULA[item]}
                            </option>
                          ))}
                        </select>
                        {matricula.situacaoAtualizadaEm ? (
                          <p className="mt-1 text-xs text-slate-400">atualizada em {formatarDataHora(matricula.situacaoAtualizadaEm)}</p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 ? (
              <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                <button type="button" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} className="btn btn-secundario btn-sm">
                  ← Anterior
                </button>
                <span>
                  Página {pagina} de {totalPaginas}
                </span>
                <button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina(pagina + 1)} className="btn btn-secundario btn-sm">
                  Próxima →
                </button>
              </div>
            ) : null}
          </>
        )}
      </Cartao>
    </div>
  );
}
