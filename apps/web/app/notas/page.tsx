'use client';

import { useEffect, useState } from 'react';
import { Search, Plus, X } from 'lucide-react';

const STORAGE_KEY_TURMAS = 'pta-turmas';
const STORAGE_KEY_ALUNOS = 'pta-alunos';
const STORAGE_KEY_MATRICULAS = 'pta-matriculas';
const STORAGE_KEY_MODULOS = 'pta-modulos';
const STORAGE_KEY_NOTAS = 'pta-notas';

export default function NotasPage() {
  const [turmas, setTurmas] = useState<any[]>([]);
  const [alunos, setAlunos] = useState<any[]>([]);
  const [matriculas, setMatriculas] = useState<any[]>([]);
  const [modulos, setModulos] = useState<any[]>([]);
  const [notas, setNotas] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAluno, setSelectedAluno] = useState<any>(null);
  const [selectedTurma, setSelectedTurma] = useState<any>(null);
  const [alunosEncontrados, setAlunosEncontrados] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  const loadData = async () => {
    const savedTurmas = localStorage.getItem(STORAGE_KEY_TURMAS);
    const savedAlunos = localStorage.getItem(STORAGE_KEY_ALUNOS);
    const savedMatriculas = localStorage.getItem(STORAGE_KEY_MATRICULAS);
    const savedModulos = localStorage.getItem(STORAGE_KEY_MODULOS);
    const savedNotas = localStorage.getItem(STORAGE_KEY_NOTAS);

    if (savedTurmas) setTurmas(JSON.parse(savedTurmas));
    if (savedAlunos) setAlunos(JSON.parse(savedAlunos));
    if (savedMatriculas) setMatriculas(JSON.parse(savedMatriculas));
    if (savedModulos) setModulos(JSON.parse(savedModulos));
    if (savedNotas) setNotas(JSON.parse(savedNotas));
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveNotas = (nextNotas: any[]) => {
    setNotas(nextNotas);
    localStorage.setItem(STORAGE_KEY_NOTAS, JSON.stringify(nextNotas));
  };

  const handleBuscarAluno = () => {
    if (!searchTerm.trim()) {
      setAlunosEncontrados([]);
      setMessage('');
      return;
    }

    const query = searchTerm.toLowerCase();
    const encontrados = alunos.filter(
      (aluno) =>
        aluno.nome.toLowerCase().includes(query) ||
        aluno.cpf.includes(query) ||
        (aluno.email && aluno.email.toLowerCase().includes(query))
    );

    if (encontrados.length === 0) {
      setMessage(`✗ Nenhum aluno encontrado com "${searchTerm}"`);
      setAlunosEncontrados([]);
    } else {
      setMessage('');
      setAlunosEncontrados(encontrados);
    }
  };

  const handleSelecionarAluno = (aluno: any) => {
    const turmaDoAluno = matriculas.find((m) => m.alunoId === aluno.id);
    if (!turmaDoAluno) {
      setMessage('✗ Este aluno não está vinculado a nenhuma turma.');
      return;
    }

    const turma = turmas.find((t) => t.id === turmaDoAluno.turmaId);
    setSelectedAluno(aluno);
    setSelectedTurma(turma);
    setAlunosEncontrados([]);
    setSearchTerm('');
    setMessage('');
  };

  const modulosDaTurma = selectedTurma
    ? modulos
        .filter((m) => m.turmaId === selectedTurma.id)
        .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
    : [];

  const notasDoAluno = selectedAluno
    ? notas.filter((n) => n.alunoId === selectedAluno.id)
    : [];

  const adicionarNota = (moduloId: string, disciplina: string) => {
    const novaNota = {
      id: `nota-${Date.now()}`,
      alunoId: selectedAluno.id,
      moduloId,
      disciplina,
      nota: 0,
      presenca: 100,
      dataCadastro: new Date().toISOString(),
    };

    saveNotas([novaNota, ...notas]);
    setMessage('✓ Nota adicionada com sucesso.');
  };

  const atualizarNota = (notaId: string, campo: string, valor: any) => {
    const nextNotas = notas.map((n) => (n.id === notaId ? { ...n, [campo]: valor } : n));
    saveNotas(nextNotas);
  };

  const removerNota = (notaId: string) => {
    const nextNotas = notas.filter((n) => n.id !== notaId);
    saveNotas(nextNotas);
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">Notas</h1>
          <p className="mt-2 text-slate-600">
            Procure um aluno por nome ou CPF e insira suas notas de cada módulo. Os dados conversam com a turma para trazer os módulos corretos.
          </p>

          <div className="mt-6 flex gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                <Search size={16} className="text-slate-500" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar aluno por nome, CPF ou e-mail"
                  className="w-full border-0 bg-transparent text-sm outline-none"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleBuscarAluno();
                    }
                  }}
                />
              </div>
              {alunosEncontrados.length > 0 && (
                <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-300 bg-white">
                  {alunosEncontrados.map((aluno) => (
                    <button
                      key={aluno.id}
                      onClick={() => handleSelecionarAluno(aluno)}
                      className="w-full border-b border-slate-200 px-4 py-3 text-left hover:bg-indigo-50 last:border-b-0"
                    >
                      <p className="font-medium text-slate-900">{aluno.nome}</p>
                      <p className="text-sm text-slate-600">{aluno.cpf}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleBuscarAluno}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Buscar
            </button>
          </div>

          {message && <p className="mt-4 text-sm">{message}</p>}

          {selectedAluno && selectedTurma ? (
            <>
              <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedAluno.nome}</h2>
                    <div className="mt-3 grid gap-4 md:grid-cols-3">
                      <div>
                        <p className="text-xs text-slate-600">CPF</p>
                        <p className="text-sm font-medium text-slate-900">{selectedAluno.cpf}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">Turma</p>
                        <p className="text-sm font-medium text-slate-900">{selectedTurma.nome}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">E-mail</p>
                        <p className="text-sm font-medium text-slate-900">{selectedAluno.email || 'Não informado'}</p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedAluno(null);
                      setSelectedTurma(null);
                    }}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="mt-8 overflow-x-auto rounded-xl border border-slate-300">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-4 py-3">Módulo</th>
                      <th className="px-4 py-3">Disciplina</th>
                      <th className="px-4 py-3">Carga Horária</th>
                      <th className="px-4 py-3">Professor</th>
                      <th className="px-4 py-3">Nota</th>
                      <th className="px-4 py-3">Presença (%)</th>
                      <th className="px-4 py-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modulosDaTurma.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                          Nenhum módulo cadastrado nesta turma.
                        </td>
                      </tr>
                    ) : (
                      modulosDaTurma.map((modulo, index) => (
                        <tr key={modulo.id} className="border-t hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                              {index + 1}
                            </span>
                            <p className="mt-1 text-sm font-medium text-slate-900">{modulo.nome}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">—</td>
                          <td className="px-4 py-3 text-slate-600">—</td>
                          <td className="px-4 py-3 text-slate-600">—</td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              max="10"
                              placeholder="0.0"
                              className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              placeholder="100"
                              className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <button className="rounded px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50">
                              <Plus size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="mt-8 flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-center text-slate-500">
              <p>Busque e selecione um aluno para ver seus módulos e inserir notas.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
