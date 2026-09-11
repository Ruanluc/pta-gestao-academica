'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, ExternalLink, FileDown, FolderSync, Mail, Plus, Send, Trash2, Upload } from 'lucide-react';
import { abrirArquivo, api, ApiError, apiUpload, baixarArquivo } from '../../lib/api';
import { formatarData, formatarDataHora, mascararCpf } from '../../lib/formato';
import type { ItemLote, LoteDetalhe } from '../../lib/tipos';
import { useUsuario } from '../../components/AppShell';
import { PrazoLote, SeletorAptos, StatusLoteBadge } from '../../components/Lotes';
import { Aviso, Cabecalho, Carregando, Cartao, useMensagem, Vazio } from '../../components/ui';

const hoje = () => new Date().toISOString().slice(0, 10);

type ResultadoPasta = { pastaLink: string; alunosNovos: number; falhas: Array<{ item: string; erro: string }>; compartilhadoCom: string[] };
type ResultadoEnvio = { pasta: ResultadoPasta | { erro: string } | null };

const resumoPasta = (pasta: ResultadoPasta) =>
  `Pasta do lote no Drive atualizada (${pasta.alunosNovos} aluno(s) adicionados${
    pasta.compartilhadoCom.length ? `, compartilhada com ${pasta.compartilhadoCom.join(', ')}` : ''
  }).${pasta.falhas.length ? ` Falhas: ${pasta.falhas.map((falha) => `${falha.item} (${falha.erro})`).join('; ')}.` : ''}`;

type ResultadoAnexo = { enviadoAoAluno: boolean; emailConfigurado: boolean };

/**
 * Certificado digital de um aluno do lote: registrar a emissão, anexar o PDF (vai para a pasta do aluno e
 * segue por e-mail para ele) e acompanhar a entrega.
 */
