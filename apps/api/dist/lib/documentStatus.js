"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcularStatusSemaforo = void 0;
const calcularStatusSemaforo = ({ documentos, notas, }) => {
    const documentosPendentes = documentos.some((doc) => doc.status !== 'APROVADO');
    const notasPendentes = notas.some((nota) => nota.media < 70);
    if (documentosPendentes)
        return 'vermelho';
    if (notasPendentes)
        return 'amarelo';
    return 'verde';
};
exports.calcularStatusSemaforo = calcularStatusSemaforo;
