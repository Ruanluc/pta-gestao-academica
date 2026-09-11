'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { api } from '../lib/api';
import { mascararCpf, paraInputData } from '../lib/formato';
import { ROTULOS_CONDICAO, type Aluno, type CondicaoGraduacao } from '../lib/tipos';
import { Aviso, Campo, useMensagem } from './ui';

export type FormAluno = {
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  dataNascimento: string;
  nacionalidade: string;
  naturalidade: string;
  filiacao: string;
  rgNumero: string;
  rgOrgaoEmissor: string;
  condicaoGraduacao: CondicaoGraduacao;
  cademiId: string;
  enderecoRua: string;
  enderecoNumero: string;
  enderecoComplemento: string;
  enderecoBairro: string;
  enderecoCep: string;
  enderecoCidade: string;
  enderecoEstado: string;
  /** '' = não informado */
  grupoWhatsapp: '' | 'true' | 'false';
  ganhouCamiseta: '' | 'true' | 'false';
};

const CAMPOS_ENDERECO: Array<{ nome: keyof FormAluno; rotulo: string; classe?: string }> = [
  { nome: 'enderecoRua', rotulo: 'Rua', classe: 'md:col-span-2' },
  { nome: 'enderecoNumero', rotulo: 'Número' },
  { nome: 'enderecoComplemento', rotulo: 'Complemento' },
  { nome: 'enderecoBairro', rotulo: 'Bairro' },
  { nome: 'enderecoCep', rotulo: 'CEP' },
  { nome: 'enderecoCidade', rotulo: 'Cidade' },
  { nome: 'enderecoEstado', rotulo: 'Estado (UF)' },
];

const simNaoForm = (valor: boolean | null | undefined): FormAluno['grupoWhatsapp'] => (valor === null || valor === undefined ? '' : valor ? 'true' : 'false');

const FORM_VAZIO: FormAluno = {
  nome: '',
  cpf: '',
  email: '',
  telefone: '',
  dataNascimento: '',
  nacionalidade: 'Brasileira',
  naturalidade: '',
  filiacao: '',
  rgNumero: '',
  rgOrgaoEmissor: '',
  condicaoGraduacao: 'CURSANDO',
  cademiId: '',
  enderecoRua: '',
  enderecoNumero: '',
  enderecoComplemento: '',
  enderecoBairro: '',
  enderecoCep: '',
  enderecoCidade: '',
  enderecoEstado: '',
  grupoWhatsapp: '',
  ganhouCamiseta: '',
};

const paraForm = (aluno: Aluno): FormAluno => ({
  nome: aluno.nome,
  cpf: mascararCpf(aluno.cpf),
  email: aluno.email,
  telefone: aluno.telefone ?? '',
  dataNascimento: paraInputData(aluno.dataNascimento),
  nacionalidade: aluno.nacionalidade ?? '',
  naturalidade: aluno.naturalidade ?? '',
  filiacao: aluno.filiacao ?? '',
  rgNumero: aluno.rgNumero ?? '',
  rgOrgaoEmissor: aluno.rgOrgaoEmissor ?? '',
  condicaoGraduacao: aluno.condicaoGraduacao,
  cademiId: aluno.cademiId ?? '',
  enderecoRua: aluno.enderecoRua ?? '',
  enderecoNumero: aluno.enderecoNumero ?? '',
  enderecoComplemento: aluno.enderecoComplemento ?? '',
  enderecoBairro: aluno.enderecoBairro ?? '',
  enderecoCep: aluno.enderecoCep ?? '',
  enderecoCidade: aluno.enderecoCidade ?? '',
  enderecoEstado: aluno.enderecoEstado ?? '',
  grupoWhatsapp: simNaoForm(aluno.grupoWhatsapp),
  ganhouCamiseta: simNaoForm(aluno.ganhouCamiseta),
});

