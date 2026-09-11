'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Award, Download, Eye, LogOut, Upload } from 'lucide-react';
import { formatarData, formatarDataHora, formatarTamanho } from '../lib/formato';
import { abrirArquivoPortal, clearSessaoAluno, getSessaoAluno, portalApi } from '../lib/portal';
import {
  MIME_EXTERNO,
  ROTULOS_CONDICAO,
  ROTULOS_DOCUMENTO,
  type CondicaoGraduacao,
  type Documento,
  type StatusSemaforo,
  type TipoDocumento,
} from '../lib/tipos';
import { ChecklistDocumentos, statusDoTipo } from '../components/Documentos';
import { PaginaPortal } from '../components/PaginaPortal';
import { MeusDados, type DadosAlunoPortal, type UltimaSolicitacao } from '../components/MeusDados';
import { Aviso, Campo, Carregando, Cartao, SemaforoBadge, StatusDocumentoBadge, useMensagem, Vazio } from '../components/ui';

type DocumentoPortal = Pick<Documento, 'id' | 'tipo' | 'nomeArquivo' | 'mimeType' | 'tamanho' | 'status' | 'motivoRejeicao' | 'criadoEm'>;

type DadosPortal = {
  nome: string;
  email: string;
  condicaoGraduacao: CondicaoGraduacao;
  statusSemaforo: StatusSemaforo;
  pendencias: string[];
  documentosObrigatorios: TipoDocumento[];
  documentos: DocumentoPortal[];
  turmas: Array<{ nome: string; dataInicio: string; dataFim: string }>;
  certificados: Array<{ id: string; turma: string; emitidoEm: string | null }>;
  dados: DadosAlunoPortal;
  ultimaSolicitacao: UltimaSolicitacao;
};

