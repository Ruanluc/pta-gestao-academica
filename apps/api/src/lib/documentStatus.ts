export type StatusSemaforo = 'verde' | 'amarelo' | 'vermelho';

export const calcularStatusSemaforo = ({
  documentos,
  notas,
}: {
  documentos: Array<{ status: string }>;
  notas: Array<{ media: number }>;
}): StatusSemaforo => {
  const documentosPendentes = documentos.some((doc) => doc.status !== 'APROVADO');
  const notasPendentes = notas.some((nota) => nota.media < 70);

  if (documentosPendentes) return 'vermelho';
  if (notasPendentes) return 'amarelo';
  return 'verde';
};
