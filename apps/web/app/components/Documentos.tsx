'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { Check, CheckCircle2, Circle, Clock, ExternalLink, Eye, RotateCcw, Trash2, Upload, X, XCircle } from 'lucide-react';
import { abrirArquivo, api, apiUpload } from '../lib/api';
import { formatarDataHora, formatarTamanho } from '../lib/formato';
import { MIME_EXTERNO, ROTULOS_DOCUMENTO, type Documento, type StatusDocumento, type TipoDocumento } from '../lib/tipos';
import { Aviso, Campo, StatusDocumentoBadge, useMensagem, Vazio } from './ui';

export function ListaDocumentos({
  documentos,
  onAlterado,
  mostrarAluno = false,
}: {
  documentos: Documento[];
  onAlterado: () => void;
  mostrarAluno?: boolean;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const { mensagem, erro, sucesso, limpar } = useMensagem();

  const executar = async (id: string, acao: () => Promise<unknown>, texto: string) => {
    setOcupado(id);
    limpar();
    try {
      await acao();
      sucesso(texto);
      onAlterado();
    } catch (falha) {
      erro(falha);
    } finally {
      setOcupado(null);
    }
  };

  const alterarStatus = (documento: Documento, status: Documento['status'], motivoRejeicao?: string) =>
    executar(
      documento.id,
      () => api(`/documentos/${documento.id}/status`, { method: 'PATCH', json: { status, motivoRejeicao } }),
      status === 'APROVADO' ? 'Documento aprovado.' : status === 'REJEITADO' ? 'Documento rejeitado.' : 'Documento voltou para análise.',
    );

  const rejeitar = (documento: Documento) => {
    const motivo = window.prompt('Informe o motivo da rejeição (o aluno precisará reenviar):');
    if (motivo?.trim()) void alterarStatus(documento, 'REJEITADO', motivo.trim());
  };

  const excluir = (documento: Documento) => {
    if (!window.confirm(`Excluir o documento "${documento.nomeArquivo}"? Esta ação não pode ser desfeita.`)) return;
    void executar(documento.id, () => api(`/documentos/${documento.id}`, { method: 'DELETE' }), 'Documento excluído.');
  };

  const abrir = async (documento: Documento) => {
    try {
      await abrirArquivo(`/documentos/${documento.id}/arquivo`);
    } catch (falha) {
      erro(falha);
    }
  };

  if (documentos.length === 0) return <Vazio>Nenhum documento encontrado.</Vazio>;

  return (
    <div>
      <Aviso mensagem={mensagem} onFechar={limpar} />
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {documentos.map((documento) => (
          <li key={documento.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{ROTULOS_DOCUMENTO[documento.tipo]}</span>
                <StatusDocumentoBadge status={documento.status} />
              </div>
              {mostrarAluno && documento.aluno ? (
                <Link href={`/alunos/${documento.aluno.id}`} className="link mt-1 inline-block text-sm">
                  {documento.aluno.nome}
                </Link>
              ) : null}
              <p className="mt-1 truncate text-xs text-slate-500">
                {documento.mimeType === MIME_EXTERNO ? (
                  <>
                    {documento.nomeArquivo} em {formatarDataHora(documento.analisadoEm ?? documento.criadoEm)} · o arquivo está na pasta antiga do Drive
                  </>
                ) : (
                  <>
                    {documento.nomeArquivo} · {formatarTamanho(documento.tamanho)} · enviado em {formatarDataHora(documento.criadoEm)}
                    {documento.enviadoPor ? ` por ${documento.enviadoPor.nome}` : ''}
                  </>
                )}
              </p>
              {documento.analisadoPor && documento.status !== 'PENDENTE' ? (
                <p className="text-xs text-slate-500">
                  Analisado por {documento.analisadoPor.nome} em {formatarDataHora(documento.analisadoEm)}
                </p>
              ) : null}
              {documento.status === 'REJEITADO' && documento.motivoRejeicao ? (
                <p className="mt-1 text-sm text-rose-700">Motivo: {documento.motivoRejeicao}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {documento.mimeType === MIME_EXTERNO ? null : (
                <button type="button" onClick={() => void abrir(documento)} className="btn btn-secundario btn-sm">
                  <Eye className="h-3.5 w-3.5" /> Abrir
                </button>
              )}
              {documento.driveLink ? (
                <a href={documento.driveLink} target="_blank" rel="noreferrer" className="btn btn-secundario btn-sm">
                  <ExternalLink className="h-3.5 w-3.5" /> {documento.mimeType === MIME_EXTERNO ? 'Pasta antiga' : 'Drive'}
                </a>
              ) : null}
              {documento.status !== 'APROVADO' ? (
                <button
                  type="button"
                  disabled={ocupado === documento.id}
                  onClick={() => void alterarStatus(documento, 'APROVADO')}
                  className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Check className="h-3.5 w-3.5" /> Aprovar
                </button>
              ) : null}
              {documento.status !== 'REJEITADO' ? (
                <button type="button" disabled={ocupado === documento.id} onClick={() => rejeitar(documento)} className="btn btn-secundario btn-sm text-rose-700">
                  <X className="h-3.5 w-3.5" /> Rejeitar
                </button>
              ) : null}
              {documento.status !== 'PENDENTE' ? (
                <button
                  type="button"
                  disabled={ocupado === documento.id}
                  onClick={() => void alterarStatus(documento, 'PENDENTE')}
                  className="btn btn-fantasma btn-sm"
                  title="Voltar para análise"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <button type="button" disabled={ocupado === documento.id} onClick={() => excluir(documento)} className="btn btn-fantasma btn-sm text-rose-600" title="Excluir">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function UploadDocumento({
  alunoId,
  tipoInicial = 'RG',
  onEnviado,
}: {
  alunoId: string;
  tipoInicial?: TipoDocumento;
  onEnviado: () => void;
}) {
  const [tipo, setTipo] = useState<TipoDocumento>(tipoInicial);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campoArquivo = useRef<HTMLInputElement>(null);
  const { mensagem, erro, sucesso, limpar } = useMensagem();

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!arquivo) return;
    setEnviando(true);
    limpar();

    // Os campos de texto precisam vir antes do arquivo
    const dados = new FormData();
    dados.append('alunoId', alunoId);
    dados.append('tipo', tipo);
    dados.append('arquivo', arquivo);

    try {
      await apiUpload('/documentos/upload', dados);
      sucesso('Documento enviado. Ele ficará aguardando análise.');
      setArquivo(null);
      if (campoArquivo.current) campoArquivo.current.value = '';
      onEnviado();
    } catch (falha) {
      erro(falha);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <Aviso mensagem={mensagem} onFechar={limpar} />
      <div className="grid gap-4 md:grid-cols-[1fr,1.4fr,auto] md:items-end">
        <Campo rotulo="Tipo de documento">
          <select value={tipo} onChange={(evento) => setTipo(evento.target.value as TipoDocumento)} className="input">
            {Object.entries(ROTULOS_DOCUMENTO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Arquivo (PDF, JPG, PNG ou WEBP)">
          <input
            ref={campoArquivo}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(evento) => setArquivo(evento.target.files?.[0] ?? null)}
            required
            className="input file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-sm file:text-indigo-700"
          />
        </Campo>
        <button type="submit" disabled={enviando || !arquivo} className="btn btn-primario">
          <Upload className="h-4 w-4" /> {enviando ? 'Enviando...' : 'Enviar'}
        </button>
      </div>
    </form>
  );
}

export type SituacaoDocumentoExigido = 'APROVADO' | 'PENDENTE' | 'REJEITADO' | 'FALTANDO';

/** Situação de um tipo de documento exigido, considerando todos os envios do aluno. */
export const statusDoTipo = (
  documentos: Array<{ tipo: TipoDocumento; status: StatusDocumento }>,
  tipo: TipoDocumento,
): SituacaoDocumentoExigido => {
  const doTipo = documentos.filter((documento) => documento.tipo === tipo);
  if (doTipo.some((documento) => documento.status === 'APROVADO')) return 'APROVADO';
  if (doTipo.some((documento) => documento.status === 'PENDENTE')) return 'PENDENTE';
  if (doTipo.length) return 'REJEITADO';
  return 'FALTANDO';
};

const ITENS_CHECKLIST = {
  APROVADO: { icone: CheckCircle2, cor: 'text-emerald-600', texto: 'Aprovado' },
  PENDENTE: { icone: Clock, cor: 'text-amber-600', texto: 'Aguardando análise' },
  REJEITADO: { icone: XCircle, cor: 'text-rose-600', texto: 'Rejeitado: reenviar' },
  FALTANDO: { icone: Circle, cor: 'text-slate-400', texto: 'Não enviado' },
};

export function ChecklistDocumentos({
  obrigatorios,
  documentos,
}: {
  obrigatorios: TipoDocumento[];
  documentos: Array<{ tipo: TipoDocumento; status: StatusDocumento }>;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {obrigatorios.map((tipo) => {
        const item = ITENS_CHECKLIST[statusDoTipo(documentos, tipo)];
        const Icone = item.icone;
        return (
          <li key={tipo} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <Icone className={`h-4 w-4 shrink-0 ${item.cor}`} />
            <span className="flex-1 text-slate-800">{ROTULOS_DOCUMENTO[tipo]}</span>
            <span className={`text-xs ${item.cor}`}>{item.texto}</span>
          </li>
        );
      })}
    </ul>
  );
}
