'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, FileDown, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { abrirArquivo, api, ApiError } from '../../lib/api';
import { formatarData, formatarNota, mascararCpf } from '../../lib/formato';
import type { AlunoLista, Disciplina, TurmaDetalhe } from '../../lib/tipos';
import { useUsuario } from '../../components/AppShell';
import { TurmaForm } from '../../components/TurmaForm';
import { CademiTurma } from '../../components/CademiTurma';
import { InscricaoTurma } from '../../components/InscricaoTurma';
import { Aviso, Cabecalho, Carregando, Cartao, SemaforoBadge, useMensagem, Vazio } from '../../components/ui';

type FormDisciplina = { nome: string; cargaHoraria: string; docente: string; titulacao: string; cademiId: string };
const DISCIPLINA_VAZIA: FormDisciplina = { nome: '', cargaHoraria: '', docente: '', titulacao: '', cademiId: '' };

const paraFormDisciplina = (disciplina: Disciplina): FormDisciplina => ({
  nome: disciplina.nome,
  cargaHoraria: String(disciplina.cargaHoraria),
  docente: disciplina.docente ?? '',
  titulacao: disciplina.titulacao ?? '',
  cademiId: disciplina.cademiId ?? '',
});

function CamposDisciplina({ form, onChange }: { form: FormDisciplina; onChange: (form: FormDisciplina) => void }) {
  const alterar = (campo: keyof FormDisciplina) => (evento: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...form, [campo]: evento.target.value });

  return (
    <>
      <input value={form.nome} onChange={alterar('nome')} placeholder="Nome do módulo" required minLength={2} className="input mt-0 md:col-span-2" />
      <input type="number" min={0} value={form.cargaHoraria} onChange={alterar('cargaHoraria')} placeholder="CH (h)" className="input mt-0" />
      <input value={form.docente} onChange={alterar('docente')} placeholder="Docente" className="input mt-0" />
      <input value={form.titulacao} onChange={alterar('titulacao')} placeholder="Titulação (ex.: Mestre)" className="input mt-0" />
      <input
        value={form.cademiId}
        onChange={alterar('cademiId')}
        placeholder="ID na Cademi"
        title="Identificador da avaliação/módulo na Cademi, usado para importar as notas"
        className="input mt-0"
      />
    </>
  );
}

