'use client';

import { useEffect, useState } from 'react';
import { X, Plus, Folder, FolderOpen, Search, FileText } from 'lucide-react';
import { apiFetch } from '../lib/auth';

const STORAGE_KEY_TURMAS = 'pta-turmas';
const STORAGE_KEY_ALUNOS = 'pta-alunos';
const STORAGE_KEY_MATRICULAS = 'pta-matriculas';
const STORAGE_KEY_MODULOS = 'pta-modulos';

const today = new Date().toISOString().slice(0, 10);

export default function TurmasPage() {
  const [turmas, setTurmas] = useState<any[]>([]);
  const [alunos, setAlunos] = useState<any[]>([]);
  const [matriculas, setMatriculas] = useState<any[]>([]);
  const [modulos, setModulos] = useState<any[]>([]);
  const [selectedTurmaId, setSelectedTurmaId] = useState<string | null>(null);
  const [selectedAlunoId, setSelectedAlunoId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showAlunoSelector, setShowAlunoSelector] = useState<string | null>(null);
  const [showModuloForm, setShowModuloForm] = useState<string | null>(null);
  const [moduloForm, setModuloForm] = useState({ nome: '' });
  const [form, setForm] = useState({
    nome: '',
    resolucionMec: '',
    cargaHoraria: '360',
    dataInicio: today,
    dataFim: today,
    ativa: 'true',
  });

  const saveTurmas = (nextTurmas: any[]) => {
    setTurmas(nextTurmas);
    localStorage.setItem(STORAGE_KEY_TURMAS, JSON.stringify(nextTurmas));

    if (!nextTurmas.some((turma) => turma.id === selectedTurmaId)) {
      setSelectedTurmaId(nextTurmas[0]?.id ?? null);
    }
  };

  const saveMatriculas = (nextMatriculas: any[]) => {
    setMatriculas(nextMatriculas);
    localStorage.setItem(STORAGE_KEY_MATRICULAS, JSON.stringify(nextMatriculas));
  };

  const saveModulos = (nextModulos: any[]) => {
    setModulos(nextModulos);
    localStorage.setItem(STORAGE_KEY_MODULOS, JSON.stringify(nextModulos));
  };

  const loadData = async () => {
    // Carrega turmas
    try {
      const res = await apiFetch('/turmas');
      if (res.ok) {
        const data = await res.json();
        const nextTurmas = Array.isArray(data) ? data : [];
        saveTurmas(nextTurmas);
      }
    } catch {
      const saved = localStorage.getItem(STORAGE_KEY_TURMAS);
      if (saved) {
        try {
          saveTurmas(JSON.parse(saved));
        } catch {
          saveTurmas([]);
        }
      } else {
        saveTurmas([]);
      }
    }

    // Carrega alunos
    try {
      const res = await apiFetch('/alunos');
      if (res.ok) {
        const data = await res.json();
        const nextAlunos = Array.isArray(data) ? data : [];
        setAlunos(nextAlunos);
        localStorage.setItem(STORAGE_KEY_ALUNOS, JSON.stringify(nextAlunos));
      }
    } catch {
      const saved = localStorage.getItem(STORAGE_KEY_ALUNOS);
      if (saved) {
        try {
          setAlunos(JSON.parse(saved));
        } catch {
          setAlunos([]);
        }
      }
    }

    // Carrega matriculas (relação turma-aluno)
    try {
      const res = await apiFetch('/matriculas');
      if (res.ok) {
        const data = await res.json();
        const nextMatriculas = Array.isArray(data) ? data : [];
        setMatriculas(nextMatriculas);
        localStorage.setItem(STORAGE_KEY_MATRICULAS, JSON.stringify(nextMatriculas));
      }
    } catch {
      const savedMatriculas = localStorage.getItem(STORAGE_KEY_MATRICULAS);
      if (savedMatriculas) {
        try {
          setMatriculas(JSON.parse(savedMatriculas));
        } catch {
          setMatriculas([]);
        }
      }
    }

    // Carrega módulos
    const savedModulos = localStorage.getItem(STORAGE_KEY_MODULOS);
    if (savedModulos) {
      try {
        setModulos(JSON.parse(savedModulos));
      } catch {
        setModulos([]);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedTurmaId) {
      setSelectedAlunoId(null);
      return;
    }

    const turmaAlunos = getAlunosDaTurma(selectedTurmaId);
    if (turmaAlunos.length === 0) {
      setSelectedAlunoId(null);
      return;
    }

    if (!turmaAlunos.some((aluno) => aluno.id === selectedAlunoId)) {
      setSelectedAlunoId(turmaAlunos[0].id);
    }
  }, [selectedTurmaId, matriculas, alunos]);

  const getAlunosDaTurma = (turmaId: string) => {
    return matriculas
      .filter((m) => m.turmaId === turmaId)
      .map((m) => ({
        ...alunos.find((a) => a.id === m.alunoId),
        semaforo: m.semaforo,
      }))
      .filter(Boolean);
  };

  const getAlunosDisponiveis = (turmaId: string) => {
    const alunosNaTurma = getAlunosDaTurma(turmaId).map((a) => a.id);
    return alunos.filter((a) => !alunosNaTurma.includes(a.id));
  };

  const adicionarAlunoAturma = (turmaId: string, alunoId: string) => {
    const novaMatricula = {
      id: `matricula-${Date.now()}`,
      turmaId,
      alunoId,
      dataCadastro: new Date().toISOString(),
    };
    saveMatriculas([novaMatricula, ...matriculas]);
    setShowAlunoSelector(null);
  };

  const removerAlunoDaTurma = (turmaId: string, alunoId: string) => {
    const nextMatriculas = matriculas.filter(
      m => !(m.turmaId === turmaId && m.alunoId === alunoId)
    );
    saveMatriculas(nextMatriculas);
  };

  const getModulosDaTurma = (turmaId: string) => {
    return modulos
      .filter(m => m.turmaId === turmaId)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  };

  const adicionarModuloAturma = (turmaId: string, nomeModulo: string) => {
    if (!nomeModulo.trim()) {
      setMessage('✗ Nome do módulo não pode estar vazio.');
      return;
    }

    const novoModulo = {
      id: `modulo-${Date.now()}`,
      turmaId,
      nome: nomeModulo,
      ordem: getModulosDaTurma(turmaId).length + 1,
      dataCadastro: new Date().toISOString(),
    };

    saveModulos([novoModulo, ...modulos]);
    setModuloForm({ nome: '' });
    setShowModuloForm(null);
    setMessage('✓ Módulo adicionado com sucesso.');
  };

  const removerModuloDaTurma = (moduloId: string) => {
    const nextModulos = modulos.filter(m => m.id !== moduloId);
    saveModulos(nextModulos);
  };

  const handleChange = (event: any) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: any) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const payload = {
        ...form,
        cargaHoraria: Number(form.cargaHoraria),
        ativa: form.ativa === 'true',
      };

      const res = await apiFetch('/turmas', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok && res.status !== 201) {
        const errorText = await res.text();
        throw new Error(`Erro ${res.status}: ${errorText || 'Não foi possível cadastrar'}`);
      }

      const created = await res.json();
      const novaTurma = created || {
        id: `turma-${Date.now()}`,
        ...payload,
      };

      const nextTurmas = [novaTurma, ...turmas];
      saveTurmas(nextTurmas);
      setSelectedTurmaId(novaTurma.id);

      setMessage('✓ Turma cadastrada com sucesso.');
      setForm({
        nome: '',
        resolucionMec: '',
        cargaHoraria: '360',
        dataInicio: today,
        dataFim: today,
        ativa: 'true',
      });
    } catch (error: any) {
      console.error('Erro ao cadastrar turma:', error);
      setMessage(`✗ ${error.message || 'Erro ao cadastrar turma.'}`);
    } finally {
      setLoading(false);
    }
  };

  const selectedTurma = turmas.find((turma) => turma.id === selectedTurmaId) ?? null;
  const alunosDaTurma = selectedTurmaId ? getAlunosDaTurma(selectedTurmaId) : [];
  const alunosDisponiveis = selectedTurmaId ? getAlunosDisponiveis(selectedTurmaId) : [];
  const alunoSelecionado = alunosDaTurma.find((aluno) => aluno.id === selectedAlunoId) ?? null;
  const modulosDaTurma = selectedTurmaId ? getModulosDaTurma(selectedTurmaId) : [];
  const badgeClass = (semaforo: string) => {
    if (semaforo === 'vermelho') return 'bg-rose-100 text-rose-700';
    if (semaforo === 'amarelo') return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  const alunosFiltrados = alunosDaTurma.filter((aluno) => {
    const query = searchTerm.toLowerCase();
    if (!query) return true;

    return [aluno.nome, aluno.cpf, aluno.email]
      .filter(Boolean)
      .some((value: string) => value.toLowerCase().includes(query));
  });

  const handleSelectTurma = (turmaId: string) => {
    setSelectedTurmaId(turmaId);
    setSelectedAlunoId(null);
    setSearchTerm('');
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">Turmas</h1>
          <p className="mt-2 text-slate-600">Cada turma agora funciona como uma pasta separada. Ao clicar em uma pasta, você vê os alunos que pertencem a ela.</p>

          <form onSubmit={handleSubmit} className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="mb-4 text-lg font-semibold">Cadastrar Nova Turma</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Nome da turma
                <input name="nome" value={form.nome} onChange={handleChange} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Resolução MEC
                <input name="resolucionMec" value={form.resolucionMec} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Carga horária
                <input type="number" name="cargaHoraria" value={form.cargaHoraria} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Status
                <select name="ativa" value={form.ativa} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="true">Ativa</option>
                  <option value="false">Inativa</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Data de início
                <input type="date" name="dataInicio" value={form.dataInicio} onChange={handleChange} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Data de fim
                <input type="date" name="dataFim" value={form.dataFim} onChange={handleChange} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button type="submit" disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-70">
                {loading ? 'Cadastrando...' : 'Cadastrar turma'}
              </button>
              {message ? <span className="text-sm">{message}</span> : null}
            </div>
          </form>

          <div className="mt-6 grid gap-6 lg:grid-cols-[280px,1fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Pastas de turma</h2>
                <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700">{turmas.length}</span>
              </div>

              {turmas.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">Ainda não existe nenhuma pasta de turma.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {turmas.map((turma) => (
                    <button
                      key={turma.id}
                      onClick={() => handleSelectTurma(turma.id)}
                      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                        selectedTurmaId === turma.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-slate-200 bg-white hover:border-indigo-300'
                      }`}
                    >
                      <Folder className="mt-0.5 h-5 w-5 text-indigo-600" />
                      <div>
                        <p className="font-medium text-slate-900">{turma.nome}</p>
                        <p className="text-xs text-slate-600">{turma.ativa ? 'Ativa' : 'Inativa'} • {turma.cargaHoraria}h</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              {selectedTurma ? (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">{selectedTurma.nome}</h2>
                      <p className="mt-1 text-sm text-slate-600">Cada aluno agora vira uma pasta dentro desta turma para guardar documentos.</p>
                    </div>
                    {alunosDisponiveis.length > 0 && (
                      <button
                        onClick={() => setShowAlunoSelector(showAlunoSelector === selectedTurmaId ? null : selectedTurmaId)}
                        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                      >
                        <Plus size={16} /> Adicionar Aluno
                      </button>
                    )}
                  </div>

                  <div className="mt-6 rounded-xl border border-slate-300 bg-white p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">Módulos</p>
                        <p className="mt-1 text-sm text-slate-600">Adicione os módulos desta turma/pós. A ordem pode variar conforme a pós.</p>
                      </div>
                      <button
                        onClick={() => setShowModuloForm(showModuloForm === selectedTurmaId ? null : selectedTurmaId)}
                        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                      >
                        <Plus size={16} /> Adicionar Módulo
                      </button>
                    </div>

                    {showModuloForm === selectedTurmaId && (
                      <div className="mt-4 flex gap-2">
                        <input
                          value={moduloForm.nome}
                          onChange={(e) => setModuloForm({ nome: e.target.value })}
                          placeholder="Nome do módulo (ex: Módulo I - Fundamentos)"
                          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              adicionarModuloAturma(selectedTurmaId!, moduloForm.nome);
                            }
                          }}
                        />
                        <button
                          onClick={() => adicionarModuloAturma(selectedTurmaId!, moduloForm.nome)}
                          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                        >
                          Confirmar
                        </button>
                      </div>
                    )}

                    {modulosDaTurma.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-500">Nenhum módulo adicionado ainda.</p>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {modulosDaTurma.map((modulo, index) => (
                          <div key={modulo.id} className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 p-3">
                            <div className="flex items-center gap-3">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                                {index + 1}
                              </span>
                              <p className="text-sm font-medium text-slate-900">{modulo.nome}</p>
                            </div>
                            <button
                              onClick={() => removerModuloDaTurma(modulo.id)}
                              className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                    <Search size={16} className="text-slate-500" />
                    <input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Pesquisar aluno por nome, CPF ou e-mail"
                      className="w-full border-0 bg-transparent text-sm outline-none"
                    />
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Carga horária</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">{selectedTurma.cargaHoraria}h</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">Período</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {new Date(selectedTurma.dataInicio).toLocaleDateString('pt-BR')} - {new Date(selectedTurma.dataFim).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  {showAlunoSelector === selectedTurmaId && alunosDisponiveis.length > 0 && (
                    <div className="mt-6 rounded-lg border border-slate-300 bg-white p-4">
                      <p className="mb-3 text-sm font-medium text-slate-700">Selecione um aluno para colocar nesta pasta:</p>
                      <div className="grid gap-2 md:grid-cols-2">
                        {alunosDisponiveis.map((aluno) => (
                          <button
                            key={aluno.id}
                            onClick={() => adicionarAlunoAturma(selectedTurmaId!, aluno.id)}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-left text-sm transition-colors hover:bg-indigo-50"
                          >
                            <p className="font-medium text-slate-900">{aluno.nome}</p>
                            <p className="text-xs text-slate-600">{aluno.cpf}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-6">
                    <h3 className="text-lg font-semibold">Alunos dentro da pasta</h3>
                    {alunosDaTurma.length === 0 ? (
                      <p className="mt-3 text-slate-500">Nenhum aluno nesta pasta ainda.</p>
                    ) : (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {alunosFiltrados.map((aluno) => (
                          <button
                            key={aluno.id}
                            onClick={() => setSelectedAlunoId(aluno.id)}
                            className={`rounded-xl border p-4 text-left transition-colors ${
                              alunoSelecionado?.id === aluno.id
                                ? 'border-indigo-500 bg-indigo-50'
                                : 'border-slate-300 bg-white hover:border-indigo-300'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-3">
                                <FolderOpen className="mt-0.5 h-5 w-5 text-indigo-600" />
                                <div>
                                  <p className="font-medium text-slate-900">{aluno.nome}</p>
                                  <p className="text-sm text-slate-600">{aluno.cpf}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`rounded-full px-2 py-1 text-xs font-medium ${badgeClass(aluno.semaforo || 'verde')}`}>
                                  {aluno.semaforo || 'verde'}
                                </span>
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removerAlunoDaTurma(selectedTurmaId!, aluno.id);
                                  }}
                                  className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50"
                                >
                                  <X size={18} />
                                </button>
                              </div>
                            </div>
                            <p className="mt-3 text-xs text-slate-500">{aluno.email || 'E-mail não informado'}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 rounded-xl border border-slate-300 bg-white p-4">
                    {alunoSelecionado ? (
                      <>
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-indigo-600" />
                          <div>
                            <p className="font-semibold text-slate-900">Pasta do aluno: {alunoSelecionado.nome}</p>
                            <p className="text-sm text-slate-600">Aqui você pode organizar documentos do aluno, como RG, CPF, histórico e comprovantes.</p>
                          </div>
                        </div>
                        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                          <p className="font-medium text-slate-700">Documentos</p>
                          <p className="mt-2">Nenhum documento adicionado ainda.</p>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-slate-500">Selecione um aluno para abrir sua pasta de documentos.</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex h-full min-h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-center text-slate-500">
                  <p>Selecione uma pasta da turma para ver os alunos.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