export default function PortalAlunoPage() {
  const router = useRouter();
  const [dados, setDados] = useState<DadosPortal | null>(null);
  const [tipo, setTipo] = useState<TipoDocumento>('RG');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campoArquivo = useRef<HTMLInputElement>(null);
  const { mensagem, definir, erro, sucesso, limpar } = useMensagem();

  const carregar = useCallback(async () => {
    try {
      const resposta = await portalApi<DadosPortal>('/portal/eu');
      setDados(resposta);
      // Sugere o próximo documento que falta enviar
      const pendente = resposta.documentosObrigatorios.find((item) =>
        ['FALTANDO', 'REJEITADO'].includes(statusDoTipo(resposta.documentos, item)),
      );
      if (pendente) setTipo(pendente);
    } catch (falha) {
      erro(falha);
    }
  }, [erro]);

  useEffect(() => {
    if (!getSessaoAluno()) {
      router.replace('/portal/entrar');
      return;
    }
    if (new URLSearchParams(window.location.search).get('bemvindo')) {
      definir({ tipo: 'sucesso', texto: 'Inscrição concluída! Agora envie seus documentos abaixo.' });
    }
    void carregar();
  }, [router, carregar, definir]);

  const sair = () => {
    clearSessaoAluno();
    router.replace('/portal/entrar');
  };

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!arquivo) return;
    setEnviando(true);
    limpar();

    // O tipo precisa vir antes do arquivo
    const formulario = new FormData();
    formulario.append('tipo', tipo);
    formulario.append('arquivo', arquivo);

    try {
      await portalApi('/portal/documentos', { method: 'POST', body: formulario });
      sucesso(`${ROTULOS_DOCUMENTO[tipo]} enviado. A secretaria vai analisar e você acompanha a situação por aqui.`);
      setArquivo(null);
      if (campoArquivo.current) campoArquivo.current.value = '';
      await carregar();
    } catch (falha) {
      erro(falha);
    } finally {
      setEnviando(false);
    }
  };

  const abrir = async (caminho: string) => {
    try {
      await abrirArquivoPortal(caminho);
    } catch (falha) {
      erro(falha);
    }
  };

  return (
    <PaginaPortal
      largura="max-w-4xl"
      acoes={
        dados ? (
          <button type="button" onClick={sair} className="btn btn-secundario btn-sm">
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        ) : null
      }
    >
      <Aviso mensagem={mensagem} onFechar={limpar} />

      {!dados ? (
        !mensagem && <Carregando />
      ) : (
        <div className="space-y-6">
          <Cartao>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Olá, {dados.nome.split(' ')[0]}</h1>
                <p className="mt-1 text-sm text-slate-600">
                  {dados.turmas.length
                    ? dados.turmas.map((turma) => `${turma.nome} (${formatarData(turma.dataInicio)} a ${formatarData(turma.dataFim)})`).join(' · ')
                    : 'Você ainda não está matriculado em nenhuma turma.'}
                </p>
              </div>
              <SemaforoBadge status={dados.statusSemaforo} />
            </div>
            {dados.pendencias.length ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <AlertTriangle className="h-4 w-4" /> O que falta
                </p>
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-amber-900">
                  {dados.pendencias.map((pendencia) => (
                    <li key={pendencia}>{pendencia}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 text-sm font-medium text-emerald-700">Tudo certo com a sua documentação.</p>
            )}
          </Cartao>

          {dados.certificados.length ? (
            <Cartao titulo="Certificado digital">
              <ul className="divide-y divide-slate-100 rounded-xl border border-emerald-200 bg-emerald-50/40">
                {dados.certificados.map((certificado) => (
                  <li key={certificado.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <span className="flex items-center gap-2 text-sm">
                      <Award className="h-4 w-4 text-emerald-600" />
                      <span className="font-medium text-slate-900">{certificado.turma}</span>
                      {certificado.emitidoEm ? <span className="text-slate-500">emitido em {formatarData(certificado.emitidoEm)}</span> : null}
                    </span>
                    <button type="button" onClick={() => void abrir(`/portal/certificados/${certificado.id}/arquivo`)} className="btn btn-primario btn-sm">
                      <Download className="h-3.5 w-3.5" /> Baixar certificado
                    </button>
                  </li>
                ))}
              </ul>
            </Cartao>
          ) : null}

          <MeusDados dados={dados.dados} ultimaSolicitacao={dados.ultimaSolicitacao} onSalvo={() => void carregar()} />

          <Cartao
            titulo="Documentos exigidos"
            descricao={`Para quem está na situação: ${ROTULOS_CONDICAO[dados.condicaoGraduacao].toLowerCase()}.`}
          >
            <ChecklistDocumentos obrigatorios={dados.documentosObrigatorios} documentos={dados.documentos} />

            <form onSubmit={enviar} className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-4 md:grid-cols-[1fr,1.4fr,auto] md:items-end">
                <Campo rotulo="Documento">
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
          </Cartao>

          <Cartao titulo="Documentos enviados">
            {dados.documentos.length === 0 ? (
              <Vazio>Você ainda não enviou nenhum documento.</Vazio>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {dados.documentos.map((documento) => (
                  <li key={documento.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{ROTULOS_DOCUMENTO[documento.tipo]}</span>
                        <StatusDocumentoBadge status={documento.status} />
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {documento.mimeType === MIME_EXTERNO
                          ? `Conferido pela secretaria em ${formatarData(documento.criadoEm)}`
                          : `${documento.nomeArquivo} · ${formatarTamanho(documento.tamanho)} · enviado em ${formatarDataHora(documento.criadoEm)}`}
                      </p>
                      {documento.status === 'REJEITADO' && documento.motivoRejeicao ? (
                        <p className="mt-1 text-sm text-rose-700">Motivo da rejeição: {documento.motivoRejeicao}. Envie novamente.</p>
                      ) : null}
                    </div>
                    {documento.mimeType === MIME_EXTERNO ? null : (
                      <button type="button" onClick={() => void abrir(`/portal/documentos/${documento.id}/arquivo`)} className="btn btn-secundario btn-sm">
                        <Eye className="h-3.5 w-3.5" /> Abrir
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      )}
    </PaginaPortal>
  );
}
