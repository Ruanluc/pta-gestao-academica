'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '../lib/api';
import { formatarNota, mascararCpf, numeroDeCampo } from '../lib/formato';
import { situacaoDisciplina, type Nota, type Turma, type TurmaDetalhe } from '../lib/tipos';
import { Aviso, Cabecalho, Carregando, Cartao, cls, SituacaoTexto, useMensagem, Vazio } from '../components/ui';

type Valor = { media: string; frequencia: string };
type Modo = 'aluno' | 'disciplina';
type Linha = { chave: string; titulo: string; subtitulo: string; alunoId: string; disciplinaId: string };

const VAZIO: Valor = { media: '', frequencia: '' };
const chave = (alunoId: string, disciplinaId: string) => `${alunoId}:${disciplinaId}`;
const paraTexto = (valor: number | null) => (valor === null ? '' : String(valor).replace('.', ','));

export default function NotasPage() {
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [turmaId, setTurmaId] = useState('');
  const [turma, setTurma] = useState<TurmaDetalhe | null>(null);
  const [modo, setModo] = useState<Modo>('aluno');
  const [alunoId, setAlunoId] = useState('');
  const [disciplinaId, setDisciplinaId] = useState('');
  const [originais, setOriginais] = useState<Record<string, Valor>>({});
  const [origens, setOrigens] = useState<Record<string, Nota['origem']>>({});
  const [valores, setValores] = useState<Record<string, Valor>>({});
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const { mensagem, erro, sucesso, limpar, definir } = useMensagem();

  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);
    setTurmaId(parametros.get('turmaId') ?? '');
    setAlunoId(parametros.get('alunoId') ?? '');
    api<Turma[]>('/turmas').then(setTurmas).catch(erro);
  }, [erro]);

  const carregarTurma = useCallback(
    async (id: string) => {
      if (!id) {
        setTurma(null);
        return;
      }
      setCarregando(true);
      try {
        const [detalhe, notas] = await Promise.all([api<TurmaDetalhe>(`/turmas/${id}`), api<Nota[]>(`/notas?turmaId=${id}`)]);
        const mapa: Record<string, Valor> = {};
        const mapaOrigens: Record<string, Nota['origem']> = {};
        for (const nota of notas) {
          mapa[chave(nota.alunoId, nota.disciplinaId)] = { media: paraTexto(nota.media), frequencia: paraTexto(nota.frequencia) };
          mapaOrigens[chave(nota.alunoId, nota.disciplinaId)] = nota.origem;
        }
        setTurma(detalhe);
        setOriginais(mapa);
        setOrigens(mapaOrigens);
        setValores(mapa);
        setAlunoId((atual) => (detalhe.matriculas.some((matricula) => matricula.alunoId === atual) ? atual : detalhe.matriculas[0]?.alunoId ?? ''));
        setDisciplinaId((atual) => (detalhe.disciplinas.some((disciplina) => disciplina.id === atual) ? atual : detalhe.disciplinas[0]?.id ?? ''));
      } catch (falha) {
        erro(falha);
      } finally {
        setCarregando(false);
      }
    },
    [erro],
  );

  useEffect(() => {
    void carregarTurma(turmaId);
  }, [turmaId, carregarTurma]);

  const linhas: Linha[] = useMemo(() => {
    if (!turma) return [];
    if (modo === 'aluno') {
      if (!alunoId) return [];
      return turma.disciplinas.map((disciplina) => ({
        chave: chave(alunoId, disciplina.id),
        titulo: `${disciplina.ordem}. ${disciplina.nome}`,
        subtitulo: `${disciplina.cargaHoraria}h${disciplina.docente ? ` · ${disciplina.docente}` : ''}`,
        alunoId,
        disciplinaId: disciplina.id,
      }));
    }
    if (!disciplinaId) return [];
    return turma.matriculas.map((matricula) => ({
      chave: chave(matricula.alunoId, disciplinaId),
      titulo: matricula.aluno.nome,
      subtitulo: mascararCpf(matricula.aluno.cpf),
      alunoId: matricula.alunoId,
      disciplinaId,
    }));
  }, [turma, modo, alunoId, disciplinaId]);

  const alteradas = linhas.filter((linha) => {
    const atual = valores[linha.chave] ?? VAZIO;
    const original = originais[linha.chave] ?? VAZIO;
    return atual.media !== original.media || atual.frequencia !== original.frequencia;
  });

  const alterar = (chaveLinha: string, campo: keyof Valor, valor: string) =>
    setValores((atuais) => ({ ...atuais, [chaveLinha]: { ...(atuais[chaveLinha] ?? VAZIO), [campo]: valor } }));

  const confirmarDescarte = () => alteradas.length === 0 || window.confirm('Há notas não salvas. Deseja descartá-las?');

  const salvar = async () => {
    if (!turma || alteradas.length === 0) return;
    limpar();

    const itens = [];
    for (const linha of alteradas) {
      const valor = valores[linha.chave] ?? VAZIO;
      const media = numeroDeCampo(valor.media);
      const frequencia = numeroDeCampo(valor.frequencia);
      if (Number.isNaN(media) || (media !== null && (media < 0 || media > 100))) {
        definir({ tipo: 'erro', texto: `Nota inválida em "${linha.titulo}". Use valores de 0 a 100.` });
        return;
      }
      if (Number.isNaN(frequencia) || (frequencia !== null && (frequencia < 0 || frequencia > 100))) {
        definir({ tipo: 'erro', texto: `Frequência inválida em "${linha.titulo}". Use valores de 0 a 100.` });
        return;
      }
      itens.push({ alunoId: linha.alunoId, disciplinaId: linha.disciplinaId, media, frequencia });
    }

    setSalvando(true);
    try {
      if (modo === 'aluno') {
        await api('/notas/lote', {
          method: 'PUT',
          json: { alunoId, notas: itens.map(({ disciplinaId: id, media, frequencia }) => ({ disciplinaId: id, media, frequencia })) },
        });
      } else {
        await api('/notas/disciplina', {
          method: 'PUT',
          json: { disciplinaId, notas: itens.map(({ alunoId: id, media, frequencia }) => ({ alunoId: id, media, frequencia })) },
        });
      }
      await carregarTurma(turma.id);
      sucesso(`${itens.length} nota(s) salva(s).`);
    } catch (falha) {
      erro(falha);
    } finally {
      setSalvando(false);
    }
  };

  const indiceAluno = turma ? turma.matriculas.findIndex((matricula) => matricula.alunoId === alunoId) : -1;

  return (
    <div>
      <Cabecalho titulo="Notas" descricao="Lance a nota da avaliação de cada módulo (0 a 100) e a frequência (%), por aluno ou por módulo." />
      <Aviso mensagem={mensagem} onFechar={limpar} />

      <Cartao className="mb-6">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="rotulo">
            Turma
            <select
              value={turmaId}
              onChange={(evento) => {
                if (confirmarDescarte()) setTurmaId(evento.target.value);
              }}
              className="input"
            >
              <option value="">Selecione a turma</option>
              {turmas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                  {item.ativa ? '' : ' (inativa)'}
                </option>
              ))}
            </select>
          </label>

          <div className="rotulo">
            Lançar por
            <div className="mt-1 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm">
              {(['aluno', 'disciplina'] as Modo[]).map((opcao) => (
                <button
                  key={opcao}
                  type="button"
                  onClick={() => {
                    if (confirmarDescarte()) {
                      setValores(originais);
                      setModo(opcao);
                    }
                  }}
                  className={cls('rounded-md py-1.5 font-medium', modo === opcao ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
                >
                  {opcao === 'aluno' ? 'Aluno' : 'Módulo'}
                </button>
              ))}
            </div>
          </div>

          {turma ? (
            modo === 'aluno' ? (
              <label className="rotulo">
                Aluno
                <select
                  value={alunoId}
                  onChange={(evento) => {
                    if (confirmarDescarte()) {
                      setValores(originais);
                      setAlunoId(evento.target.value);
                    }
                  }}
                  className="input"
                >
                  {turma.matriculas.map((matricula) => (
                    <option key={matricula.alunoId} value={matricula.alunoId}>
                      {matricula.aluno.nome}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="rotulo">
                Módulo
                <select
                  value={disciplinaId}
                  onChange={(evento) => {
                    if (confirmarDescarte()) {
                      setValores(originais);
                      setDisciplinaId(evento.target.value);
                    }
                  }}
                  className="input"
                >
                  {turma.disciplinas.map((disciplina) => (
                    <option key={disciplina.id} value={disciplina.id}>
                      {disciplina.ordem}. {disciplina.nome}
                    </option>
                  ))}
                </select>
              </label>
            )
          ) : null}
        </div>
      </Cartao>

      {!turmaId ? (
        <Vazio>Selecione uma turma para lançar as notas.</Vazio>
      ) : carregando && !turma ? (
        <Carregando />
      ) : !turma ? null : turma.matriculas.length === 0 ? (
        <Vazio>
          Nenhum aluno matriculado nesta turma.{' '}
          <Link href={`/turmas/${turma.id}`} className="link">
            Matricular alunos
          </Link>
        </Vazio>
      ) : turma.disciplinas.length === 0 ? (
        <Vazio>
          Esta turma não tem módulos.{' '}
          <Link href={`/turmas/${turma.id}`} className="link">
            Cadastrar módulos
          </Link>
        </Vazio>
      ) : (
        <Cartao
          titulo={modo === 'aluno' ? turma.matriculas[indiceAluno]?.aluno.nome : turma.disciplinas.find((disciplina) => disciplina.id === disciplinaId)?.nome}
          descricao={`Aprovação em cada módulo: nota ≥ ${formatarNota(turma.regras.mediaMinima)}${
            turma.regras.frequenciaMinima > 0 ? ` e frequência ≥ ${turma.regras.frequenciaMinima}%` : ''
          }. Deixe em branco o que ainda não foi avaliado.${
            turma.regras.modulosPorTurma > 0 && turma.disciplinas.length < turma.regras.modulosPorTurma
              ? ` Atenção: a turma tem ${turma.disciplinas.length} de ${turma.regras.modulosPorTurma} módulos cadastrados.`
              : ''
          }`}
          acoes={
            modo === 'aluno' ? (
              <Link href={`/alunos/${alunoId}`} className="btn btn-secundario btn-sm">
                Ver aluno
              </Link>
            ) : null
          }
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="tabela">
              <thead>
                <tr>
                  <th>{modo === 'aluno' ? 'Módulo' : 'Aluno'}</th>
                  <th className="w-32 text-center">Nota (0–100)</th>
                  <th className="w-32 text-center">Frequência (%)</th>
                  <th className="w-28 text-center">Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha) => {
                  const valor = valores[linha.chave] ?? VAZIO;
                  const alterada = alteradas.some((item) => item.chave === linha.chave);
                  return (
                    <tr key={linha.chave} className={alterada ? 'bg-amber-50/60' : undefined}>
                      <td>
                        <p className="font-medium text-slate-900">
                          {linha.titulo}
                          {origens[linha.chave] === 'CADEMI' && !alterada ? (
                            <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">Cademi</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-slate-500">{linha.subtitulo}</p>
                      </td>
                      <td>
                        <input
                          inputMode="decimal"
                          value={valor.media}
                          onChange={(evento) => alterar(linha.chave, 'media', evento.target.value)}
                          placeholder="—"
                          aria-label={`Nota de ${linha.titulo}`}
                          className="input mt-0 text-center"
                        />
                      </td>
                      <td>
                        <input
                          inputMode="decimal"
                          value={valor.frequencia}
                          onChange={(evento) => alterar(linha.chave, 'frequencia', evento.target.value)}
                          placeholder="—"
                          aria-label={`Frequência de ${linha.titulo}`}
                          className="input mt-0 text-center"
                        />
                      </td>
                      <td className="text-center">
                        <SituacaoTexto
                          situacao={situacaoDisciplina(
                            { media: numeroDeCampo(valor.media), frequencia: numeroDeCampo(valor.frequencia) },
                            turma.regras,
                          )}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" disabled={salvando || alteradas.length === 0} onClick={() => void salvar()} className="btn btn-primario">
              <Save className="h-4 w-4" /> {salvando ? 'Salvando...' : `Salvar${alteradas.length ? ` (${alteradas.length})` : ''}`}
            </button>
            {alteradas.length ? (
              <button type="button" onClick={() => setValores(originais)} className="btn btn-secundario">
                Descartar alterações
              </button>
            ) : null}
            {modo === 'aluno' && indiceAluno >= 0 && indiceAluno < turma.matriculas.length - 1 ? (
              <button
                type="button"
                onClick={() => {
                  if (confirmarDescarte()) {
                    setValores(originais);
                    setAlunoId(turma.matriculas[indiceAluno + 1].alunoId);
                  }
                }}
                className="btn btn-fantasma ml-auto"
              >
                Próximo aluno →
              </button>
            ) : null}
          </div>
        </Cartao>
      )}
    </div>
  );
}
