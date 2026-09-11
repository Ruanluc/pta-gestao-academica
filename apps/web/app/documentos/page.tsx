'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ROTULOS_DOCUMENTO, ROTULOS_STATUS_DOCUMENTO, type Documento, type StatusDocumento, type TipoDocumento } from '../lib/tipos';
import { ListaDocumentos } from '../components/Documentos';
import { ListaSolicitacoes } from '../components/Solicitacoes';
import { Aviso, Cabecalho, Carregando, Cartao, useMensagem } from '../components/ui';

export default function DocumentosPage() {
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);
  const [status, setStatus] = useState<StatusDocumento | ''>('PENDENTE');
  const [tipo, setTipo] = useState<TipoDocumento | ''>('');
  const { mensagem, erro } = useMensagem();

  const carregar = useCallback(async () => {
    const parametros = new URLSearchParams();
    if (status) parametros.set('status', status);
    if (tipo) parametros.set('tipo', tipo);
    try {
      setDocumentos(await api<Documento[]>(`/documentos?${parametros}`));
    } catch (falha) {
      erro(falha);
    }
  }, [status, tipo, erro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div>
      <Cabecalho
        titulo="Documentos"
        descricao="Análise da documentação enviada. Para enviar um documento, abra a página do aluno."
      />

      <div className="mb-6">
        <ListaSolicitacoes ocultarSeVazio />
      </div>

      <Cartao>
        <div className="mb-4 flex flex-wrap gap-3">
          <select value={status} onChange={(evento) => setStatus(evento.target.value as StatusDocumento | '')} className="input mt-0 w-auto">
            <option value="">Todos os status</option>
            {(Object.keys(ROTULOS_STATUS_DOCUMENTO) as StatusDocumento[]).map((valor) => (
              <option key={valor} value={valor}>
                {ROTULOS_STATUS_DOCUMENTO[valor]}
              </option>
            ))}
          </select>
          <select value={tipo} onChange={(evento) => setTipo(evento.target.value as TipoDocumento | '')} className="input mt-0 w-auto">
            <option value="">Todos os tipos</option>
            {(Object.keys(ROTULOS_DOCUMENTO) as TipoDocumento[]).map((valor) => (
              <option key={valor} value={valor}>
                {ROTULOS_DOCUMENTO[valor]}
              </option>
            ))}
          </select>
        </div>

        <Aviso mensagem={mensagem} />
        {documentos ? <ListaDocumentos documentos={documentos} onAlterado={() => void carregar()} mostrarAluno /> : !mensagem && <Carregando />}
      </Cartao>
    </div>
  );
}
