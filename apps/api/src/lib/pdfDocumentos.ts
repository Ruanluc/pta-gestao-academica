import { degrees, PDFDocument, type PDFImage } from 'pdf-lib';
import { HttpError } from './errors';

/*
 * O MEC exige os documentos em PDF: fotos (JPG/PNG) viram páginas A4 e vários arquivos enviados juntos
 * (ex.: frente e verso do RG) viram um único PDF, na ordem em que foram escolhidos.
 */

export const TIPOS_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png'];

export type ArquivoRecebido = { conteudo: Buffer; mimeType: string; nome: string };

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 24;

/** Rotação (graus, sentido horário) que deixa a foto em pé, pela orientação EXIF. Espelhamentos são ignorados. */
const ROTACOES: Record<number, number> = { 3: 180, 4: 180, 5: 90, 6: 90, 7: 270, 8: 270 };

/** Orientação EXIF de uma foto JPEG (1 = normal, 3 = de ponta-cabeça, 6 = girar 90° horário, 8 = 90° anti-horário). */
export const orientacaoJpeg = (jpeg: Buffer): number => {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return 1;
  let posicao = 2;
  while (posicao + 4 <= jpeg.length) {
    if (jpeg[posicao] !== 0xff) return 1;
    const marcador = jpeg[posicao + 1];
    // Chegou na imagem sem achar o EXIF
    if (marcador === 0xda || marcador === 0xd9) return 1;
    const tamanho = jpeg.readUInt16BE(posicao + 2);

    if (marcador === 0xe1 && jpeg.toString('latin1', posicao + 4, posicao + 10) === 'Exif\0\0') {
      const tiff = posicao + 10;
      const littleEndian = jpeg.toString('latin1', tiff, tiff + 2) === 'II';
      const u16 = (indice: number) => (littleEndian ? jpeg.readUInt16LE(indice) : jpeg.readUInt16BE(indice));
      const u32 = (indice: number) => (littleEndian ? jpeg.readUInt32LE(indice) : jpeg.readUInt32BE(indice));
      if (tiff + 8 > jpeg.length) return 1;
      const ifd = tiff + u32(tiff + 4);
      if (ifd + 2 > jpeg.length) return 1;
      for (let indice = 0; indice < u16(ifd); indice += 1) {
        const entrada = ifd + 2 + indice * 12;
        if (entrada + 12 > jpeg.length) return 1;
        if (u16(entrada) === 0x0112) {
          const valor = u16(entrada + 8);
          return valor >= 1 && valor <= 8 ? valor : 1;
        }
      }
      return 1;
    }
    posicao += 2 + tamanho;
  }
  return 1;
};

/**
 * Cópia com memória própria: o pdf-lib lê a imagem a partir do início do ArrayBuffer e ignora onde o Buffer
 * começa. Buffers pequenos do Node (ex.: vindos do upload) ficam no meio de um bloco compartilhado.
 */
const bytesProprios = (conteudo: Buffer) => new Uint8Array(conteudo);

const desenharImagem = async (pdf: PDFDocument, arquivo: ArquivoRecebido) => {
  let imagem: PDFImage;
  try {
    const bytes = bytesProprios(arquivo.conteudo);
    imagem = arquivo.mimeType === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    throw new HttpError(415, `"${arquivo.nome}" não é uma imagem válida.`);
  }

  const rotacao = arquivo.mimeType === 'image/jpeg' ? ROTACOES[orientacaoJpeg(arquivo.conteudo)] ?? 0 : 0;
  const deitada = rotacao === 90 || rotacao === 270;
  // Tamanho da foto já em pé
  const largura = deitada ? imagem.height : imagem.width;
  const altura = deitada ? imagem.width : imagem.height;

  // Página A4 em pé ou deitada, conforme a foto; a foto ocupa a página com uma margem
  const [larguraPagina, alturaPagina] = largura > altura ? [A4[1], A4[0]] : A4;
  const escala = Math.min((larguraPagina - 2 * MARGEM) / largura, (alturaPagina - 2 * MARGEM) / altura);
  const [w, h] = [largura * escala, altura * escala];
  const [x, y] = [(larguraPagina - w) / 2, (alturaPagina - h) / 2];
  const [larguraImagem, alturaImagem] = [imagem.width * escala, imagem.height * escala];

  const pagina = pdf.addPage([larguraPagina, alturaPagina]);
  // O pdf-lib gira em torno do canto de origem (sentido anti-horário): a origem muda conforme a rotação
  const posicoes: Record<number, { x: number; y: number }> = {
    0: { x, y },
    90: { x, y: y + h },
    180: { x: x + w, y: y + h },
    270: { x: x + w, y },
  };
  pagina.drawImage(imagem, { ...posicoes[rotacao], width: larguraImagem, height: alturaImagem, rotate: degrees(-rotacao) });
};

/** Junta os arquivos (PDFs e fotos) em um único PDF, na ordem recebida. */
export const montarPdfDocumento = async (arquivos: ArquivoRecebido[]): Promise<Buffer> => {
  const pdf = await PDFDocument.create();
  for (const arquivo of arquivos) {
    if (arquivo.mimeType === 'application/pdf') {
      let origem: PDFDocument;
      try {
        origem = await PDFDocument.load(bytesProprios(arquivo.conteudo), { ignoreEncryption: true });
      } catch {
        throw new HttpError(415, `"${arquivo.nome}" não é um PDF válido.`);
      }
      const paginas = await pdf.copyPages(origem, origem.getPageIndices());
      paginas.forEach((pagina) => pdf.addPage(pagina));
      continue;
    }
    await desenharImagem(pdf, arquivo);
  }
  return Buffer.from(await pdf.save());
};

/** O arquivo começa como um PDF de verdade (não só tem a extensão). */
export const pareceUmPdf = (conteudo: Buffer) => conteudo.subarray(0, 1024).includes('%PDF-');