function RegistroCertificado({
  item,
  loteId,
  podeRegistrar,
  equipe,
  emailConfigurado,
  onAlterado,
}: {
  item: ItemLote;
  loteId: string;
  podeRegistrar: boolean;
  equipe: boolean;
  emailConfigurado: boolean;
  onAlterado: () => void;
}) {
  const [numero, setNumero] = useState('');
  const [data, setData] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState('');
  const campoArquivo = useRef<HTMLInputElement>(null);
  const { mensagem, erro, limpar } = useMensagem();

  const executar = async (acao: () => Promise<string | void>) => {
    setSalvando(true);
    limpar();
    setAviso('');
    try {
      const texto = await acao();
      if (texto) setAviso(texto);
      onAlterado();
    } catch (falha) {
      erro(falha);
    } finally {
      setSalvando(false);
    }
  };

  const registrar = (corpo: { numero?: string; emitidoEm: string }) =>
    executar(async () => {
      await api(`/lotes/${loteId}/itens/${item.id}/certificado`, { method: 'PATCH', json: corpo });
    });

  const anexar = (arquivo: File | undefined) => {
    if (!arquivo) return;
    const dados = new FormData();
    dados.append('arquivo', arquivo);
    void executar(async () => {
      const resultado = await apiUpload<ResultadoAnexo>(`/lotes/${loteId}/itens/${item.id}/certificado-arquivo`, dados);
      if (campoArquivo.current) campoArquivo.current.value = '';
      if (resultado.enviadoAoAluno) return 'PDF anexado e enviado ao aluno por e-mail.';
      return resultado.emailConfigurado
        ? 'PDF anexado, mas o e-mail ao aluno falhou. Veja os avisos na página do aluno.'
        : 'PDF anexado. O e-mail não está configurado: entregue ao aluno e registre a entrega.';
    });
  };

  const entregar = (canal: 'email' | 'manual') => {
    if (canal === 'manual' && !window.confirm('Registrar que o certificado já foi entregue ao aluno por fora do sistema (hoje)?')) return;
    void executar(async () => {
      await api(`/lotes/${loteId}/itens/${item.id}/certificado-entrega`, { method: 'POST', json: { canal } });
      return canal === 'email' ? 'Certificado enviado por e-mail.' : 'Entrega registrada.';
    });
  };

  const baixar = async () => {
    try {
      await abrirArquivo(`/lotes/${loteId}/itens/${item.id}/certificado-arquivo`);
    } catch (falha) {
      erro(falha);
    }
  };

  const seletorArquivo = (
    <>
      <input ref={campoArquivo} type="file" accept="application/pdf" className="hidden" onChange={(evento) => anexar(evento.target.files?.[0])} />
      <button type="button" disabled={salvando} onClick={() => campoArquivo.current?.click()} className="btn btn-secundario btn-sm">
        <Upload className="h-3.5 w-3.5" /> {item.temCertificado ? 'Trocar PDF' : 'Anexar PDF'}
      </button>
    </>
  );

  const retorno = (
    <>
      {aviso ? <p className="text-xs text-emerald-700">{aviso}</p> : null}
      {mensagem ? <p className="text-xs text-rose-700">{mensagem.texto}</p> : null}
    </>
  );

  if (item.certificadoEmitidoEm) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-emerald-700">
          Emitido em {formatarData(item.certificadoEmitidoEm)}
          {item.certificadoNumero ? ` · nº ${item.certificadoNumero}` : ''}
        </p>
        <p className="text-xs text-slate-500">
          {item.certificadoEnviadoEm
            ? `Entregue ao aluno em ${formatarData(item.certificadoEnviadoEm)} (${item.certificadoCanal === 'email' ? 'e-mail do sistema' : 'registro manual'})`
            : item.temCertificado
              ? 'PDF anexado, ainda não entregue ao aluno'
              : 'Sem o PDF do certificado'}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {item.temCertificado ? (
            <button type="button" onClick={() => void baixar()} className="btn btn-secundario btn-sm">
              <FileDown className="h-3.5 w-3.5" /> PDF
            </button>
          ) : null}
          {podeRegistrar ? seletorArquivo : null}
          {equipe && item.temCertificado && emailConfigurado ? (
            <button type="button" disabled={salvando} onClick={() => entregar('email')} className="btn btn-fantasma btn-sm">
              <Mail className="h-3.5 w-3.5" /> {item.certificadoEnviadoEm ? 'Reenviar' : 'Enviar'} por e-mail
            </button>
          ) : null}
          {equipe && !item.certificadoEnviadoEm ? (
            <button type="button" disabled={salvando} onClick={() => entregar('manual')} className="btn btn-fantasma btn-sm">
              Registrar entrega
            </button>
          ) : null}
          {podeRegistrar ? (
            <button
              type="button"
              disabled={salvando}
              onClick={() => {
                if (window.confirm('Desfazer o registro deste certificado? O PDF anexado também é removido.')) void registrar({ emitidoEm: '' });
              }}
              className="text-xs text-slate-500 hover:text-rose-700 hover:underline"
            >
              desfazer
            </button>
          ) : null}
        </div>
        {retorno}
      </div>
    );
  }

  if (!podeRegistrar) return <span className="text-xs text-slate-500">Aguardando envio do lote</span>;

  const enviarFormulario = (evento: FormEvent) => {
    evento.preventDefault();
    void registrar({ numero, emitidoEm: data });
  };

  return (
    <div className="space-y-1.5">
      <form onSubmit={enviarFormulario} className="flex flex-wrap items-center gap-1.5">
        <input value={numero} onChange={(evento) => setNumero(evento.target.value)} placeholder="Nº (opcional)" className="input mt-0 w-28 py-1 text-xs" />
        <input type="date" value={data} onChange={(evento) => setData(evento.target.value)} required className="input mt-0 w-36 py-1 text-xs" />
        <button type="submit" disabled={salvando} className="btn btn-primario btn-sm">
          Registrar
        </button>
        {seletorArquivo}
      </form>
      {retorno}
    </div>
  );
}

