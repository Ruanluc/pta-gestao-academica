'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { api } from '../lib/api';
import { paraInputData } from '../lib/formato';
import type { Turma } from '../lib/tipos';
import { Aviso, Campo, useMensagem } from './ui';

const hoje = () => new Date().toISOString().slice(0, 10);

type FormTurma = {
  nome: string;
  curso: string;
  resolucaoMec: string;
  cargaHoraria: string;
  dataInicio: string;
  dataFim: string;
  ativa: string;
};

const formInicial = (turma?: Turma): FormTurma => ({
  nome: turma?.nome ?? '',
  curso: turma?.curso ?? '',
  resolucaoMec: turma?.resolucaoMec ?? '',
  cargaHoraria: String(turma?.cargaHoraria ?? 360),
  dataInicio: turma ? paraInputData(turma.dataInicio) : hoje(),
  dataFim: turma ? paraInputData(turma.dataFim) : hoje(),
  ativa: String(turma?.ativa ?? true),
});

export function TurmaForm({
  turma,
  onSalvo,
  onCancelar,
}: {
  turma?: Turma;
  onSalvo: (turma: Turma) => void;
  onCancelar?: () => void;
}) {
  const [form, setForm] = useState<FormTurma>(() => formInicial(turma));
  const [salvando, setSalvando] = useState(false);
  const { mensagem, erro, limpar } = useMensagem();

  const alterar = (evento: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = evento.target;
    setForm((atual) => ({ ...atual, [name]: value }));
  };

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    limpar();

    try {
      const salva = await api<Turma>(turma ? `/turmas/${turma.id}` : '/turmas', {
        method: turma ? 'PUT' : 'POST',
        json: { ...form, cargaHoraria: Number(form.cargaHoraria), ativa: form.ativa === 'true' },
      });
      if (!turma) setForm(formInicial());
      onSalvo(salva);
    } catch (falha) {
      erro(falha);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={enviar}>
      <Aviso mensagem={mensagem} onFechar={limpar} />
      <div className="grid gap-4 md:grid-cols-2">
        <Campo
          rotulo="Nome da turma *"
          className="md:col-span-2"
          dica='No histórico, sai em "Pós-Graduado no curso de:". Ex.: Biomecânica, Musculação e Reabilitação Musculoesquelética - B7'
        >
          <input name="nome" value={form.nome} onChange={alterar} required minLength={2} className="input" />
        </Campo>
        <Campo rotulo="Curso (título do histórico)" className="md:col-span-2" dica="Sai em “HISTÓRICO ESCOLAR DO CURSO DE ESPECIALIZAÇÃO EM:”. Vazio = usa o nome da turma.">
          <input name="curso" value={form.curso} onChange={alterar} placeholder="Ex.: Biomecânica, Musculação e Reabilitação Musculoesquelética" className="input" />
        </Campo>
        <Campo rotulo="Resolução" className="md:col-span-2" dica="Sai em “(Nas disposições da ...)”. Vazio = resolução CES/CNE nº 1, de 06 de Abril de 2018.">
          <input name="resolucaoMec" value={form.resolucaoMec} onChange={alterar} placeholder="resolução CES/CNE nº 1, de 06 de Abril de 2018" className="input" />
        </Campo>
        <Campo rotulo="Carga horária total (h) *">
          <input type="number" min={1} name="cargaHoraria" value={form.cargaHoraria} onChange={alterar} required className="input" />
        </Campo>
        <Campo rotulo="Data de início *">
          <input type="date" name="dataInicio" value={form.dataInicio} onChange={alterar} required className="input" />
        </Campo>
        <Campo rotulo="Data de fim *">
          <input type="date" name="dataFim" value={form.dataFim} onChange={alterar} required className="input" />
        </Campo>
        <Campo rotulo="Situação">
          <select name="ativa" value={form.ativa} onChange={alterar} className="input">
            <option value="true">Ativa</option>
            <option value="false">Encerrada / inativa</option>
          </select>
        </Campo>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="submit" disabled={salvando} className="btn btn-primario">
          {salvando ? 'Salvando...' : turma ? 'Salvar alterações' : 'Cadastrar turma'}
        </button>
        {onCancelar ? (
          <button type="button" onClick={onCancelar} className="btn btn-secundario">
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}
