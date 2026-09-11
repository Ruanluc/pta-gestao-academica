'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, FileDown, FolderSync, Plus, Send, Trash2 } from 'lucide-react';
import { abrirArquivo, api, ApiError } from '../../lib/api';
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

function RegistroCertificado({
  item,
  loteId,
  podeRegistrar,
  onAlterado,
}: {
  item: ItemLote;
  loteId: string;
  podeRegistrar: boolean;
  onAlterado: () => void;
}) {
  const [numero, setNumero] = useState('');
  const [data, setData] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const { mensagem, erro, limpar } = useMensagem();

  const enviar = async (corpo: { numero?: string; emitidoEm: string }) => {
    setSalvando(true);
    limpar();
    try {
      await api(`/lotes/${loteId}/itens/${item.id}/certificado`, { method: 'PATCH', json: corpo });
      onAlterado();
    } catch (falha) {
      erro(falha);
    } finally {
      setSalvando(false);
    }
  };

  if (item.certificadoEmitidoEm) {
    return (
      <div>
        <p className="text-sm font-medium text-emerald-700">
          Emitido em {formatarData(item.certificadoEmitidoEm)}
          {item.certificadoNumero ? ` · nº ${item.certificadoNumero}` : ''}
        </p>
        {podeRegistrar ? (
          <button
            type="button"
            disabled={salvando}
            onClick={() => {
              if (window.confirm('Desfazer o registro deste certificado?')) void enviar({ emitidoEm: '' });
            }}
            className="text-xs text-slate-500 hover:text-rose-700 hover:underline"
          >
            desfazer
          </button>
        ) : null}
      </div>
    );
  }

  if (!podeRegistrar) return <span className="text-xs text-slate-500">Aguardando envio do lote</span>;

  const registrar = (evento: FormEvent) => {
    evento.preventDefault();
    void enviar({ numero, emitidoEm: data });
  };

  return (
    <form onSubmit={registrar} className="flex flex-wrap items-center gap-1.5">
      <input value={numero} onChange={(evento) => setNumero(evento.target.value)} placeholder="Nº (opcional)" className="input mt-0 w-28 py-1 text-xs" />
      <input type="date" value={data} onChange={(evento) => setData(evento.target.value)} required className="input mt-0 w-36 py-1 text-xs" />
      <button type="submit" disabled={salvando} className="btn btn-primario btn-sm">
        Registrar
      </button>
      {mensagem ? <span className="w-full text-xs text-rose-700">{mensagem.texto}</span> : null}
    </form>
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

      {!aberto ? (
        <Cartao titulo="Pasta do lote no Google Drive">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {lote.pastaLink ? (
              <a href={lote.pastaLink} target="_blank" rel="noreferrer" className="btn btn-secundario">
                <ExternalLink className="h-4 w-4" /> Abrir pasta do lote
              </a>
            ) : (
              <span className="text-slate-600">
                {lote.driveConfigurado
                  ? 'A pasta ainda não foi montada.'
                  : 'O Google Drive não está configurado. Enquanto isso, os históricos podem ser baixados na lista abaixo.'}
              </span>
            )}
            {equipe && lote.driveConfigurado ? (
              <button type="button" disabled={ocupado} onClick={montarPasta} className="btn btn-fantasma">
                <FolderSync className="h-4 w-4" /> {lote.pastaLink ? 'Atualizar pasta' : 'Montar pasta no Drive'}
              </button>
            ) : null}
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
                  <th>Histórico</th>
                  <th>Certificado</th>
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
                    </td>
                    <td className="text-slate-600">{item.matricula.turma.nome}</td>
                    <td>
                      <button type="button" onClick={() => void baixarHistorico(item)} className="btn btn-secundario btn-sm">
                        <FileDown className="h-3.5 w-3.5" /> PDF
                      </button>
                    </td>
                    <td>
                      <RegistroCertificado item={item} loteId={lote.id} podeRegistrar={!aberto} onAlterado={() => void carregar()} />
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
