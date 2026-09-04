'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/auth';

export default function DocumentosPage() {
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadDocumentos = async () => {
    try {
      const response = await apiFetch('/documentos');
      if (response.ok) {
        setDocumentos(await response.json());
      }
    } catch {
      setDocumentos([]);
    }
  };

  useEffect(() => {
    loadDocumentos();
  }, []);

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;

    setLoading(true);
    setMessage('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiFetch('/documentos/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Falha ao enviar arquivo');
      setMessage('Arquivo enviado com sucesso.');
      setFile(null);
      await loadDocumentos();
    } catch (error: any) {
      setMessage(error.message || 'Erro ao enviar arquivo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-5xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Documentos</h1>
        <p className="mt-2 text-slate-600">Fluxo de análise de documentos com status e justificativas de rejeição.</p>
        <form onSubmit={handleUpload} className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <label className="block text-sm font-medium text-slate-700">
            Escolher arquivo
            <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full text-sm text-slate-600" required />
          </label>
          <button type="submit" disabled={loading} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-70">
            {loading ? 'Enviando...' : 'Enviar documento'}
          </button>
          {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
        </form>

        <div className="mt-6 space-y-3">
          {documentos.length === 0 ? <p className="text-slate-500">Nenhum documento enviado ainda.</p> : documentos.map((doc) => (
            <div key={doc.id} className="rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <strong>{doc.tipo}</strong>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">{doc.status}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">Aluno: {doc.aluno?.nome}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