export default function TurmaDetalhePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { usuario } = useUsuario();
  const equipe = usuario.role !== 'PROFESSOR';

  const [turma, setTurma] = useState<TurmaDetalhe | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [editandoTurma, setEditandoTurma] = useState(false);
  const [novaDisciplina, setNovaDisciplina] = useState<FormDisciplina>(DISCIPLINA_VAZIA);
  const [edicao, setEdicao] = useState<{ id: string; form: FormDisciplina } | null>(null);
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<AlunoLista[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const { mensagem, erro, sucesso, limpar } = useMensagem();

  const carregar = useCallback(async () => {
    try {
      setTurma(await api<TurmaDetalhe>(`/turmas/${params.id}`));
    } catch (falha) {
      if (falha instanceof ApiError && (falha.status === 404 || falha.status === 400)) setNaoEncontrada(true);
      else erro(falha);
    }
  }, [params.id, erro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!equipe || busca.trim().length < 2) {
      setResultados([]);
      return;
    }
    const espera = setTimeout(() => {
      api<AlunoLista[]>(`/alunos?busca=${encodeURIComponent(busca.trim())}`)
        .then(setResultados)
        .catch(erro);
    }, 300);
    return () => clearTimeout(espera);
  }, [busca, equipe, erro]);

  if (naoEncontrada) return <Cabecalho titulo="Turma não encontrada" voltar={{ href: '/turmas', rotulo: 'Turmas' }} />;
  if (!turma) return mensagem ? <Aviso mensagem={mensagem} /> : <Carregando />;

  const executar = async (acao: () => Promise<unknown>, textoSucesso: string) => {
    setOcupado(true);
    limpar();
    try {
      await acao();
      sucesso(textoSucesso);
      await carregar();
      return true;
    } catch (falha) {
      erro(falha);
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const payloadDisciplina = (form: FormDisciplina) => ({ ...form, cargaHoraria: form.cargaHoraria ? Number(form.cargaHoraria) : 0 });

  const adicionarDisciplina = async (evento: FormEvent) => {
    evento.preventDefault();
    const ok = await executar(
      () => api('/disciplinas', { method: 'POST', json: { turmaId: turma.id, ...payloadDisciplina(novaDisciplina) } }),
      'Módulo adicionado.',
    );
    if (ok) setNovaDisciplina(DISCIPLINA_VAZIA);
  };

  const salvarEdicao = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!edicao) return;
    const ok = await executar(
      () => api(`/disciplinas/${edicao.id}`, { method: 'PUT', json: payloadDisciplina(edicao.form) }),
      'Módulo atualizado.',
    );
    if (ok) setEdicao(null);
  };

  const excluirDisciplina = (disciplina: Disciplina) => {
    if (!window.confirm(`Remover o módulo "${disciplina.nome}"?`)) return;
    void executar(() => api(`/disciplinas/${disciplina.id}`, { method: 'DELETE' }), 'Módulo removido.');
  };

  const mover = (indice: number, direcao: -1 | 1) => {
    const ids = turma.disciplinas.map((disciplina) => disciplina.id);
    const destino = indice + direcao;
    if (destino < 0 || destino >= ids.length) return;
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    void executar(() => api('/disciplinas/reordenar', { method: 'POST', json: { turmaId: turma.id, ids } }), 'Ordem atualizada.');
  };

  const matricular = async (alunoId: string) => {
    const ok = await executar(() => api('/matriculas', { method: 'POST', json: { alunoId, turmaId: turma.id } }), 'Aluno matriculado.');
    if (ok) setBusca('');
  };

  const removerMatricula = (matriculaId: string, nome: string) => {
    if (!window.confirm(`Remover ${nome} desta turma? As notas do aluno nesta turma também serão apagadas.`)) return;
    void executar(() => api(`/matriculas/${matriculaId}`, { method: 'DELETE' }), 'Matrícula removida.');
  };

  const excluirTurma = async () => {
    if (!window.confirm(`Excluir a turma "${turma.nome}" e suas disciplinas?`)) return;
    try {
      await api(`/turmas/${turma.id}`, { method: 'DELETE' });
      router.replace('/turmas');
    } catch (falha) {
      erro(falha);
    }
  };

  const baixarHistorico = async (matriculaId: string) => {
    try {
      await abrirArquivo(`/matriculas/${matriculaId}/historico`);
    } catch (falha) {
      erro(falha);
    }
  };

  const somaCargaHoraria = turma.disciplinas.reduce((total, disciplina) => total + disciplina.cargaHoraria, 0);
  const limiteModulos = turma.regras.modulosPorTurma;
  const turmaCompleta = limiteModulos > 0 && turma.disciplinas.length >= limiteModulos;
  const descricaoModulos = [
    limiteModulos > 0 && !turmaCompleta
      ? `Faltam ${limiteModulos - turma.disciplinas.length} módulo(s) para completar a turma.`
      : null,
    somaCargaHoraria !== turma.cargaHoraria && turma.disciplinas.length
      ? `Soma dos módulos: ${somaCargaHoraria}h (a turma tem ${turma.cargaHoraria}h).`
      : null,
    `Aprovação em cada módulo com nota ≥ ${formatarNota(turma.regras.mediaMinima)} (0 a 100).`,
  ]
    .filter(Boolean)
    .join(' ');
  const matriculados = new Set(turma.matriculas.map((matricula) => matricula.alunoId));
  const candidatos = resultados.filter((aluno) => !matriculados.has(aluno.id));

  return (
    <div className="space-y-6">
      <Cabecalho
        voltar={{ href: '/turmas', rotulo: 'Turmas' }}
        titulo={turma.nome}
        descricao={`${formatarData(turma.dataInicio)} a ${formatarData(turma.dataFim)} · ${turma.cargaHoraria}h · ${
          turma.ativa ? 'Ativa' : 'Inativa'
        }${turma.resolucaoMec ? ` · ${turma.resolucaoMec}` : ''}`}
        acoes={
          <>
            {equipe && !editandoTurma ? (
              <button type="button" onClick={() => setEditandoTurma(true)} className="btn btn-secundario">
                <Pencil className="h-4 w-4" /> Editar
              </button>
            ) : null}
            {usuario.role === 'ADMIN' ? (
              <button type="button" onClick={() => void excluirTurma()} className="btn btn-secundario text-rose-700">
                <Trash2 className="h-4 w-4" /> Excluir
              </button>
            ) : null}
          </>
        }
      />

      <Aviso mensagem={mensagem} onFechar={limpar} />

      {editandoTurma ? (
        <Cartao titulo="Editar turma">
          <TurmaForm
            turma={turma}
            onSalvo={() => {
              setEditandoTurma(false);
              sucesso('Turma atualizada.');
              void carregar();
            }}
            onCancelar={() => setEditandoTurma(false)}
          />
        </Cartao>
      ) : null}

      <Cartao
        titulo={limiteModulos > 0 ? `Módulos (${turma.disciplinas.length} de ${limiteModulos})` : 'Módulos'}
        descricao={descricaoModulos}
      >
        {turma.disciplinas.length === 0 ? (
          <Vazio>Nenhum módulo cadastrado.</Vazio>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="w-12">Nº</th>
                  <th>Módulo</th>
                  <th className="text-center">CH</th>
                  <th>Docente</th>
                  {equipe ? <th className="text-right">Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {turma.disciplinas.map((disciplina, indice) =>
                  edicao?.id === disciplina.id ? (
                    <tr key={disciplina.id}>
                      <td colSpan={5}>
                        <form onSubmit={salvarEdicao} className="grid gap-2 md:grid-cols-6">
                          <CamposDisciplina form={edicao.form} onChange={(form) => setEdicao({ id: disciplina.id, form })} />
                          <div className="flex gap-2 md:col-span-6">
                            <button type="submit" disabled={ocupado} className="btn btn-primario btn-sm">
                              Salvar
                            </button>
                            <button type="button" onClick={() => setEdicao(null)} className="btn btn-secundario btn-sm">
                              Cancelar
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={disciplina.id}>
                      <td className="text-slate-500">{disciplina.ordem}</td>
                      <td>
                        <p className="font-medium text-slate-900">{disciplina.nome}</p>
                        <p className={disciplina.cademiId ? 'text-xs text-slate-500' : 'text-xs text-amber-600'}>
                          {disciplina.cademiId ? `Cademi: ${disciplina.cademiId}` : 'Sem vínculo com a Cademi'}
                        </p>
                      </td>
                      <td className="text-center text-slate-600">{disciplina.cargaHoraria}h</td>
                      <td className="text-slate-600">
                        {disciplina.docente ?? '—'}
                        {disciplina.titulacao ? <span className="text-xs text-slate-400"> · {disciplina.titulacao}</span> : null}
                      </td>
                      {equipe ? (
                        <td>
                          <div className="flex justify-end gap-1">
                            <button type="button" disabled={ocupado || indice === 0} onClick={() => mover(indice, -1)} className="btn btn-fantasma btn-sm" title="Subir">
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={ocupado || indice === turma.disciplinas.length - 1}
                              onClick={() => mover(indice, 1)}
                              className="btn btn-fantasma btn-sm"
                              title="Descer"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEdicao({ id: disciplina.id, form: paraFormDisciplina(disciplina) })}
                              className="btn btn-fantasma btn-sm"
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" disabled={ocupado} onClick={() => excluirDisciplina(disciplina)} className="btn btn-fantasma btn-sm text-rose-600" title="Remover">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}

        {equipe && turmaCompleta ? (
          <p className="mt-4 text-sm text-emerald-700">A turma já tem os {limiteModulos} módulos previstos.</p>
        ) : null}
        {equipe && !turmaCompleta ? (
          <form onSubmit={adicionarDisciplina} className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-7">
            <CamposDisciplina form={novaDisciplina} onChange={setNovaDisciplina} />
            <button type="submit" disabled={ocupado} className="btn btn-primario">
              <Plus className="h-4 w-4" /> Adicionar
            </button>
          </form>
        ) : null}
      </Cartao>

      {equipe ? <InscricaoTurma turma={turma} onAlterado={() => void carregar()} /> : null}

      {equipe ? (
        <CademiTurma
          turmaId={turma.id}
          modulosVinculados={turma.disciplinas.filter((disciplina) => disciplina.cademiId).length}
          totalModulos={turma.disciplinas.length}
          onImportado={() => void carregar()}
        />
      ) : null}

      <Cartao titulo={`Alunos matriculados (${turma.matriculas.length})`}>
        {equipe ? (
          <div className="mb-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Matricular aluno: digite nome ou CPF"
                className="input mt-0 pl-9"
              />
            </div>
            {busca.trim().length >= 2 ? (
              <div className="mt-2 rounded-xl border border-slate-200 bg-white">
                {candidatos.length === 0 ? (
                  <p className="p-3 text-sm text-slate-500">
                    Nenhum aluno disponível.{' '}
                    <Link href="/alunos" className="link">
                      Cadastrar novo aluno
                    </Link>
                  </p>
                ) : (
                  candidatos.slice(0, 8).map((aluno) => (
                    <button
                      key={aluno.id}
                      type="button"
                      disabled={ocupado}
                      onClick={() => void matricular(aluno.id)}
                      className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-indigo-50"
                    >
                      <span>
                        <span className="font-medium text-slate-900">{aluno.nome}</span>
                        <span className="ml-2 text-slate-500">{mascararCpf(aluno.cpf)}</span>
                      </span>
                      <Plus className="h-4 w-4 text-indigo-600" />
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {turma.matriculas.length === 0 ? (
          <Vazio>Nenhum aluno matriculado.</Vazio>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Situação</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {turma.matriculas.map((matricula) => (
                  <tr key={matricula.id}>
                    <td>
                      <Link href={`/alunos/${matricula.aluno.id}`} className="link">
                        {matricula.aluno.nome}
                      </Link>
                      <p className="text-xs text-slate-500">{mascararCpf(matricula.aluno.cpf)}</p>
                    </td>
                    <td>
                      <SemaforoBadge status={matricula.aluno.statusSemaforo} />
                      {matricula.historicoGeradoEm ? <p className="mt-1 text-xs text-emerald-700">Histórico final gerado</p> : null}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <Link href={`/notas?turmaId=${turma.id}&alunoId=${matricula.aluno.id}`} className="btn btn-secundario btn-sm">
                          Notas
                        </Link>
                        <button type="button" onClick={() => void baixarHistorico(matricula.id)} className="btn btn-secundario btn-sm">
                          <FileDown className="h-3.5 w-3.5" /> Histórico
                        </button>
                        {equipe ? (
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => removerMatricula(matricula.id, matricula.aluno.nome)}
                            className="btn btn-fantasma btn-sm text-rose-600"
                            title="Remover da turma"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </div>
  );
}