export function AlunoForm({
  aluno,
  onSalvo,
  onCancelar,
  enviar: enviarPersonalizado,
  textoBotao,
  camposInternos = true,
  exigirDadosHistorico = false,
}: {
  aluno?: Aluno;
  onSalvo?: (aluno: Aluno) => void;
  onCancelar?: () => void;
  /** Substitui o envio padrão (usado na inscrição pública) */
  enviar?: (dados: FormAluno) => Promise<void>;
  textoBotao?: string;
  /** Mostra campos de uso da equipe (ID na Cademi) */
  camposInternos?: boolean;
  /** Torna obrigatórios os dados que aparecem no histórico (inscrição online) */
  exigirDadosHistorico?: boolean;
}) {
  const [form, setForm] = useState<FormAluno>(() => (aluno ? paraForm(aluno) : FORM_VAZIO));
  const [salvando, setSalvando] = useState(false);
  const { mensagem, erro, limpar } = useMensagem();

  const alterar = (evento: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = evento.target;
    setForm((atual) => ({ ...atual, [name]: name === 'cpf' ? mascararCpf(value) : value }));
  };

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    limpar();

    try {
      if (enviarPersonalizado) {
        await enviarPersonalizado(form);
        return;
      }
      const salvo = await api<Aluno>(aluno ? `/alunos/${aluno.id}` : '/alunos', {
        method: aluno ? 'PUT' : 'POST',
        json: form,
      });
      if (!aluno) setForm(FORM_VAZIO);
      onSalvo?.(salvo);
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
        <Campo rotulo="Nome completo *" className="md:col-span-2">
          <input name="nome" value={form.nome} onChange={alterar} required minLength={3} className="input" />
        </Campo>
        <Campo rotulo="CPF *">
          <input name="cpf" value={form.cpf} onChange={alterar} required inputMode="numeric" placeholder="000.000.000-00" className="input" />
        </Campo>
        <Campo rotulo="E-mail *">
          <input type="email" name="email" value={form.email} onChange={alterar} required className="input" />
        </Campo>
        <Campo rotulo="Telefone">
          <input name="telefone" value={form.telefone} onChange={alterar} className="input" />
        </Campo>
        <Campo rotulo="Data de nascimento">
          <input type="date" name="dataNascimento" value={form.dataNascimento} onChange={alterar} required={exigirDadosHistorico} className="input" />
        </Campo>
        <Campo rotulo="Condição na graduação *" dica="Define quais documentos são exigidos do aluno.">
          <select name="condicaoGraduacao" value={form.condicaoGraduacao} onChange={alterar} className="input">
            {Object.entries(ROTULOS_CONDICAO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Nacionalidade">
          <input name="nacionalidade" value={form.nacionalidade} onChange={alterar} required={exigirDadosHistorico} className="input" />
        </Campo>
        <Campo rotulo="Naturalidade">
          <input name="naturalidade" value={form.naturalidade} onChange={alterar} placeholder="Cidade - UF" required={exigirDadosHistorico} className="input" />
        </Campo>
        <Campo rotulo="Filiação">
          <input name="filiacao" value={form.filiacao} onChange={alterar} placeholder="Nome da mãe e/ou do pai" required={exigirDadosHistorico} className="input" />
        </Campo>
        <Campo rotulo="RG">
          <input name="rgNumero" value={form.rgNumero} onChange={alterar} required={exigirDadosHistorico} className="input" />
        </Campo>
        <Campo rotulo="Órgão emissor">
          <input name="rgOrgaoEmissor" value={form.rgOrgaoEmissor} onChange={alterar} placeholder="SSP/UF" required={exigirDadosHistorico} className="input" />
        </Campo>
        {camposInternos ? (
          <>
            <Campo rotulo="ID na Cademi" dica="Opcional. Se vazio, é preenchido na primeira importação de notas (pelo CPF ou e-mail).">
              <input name="cademiId" value={form.cademiId} onChange={alterar} className="input" />
            </Campo>
            <p className="pt-2 text-sm font-semibold text-slate-800 md:col-span-2">Endereço e relacionamento</p>
            {CAMPOS_ENDERECO.map((campo) => (
              <Campo key={campo.nome} rotulo={campo.rotulo} className={campo.classe}>
                <input name={campo.nome} value={form[campo.nome]} onChange={alterar} className="input" />
              </Campo>
            ))}
            <Campo rotulo="Está no grupo do WhatsApp?">
              <select name="grupoWhatsapp" value={form.grupoWhatsapp} onChange={alterar} className="input">
                <option value="">Não informado</option>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </Campo>
            <Campo rotulo="Ganhou camiseta?">
              <select name="ganhouCamiseta" value={form.ganhouCamiseta} onChange={alterar} className="input">
                <option value="">Não informado</option>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </Campo>
          </>
        ) : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="submit" disabled={salvando} className="btn btn-primario">
          {salvando ? 'Salvando...' : textoBotao ?? (aluno ? 'Salvar alterações' : 'Cadastrar aluno')}
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
