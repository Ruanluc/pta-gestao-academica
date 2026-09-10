'use client';

import { useState } from 'react';
import { CloudUpload, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { formatarDataHora } from '../lib/formato';
import { Aviso, Cartao, useMensagem } from './ui';

type ResultadoExportacao = {
  pastaLink: string;
  enviados: string[];
  jaNoDrive: number;
  falhas: Array<{ arquivo: string; erro: string }>;
  exportadoEm: string;
};

export function PastaDrive({
  alunoId,
  driveConfigurado,
  driveFolderId,
  driveExportadoEm,
  onExportado,
}: {
  alunoId: string;
  driveConfigurado: boolean;
  driveFolderId: string | null;
  driveExportadoEm: string | null;
  onExportado: () => void;
}) {
  const [resultado, setResultado] = useState<ResultadoExportacao | null>(null);
  const [exportando, setExportando] = useState(false);
  const { mensagem, definir, erro, sucesso, limpar } = useMensagem();

  const exportar = async () => {
    setExportando(true);
    limpar();
    try {
      const resposta = await api<ResultadoExportacao>(`/alunos/${alunoId}/exportar-drive`, { method: 'POST' });
      setResultado(resposta);
      const texto = `${resposta.enviados.length} arquivo(s) enviado(s) ao Google Drive; ${resposta.jaNoDrive} já estava(m) lá.`;
      if (resposta.falhas.length) definir({ tipo: 'erro', texto: `${texto} ${resposta.falhas.length} arquivo(s) falharam.` });
      else sucesso(texto);
      onExportado();
    } catch (falha) {
      erro(falha);
    } finally {
      setExportando(false);
    }
  };

  const linkPasta = resultado?.pastaLink ?? (driveFolderId ? `https://drive.google.com/drive/folders/${driveFolderId}` : null);

  return (
    <Cartao
      titulo="Pasta no Google Drive"
      descricao="Envia ao Drive os documentos e o histórico do aluno que ainda não estão lá. Rodar de novo envia só o que for novo."
      acoes={
        <button type="button" disabled={exportando || !driveConfigurado} onClick={() => void exportar()} className="btn btn-secundario">
          <CloudUpload className="h-4 w-4" /> {exportando ? 'Exportando...' : 'Exportar para o Google Drive'}
        </button>
      }
    >
      <Aviso mensagem={mensagem} onFechar={limpar} />
      {!driveConfigurado ? (
        <p className="text-sm text-amber-700">
          Google Drive não configurado. Preencha GOOGLE_DRIVE_FOLDER_ID e as credenciais do Google no .env da API (veja o README).
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span>{driveExportadoEm || resultado ? `Última exportação: ${formatarDataHora(resultado?.exportadoEm ?? driveExportadoEm)}` : 'Ainda não exportada.'}</span>
          {linkPasta ? (
            <a href={linkPasta} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
              <ExternalLink className="h-3.5 w-3.5" /> Abrir pasta no Drive
            </a>
          ) : null}
        </div>
      )}
      {resultado?.falhas.length ? (
        <ul className="mt-3 list-inside list-disc text-sm text-rose-700">
          {resultado.falhas.map((falha) => (
            <li key={falha.arquivo}>
              {falha.arquivo}: {falha.erro}
            </li>
          ))}
        </ul>
      ) : null}
    </Cartao>
  );
}
