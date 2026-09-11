'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, FileDown, Pencil, Trash2 } from 'lucide-react';
import { abrirArquivo, api, ApiError } from '../../lib/api';
import { formatarData, formatarDataHora, formatarNota, formatarNumero, mascararCpf } from '../../lib/formato';
import {
  ROTULOS_CONDICAO,
  ROTULOS_DOCUMENTO,
  situacaoDisciplina,
  type Aluno,
  type AlunoDetalhe,
  type TipoDocumento,
  type Turma,
} from '../../lib/tipos';
import { useUsuario } from '../../components/AppShell';
import { AlunoForm } from '../../components/AlunoForm';
import { ChecklistDocumentos, ListaDocumentos, statusDoTipo, UploadDocumento } from '../../components/Documentos';
import { LinkAcessoAluno } from '../../components/LinkAcessoAluno';
import { PastaDrive } from '../../components/PastaDrive';
import { ListaSolicitacoes } from '../../components/Solicitacoes';
import { Aviso, Cabecalho, Carregando, Cartao, SemaforoBadge, SituacaoTexto, useMensagem, Vazio } from '../../components/ui';

export default function AlunoDetalhePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { usuario } = useUsuario();
  const equipe = usuario.role !== 'PROFESSOR';

  const [aluno, setAluno] = useState<AlunoDetalhe | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [editando, setEditando] = useState(false);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [turmaSelecionada, setTurmaSelecionada] = useState('');
  const { mensagem, erro, sucesso, limpar } = useMensagem();

  const carregar = useCallback(async () => {
    try {
      setAluno(await api<AlunoDetalhe>(`/alunos/${params.id}`));
    } catch (falha) {
      if (falha instanceof ApiError && (falha.status === 404 || falha.status === 400)) setNaoEncontrado(true);
      else erro(falha);
    }
  }, [params.id, erro]);

  useEffect(() => {
    void carregar();
    if (equipe) api<Turma[]>('/turmas?ativa=true').then(setTurmas).catch(() => undefined);
  }, [carregar, equipe]);

  if (naoEncontrado) {
    return (
      <div>
        <Cabecalho titulo="Aluno não encontrado" voltar={{ href: '/alunos', rotulo: 'Alunos' }} />
      </div>
    );
  }

  if (!aluno) return mensagem ? <Aviso mensagem={mensagem} /> : <Carregando />;

  const turmasDisponiveis = turmas.filter((turma) => !aluno.matriculas.some((matricula) => matricula.turmaId === turma.id));

  const matricular = async () => {
    if (!turmaSelecionada) return;
    limpar();
    try {
      await api('/matriculas', { method: 'POST', json: { alunoId: aluno.id, turmaId: turmaSelecionada } });
      setTurmaSelecionada('');
      sucesso('Aluno matriculado.');
      await carregar();
    } catch (falha) {
      erro(falha);
    }
  };

  const removerMatricula = async (matriculaId: string, nomeTurma: string) => {
    if (!window.confirm(`Remover a matrícula em "${nomeTurma}"? As notas do aluno nesta turma também serão apagadas.`)) return;
    limpar();
    try {
      await api(`/matriculas/${matriculaId}`, { method: 'DELETE' });
      sucesso('Matrícula removida.');
      await carregar();
    } catch (falha) {
      erro(falha);
    }
  };

  // Histórico final (PDF salvo na pasta) quando concluído; senão, prévia gerada na hora
  const baixarHistorico = async (matriculaId: string, final: boolean) => {
    try {
      await abrirArquivo(`/matriculas/${matriculaId}/${final ? 'historico-final' : 'historico'}`);
    } catch (falha) {
      erro(falha);
    }
  };

  const excluirAluno = async () => {
    if (!window.confirm(`Excluir definitivamente ${aluno.nome}, com todas as matrículas, notas e documentos?`)) return;
    try {
      await api(`/alunos/${aluno.id}`, { method: 'DELETE' });
      router.replace('/alunos');
    } catch (falha) {
      erro(falha);
    }
  };

  const aoSalvar = async (_salvo: Aluno) => {
    setEditando(false);
    sucesso('Dados atualizados.');
    await carregar();
  };

  const primeiroTipoFaltando = aluno.documentosObrigatorios.find((tipo) =>
    ['FALTANDO', 'REJEITADO'].includes(statusDoTipo(aluno.documentos, tipo)),
  );

  const dadosPessoais: Array<[string, string]> = [
    ['E-mail', aluno.email],
    ['Telefone', aluno.telefone ?? '-'],
    ['Data de nascimento', formatarData(aluno.dataNascimento)],
    ['Nacionalidade', aluno.nacionalidade ?? '-'],
    ['Naturalidade', aluno.naturalidade ?? '-'],
    ['Filiação', aluno.filiacao ?? '-'],
    ['RG', [aluno.rgNumero, aluno.rgOrgaoEmissor].filter(Boolean).join(' - ') || '-'],
    ['Graduação', ROTULOS_CONDICAO[aluno.condicaoGraduacao]],
    ['ID na Cademi', aluno.cademiId ?? 'Ainda não vinculado'],
    ['Cadastro', aluno.inscricaoOnline ? 'Pelo link de inscrição' : 'Pela secretaria'],
  ];

  return (
    <div className="space-y-6">
      <Cabecalho
        voltar={{ href: '/alunos', rotulo: 'Alunos' }}
        titulo={aluno.nome}
        descricao={
          <span className="flex flex-wrap items-center gap-3">
            <span>CPF {mascararCpf(aluno.cpf)}</span>
            <SemaforoBadge status={aluno.statusSemaforo} />
          </span>
        }
        acoes={
          <>
            {equipe && !editando ? (
              <button type="button" onClick={() => setEditando(true)} className="btn btn-secundario">
                <Pencil className="h-4 w-4" /> Editar
              </button>
            ) : null}
            {usuario.role === 'ADMIN' ? (
              <button type="button" onClick={() => void excluirAluno()} className="btn btn-secundario text-rose-700">
                <Trash2 className="h-4 w-4" /> Excluir
              </button>
            ) : null}
          </>
        }
      />

      <Aviso mensagem={mensagem} onFechar={limpar} />

      {aluno.pendencias.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" /> Pendências
          </p>
          <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-amber-900">
            {aluno.pendencias.map((pendencia) => (
              <li key={pendencia}>{pendencia}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {equipe ? <ListaSolicitacoes alunoId={aluno.id} mostrarAluno={false} ocultarSeVazio onAlterado={() => void carregar()} /> : null}

      <Cartao titulo="Dados pessoais">
        {editando ? (
          <AlunoForm aluno={aluno} onSalvo={(salvo) => void aoSalvar(salvo)} onCancelar={() => setEditando(false)} />
        ) : (
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {dadosPessoais.map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt className="text-xs text-slate-500">{rotulo}</dt>
                <dd className="mt-0.5 break-words text-sm font-medium text-slate-900">{valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </Cartao>

      <Cartao
        titulo="Matrículas e notas"
        descricao={`Aprovação em cada módulo: nota ≥ ${formatarNota(aluno.regras.mediaMinima)} (0 a 100)${
          aluno.regras.frequenciaMinima > 0 ? ` e frequência ≥ ${aluno.regras.frequenciaMinima}%` : ''
        }.`}
        acoes={
          equipe && turmasDisponiveis.length ? (
            <div className="flex gap-2">
              <select value={turmaSelecionada} onChange={(evento) => setTurmaSelecionada(evento.target.value)} className="input mt-0 w-56">
                <option value="">Matricular em turma...</option>
                {turmasDisponiveis.map((turma) => (
                  <option key={turma.id} value={turma.id}>
                    {turma.nome}
                  </option>
                ))}
              </select>
              <button type="button" disabled={!turmaSelecionada} onClick={() => void matricular()} className="btn btn-primario">
                Matricular
              </button>
            </div>
          ) : null
        }
      >
        {aluno.matriculas.length === 0 ? (
          <Vazio>O aluno ainda não está matriculado em nenhuma turma.</Vazio>
        ) : (
          <div className="space-y-5">
            {aluno.matriculas.map((matricula) => (
              <div key={matricula.id} className="rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
                  <div>
                    <Link href={`/turmas/${matricula.turma.id}`} className="link">
                      {matricula.turma.nome}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {formatarData(matricula.turma.dataInicio)} a {formatarData(matricula.turma.dataFim)} · matriculado em{' '}
                      {formatarData(matricula.dataInclusao)}
                    </p>
                    {matricula.historicoGeradoEm ? (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        Todos os módulos concluídos · histórico final salvo na pasta do aluno em{' '}
                        {formatarDataHora(matricula.historicoGeradoEm)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Link href={`/notas?turmaId=${matricula.turmaId}&alunoId=${aluno.id}`} className="btn btn-secundario btn-sm">
                      Lançar notas
                    </Link>
                    <button
                      type="button"
                      onClick={() => void baixarHistorico(matricula.id, Boolean(matricula.historicoGeradoEm))}
                      className="btn btn-secundario btn-sm"
                    >
                      <FileDown className="h-3.5 w-3.5" /> {matricula.historicoGeradoEm ? 'Histórico final' : 'Prévia do histórico'}
                    </button>
                    {matricula.historicoLink ? (
                      <a href={matricula.historicoLink} target="_blank" rel="noreferrer" className="btn btn-secundario btn-sm">
                        <ExternalLink className="h-3.5 w-3.5" /> Drive
                      </a>
                    ) : null}
                    {equipe ? (
                      <button
                        type="button"
                        onClick={() => void removerMatricula(matricula.id, matricula.turma.nome)}
                        className="btn btn-fantasma btn-sm text-rose-600"
                        title="Remover matrícula"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>

                {matricula.turma.disciplinas.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">Esta turma ainda não tem módulos cadastrados.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="tabela">
                      <thead>
                        <tr>
                          <th>Módulo</th>
                          <th className="text-center">CH</th>
                          <th className="text-center">Nota</th>
                          <th className="text-center">Frequência</th>
                          <th className="text-center">Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matricula.turma.disciplinas.map((disciplina) => {
                          const nota = aluno.notas.find((item) => item.disciplinaId === disciplina.id);
                          return (
                            <tr key={disciplina.id}>
                              <td>
                                <span className="text-slate-400">{disciplina.ordem}.</span> {disciplina.nome}
                              </td>
                              <td className="text-center text-slate-600">{disciplina.cargaHoraria}h</td>
                              <td className="text-center">{formatarNota(nota?.media)}</td>
                              <td className="text-center">{nota?.frequencia != null ? `${formatarNumero(nota.frequencia, 0)}%` : '-'}</td>
                              <td className="text-center">
                                <SituacaoTexto situacao={situacaoDisciplina(nota, aluno.regras)} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Cartao>

      {equipe && aluno.notificacoes.length ? (
        <Cartao titulo="Avisos enviados ao aluno" descricao="Últimos e-mails automáticos (sem SMTP configurado, ficam só registrados aqui).">
          <ul className="divide-y divide-slate-100 text-sm">
            {aluno.notificacoes.map((notificacao) => (
              <li key={notificacao.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-slate-800">{notificacao.assunto}</span>
                <span className="text-xs text-slate-500">
                  {formatarDataHora(notificacao.criadoEm)} ·{' '}
                  {notificacao.erro ? (
                    <span className="text-rose-700">falhou: {notificacao.erro}</span>
                  ) : notificacao.enviado ? (
                    <span className="text-emerald-700">enviado para {notificacao.para}</span>
                  ) : (
                    'registrado (e-mail não configurado)'
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
      ) : null}

      {equipe ? (
        <PastaDrive
          alunoId={aluno.id}
          driveConfigurado={aluno.driveConfigurado}
          driveFolderId={aluno.driveFolderId}
          driveExportadoEm={aluno.driveExportadoEm}
          onExportado={() => void carregar()}
        />
      ) : null}

      {equipe ? (
        <LinkAcessoAluno
          alunoId={aluno.id}
          email={aluno.email}
          acessoExpiraEm={aluno.acessoExpiraEm}
          onGerado={() => void carregar()}
        />
      ) : null}

      {equipe ? (
        <Cartao titulo="Documentação" descricao={`Documentos exigidos para: ${ROTULOS_CONDICAO[aluno.condicaoGraduacao].toLowerCase()}.`}>
          <div className="mb-5">
            <ChecklistDocumentos obrigatorios={aluno.documentosObrigatorios} documentos={aluno.documentos} />
          </div>

          <UploadDocumento key={primeiroTipoFaltando ?? 'OUTRO'} alunoId={aluno.id} tipoInicial={primeiroTipoFaltando ?? 'OUTRO'} onEnviado={() => void carregar()} />

          <div className="mt-5">
            <ListaDocumentos documentos={aluno.documentos} onAlterado={() => void carregar()} />
          </div>
        </Cartao>
      ) : null}
    </div>
  );
}