export default function LoteDetalhePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { usuario } = useUsuario();
  const equipe = usuario.role !== 'CERTIFICADORA';

  const [lote, setLote] = useState<LoteDetalhe | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [dataTodos, setDataTodos] = useState(hoje);
  const { mensagem, definir, erro, sucesso, limpar } = useMensagem();

  const carregar = useCallback(async () => {
    try {
      setLote(await api<LoteDetalhe>(`/lotes/${params.id}`));
    } catch (falha) {
      if (falha instanceof ApiError && (falha.status === 404 || falha.status === 400)) setNaoEncontrado(true);
      else erro(falha);
    }
  }, [params.id, erro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (naoEncontrado) return <Cabecalho titulo="Lote não encontrado" voltar={{ href: '/lotes', rotulo: 'Certificação' }} />;
  if (!lote) return mensagem ? <Aviso mensagem={mensagem} /> : <Carregando />;

  const aberto = lote.status === 'ABERTO';
  const pendentes = lote.itens.filter((item) => !item.certificadoEmitidoEm).length;

  const executar = async <T,>(acao: () => Promise<T>, aoConcluir: (resultado: T) => void) => {
    setOcupado(true);
    limpar();
    try {
      aoConcluir(await acao());
      await carregar();
    } catch (falha) {
      erro(falha);
    } finally {
      setOcupado(false);
    }
  };

  const enviarLote = () => {
    const aviso = `Enviar o lote ${lote.referencia} com ${lote.itens.length} aluno(s) para a certificadora? O prazo de ${lote.prazoDias} dias começa a contar agora e o lote não poderá mais ser alterado.`;
    if (!window.confirm(aviso)) return;
    void executar(
      () => api<ResultadoEnvio>(`/lotes/${lote.id}/enviar`, { method: 'POST' }),
      ({ pasta }) => {
        if (!pasta) definir({ tipo: 'sucesso', texto: 'Lote enviado. O Google Drive não está configurado, então a pasta do lote não foi montada.' });
        else if ('erro' in pasta) definir({ tipo: 'erro', texto: `Lote enviado, mas a pasta no Drive não foi montada: ${pasta.erro}` });
        else definir({ tipo: pasta.falhas.length ? 'erro' : 'sucesso', texto: `Lote enviado. ${resumoPasta(pasta)}` });
      },
    );
  };

  const montarPasta = () =>
    void executar(
      () => api<ResultadoPasta>(`/lotes/${lote.id}/pasta-drive`, { method: 'POST' }),
      (pasta) => definir({ tipo: pasta.falhas.length ? 'erro' : 'sucesso', texto: resumoPasta(pasta) }),
    );

  const removerAluno = (item: ItemLote) => {
    if (!window.confirm(`Tirar ${item.matricula.aluno.nome} deste lote?`)) return;
    void executar(() => api(`/lotes/${lote.id}/itens/${item.id}`, { method: 'DELETE' }), () => sucesso('Aluno retirado do lote.'));
  };

  const excluirLote = async () => {
    if (!window.confirm(`Excluir o lote ${lote.referencia}? Os alunos voltam a ficar disponíveis para outro lote.`)) return;
    try {
      await api(`/lotes/${lote.id}`, { method: 'DELETE' });
      router.replace('/lotes');
    } catch (falha) {
      erro(falha);
    }
  };

  const registrarTodos = (evento: FormEvent) => {
    evento.preventDefault();
    if (!window.confirm(`Registrar ${pendentes} certificado(s) como emitidos em ${formatarData(dataTodos)}?`)) return;
    void executar(
      () => api<{ registrados: number }>(`/lotes/${lote.id}/certificados`, { method: 'POST', json: { emitidoEm: dataTodos } }),
      ({ registrados }) => sucesso(`${registrados} certificado(s) registrados.`),
    );
  };

  const baixarPacote = async (caminho: string) => {
    setOcupado(true);
    limpar();
    try {
      await baixarArquivo(caminho, 'lote.zip');
    } catch (falha) {
      erro(falha);
    } finally {
      setOcupado(false);
    }
  };

  const anotar = (item: ItemLote) => {
    const texto = window.prompt(`Anotação sobre ${item.matricula.aluno.nome} (ex.: FALTA CPF). Deixe vazio para apagar:`, item.observacao ?? '');
    if (texto === null) return;
    void executar(
      () => api(`/lotes/${lote.id}/itens/${item.id}/observacao`, { method: 'PATCH', json: { observacao: texto.trim() } }),
      () => sucesso(texto.trim() ? 'Anotação salva.' : 'Anotação apagada.'),
    );
  };

  const baixarHistorico = async (item: ItemLote) => {
    try {
      await abrirArquivo(`/lotes/${lote.id}/itens/${item.id}/historico`);
    } catch (falha) {
      erro(falha);
    }
  };

  return (
    <div className="space-y-6">
      <Cabecalho
        voltar={{ href: '/lotes', rotulo: 'Certificação' }}
        titulo={`Lote ${lote.referencia}`}
        descricao={
          <span className="flex flex-wrap items-center gap-3">
            <StatusLoteBadge status={lote.status} />
            {lote.certificadora ? <span className="font-medium text-slate-700">{lote.certificadora.nome}</span> : null}
            {lote.importado ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Importado da planilha antiga</span> : null}
            <span>{lote.itens.length} aluno(s)</span>
            {lote.enviadoEm ? <span>enviado em {formatarDataHora(lote.enviadoEm)}</span> : null}
            {lote.prazoEm ? (
              <span>
                prazo: <PrazoLote status={lote.status} prazoEm={lote.prazoEm} />
              </span>
            ) : null}
          </span>
        }
        acoes={
          equipe && aberto ? (
            <>
              <button type="button" disabled={ocupado || lote.itens.length === 0} onClick={enviarLote} className="btn btn-primario">
                <Send className="h-4 w-4" /> Enviar para a certificadora
              </button>
              <button type="button" disabled={ocupado} onClick={() => void excluirLote()} className="btn btn-secundario text-rose-700">
                <Trash2 className="h-4 w-4" /> Excluir
              </button>
            </>
          ) : null
        }
      />

      <Aviso mensagem={mensagem} onFechar={limpar} />

      {lote.itens.length ? (
        <Cartao
          titulo="Arquivos do lote"
          descricao="Uma pasta por aluno com o histórico e os documentos aprovados (em PDF), mais a planilha-índice. Documentos conferidos antes do sistema vêm com o link da pasta antiga do Drive."
        >
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button type="button" disabled={ocupado} onClick={() => void baixarPacote(`/lotes/${lote.id}/pacote`)} className="btn btn-primario">
              <Download className="h-4 w-4" /> Baixar lote completo (.zip)
            </button>
            {!aberto && lote.pastaLink ? (
              <a href={lote.pastaLink} target="_blank" rel="noreferrer" className="btn btn-secundario">
                <ExternalLink className="h-4 w-4" /> Abrir pasta do lote no Drive
              </a>
            ) : null}
            {!aberto && equipe && lote.driveConfigurado ? (
              <button type="button" disabled={ocupado} onClick={montarPasta} className="btn btn-fantasma">
                <FolderSync className="h-4 w-4" /> {lote.pastaLink ? 'Atualizar pasta' : 'Montar pasta no Drive'}
              </button>
            ) : null}
            {!lote.driveConfigurado ? <span className="text-slate-500">Google Drive ainda não configurado: use o .zip.</span> : null}
          </div>
        </Cartao>
      ) : null}

      {equipe && aberto && adicionando ? (
        <Cartao titulo="Adicionar alunos ao lote">
          <SeletorAptos
            textoBotao="Adicionar ao lote"
            onCancelar={() => setAdicionando(false)}
            onConfirmar={async (matriculaIds) => {
              await api(`/lotes/${lote.id}/itens`, { method: 'POST', json: { matriculaIds } });
              setAdicionando(false);
              sucesso('Alunos adicionados ao lote.');
              await carregar();
            }}
          />
        </Cartao>
      ) : null}

      <Cartao
        titulo="Alunos do lote"
        descricao={aberto ? 'Confira a lista antes de enviar.' : `${lote.itens.length - pendentes} de ${lote.itens.length} certificado(s) registrados.`}
        acoes={
          equipe && aberto && !adicionando ? (
            <button type="button" onClick={() => setAdicionando(true)} className="btn btn-secundario">
              <Plus className="h-4 w-4" /> Adicionar alunos
            </button>
          ) : !aberto && pendentes > 0 ? (
            <form onSubmit={registrarTodos} className="flex items-center gap-2">
              <input type="date" value={dataTodos} onChange={(evento) => setDataTodos(evento.target.value)} required className="input mt-0 w-36 py-1.5 text-sm" />
              <button type="submit" disabled={ocupado} className="btn btn-secundario">
                Registrar todos os pendentes
              </button>
            </form>
          ) : null
        }
      >
        {lote.itens.length === 0 ? (
          <Vazio>Nenhum aluno neste lote.</Vazio>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Turma</th>
                  <th>Histórico e documentos</th>
                  <th>Certificado digital</th>
                  {equipe && aberto ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {lote.itens.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td>
                      {equipe ? (
                        <Link href={`/alunos/${item.matricula.aluno.id}`} className="link">
                          {item.matricula.aluno.nome}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-900">{item.matricula.aluno.nome}</span>
                      )}
                      <p className="text-xs text-slate-500">CPF {mascararCpf(item.matricula.aluno.cpf)}</p>
                      {item.observacao ? <p className="mt-1 text-xs font-medium text-amber-700">{item.observacao}</p> : null}
                      {!aberto ? (
                        <button type="button" disabled={ocupado} onClick={() => anotar(item)} className="text-xs text-slate-500 hover:text-indigo-700 hover:underline">
                          {item.observacao ? 'editar anotação' : 'anotar'}
                        </button>
                      ) : null}
                    </td>
                    <td className="text-slate-600">{item.matricula.turma.nome}</td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => void baixarHistorico(item)} className="btn btn-secundario btn-sm">
                          <FileDown className="h-3.5 w-3.5" /> Histórico
                        </button>
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() => void baixarPacote(`/lotes/${lote.id}/itens/${item.id}/pacote`)}
                          className="btn btn-secundario btn-sm"
                          title="Histórico e documentos aprovados do aluno (.zip)"
                        >
                          <Download className="h-3.5 w-3.5" /> Documentos
                        </button>
                      </div>
                    </td>
                    <td>
                      <RegistroCertificado
                        item={item}
                        loteId={lote.id}
                        podeRegistrar={!aberto}
                        equipe={equipe}
                        emailConfigurado={lote.emailConfigurado}
                        onAlterado={() => void carregar()}
                      />
                    </td>
                    {equipe && aberto ? (
                      <td className="text-right">
                        <button type="button" disabled={ocupado} onClick={() => removerAluno(item)} className="btn btn-fantasma btn-sm text-rose-600" title="Tirar do lote">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    ) : null}
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
