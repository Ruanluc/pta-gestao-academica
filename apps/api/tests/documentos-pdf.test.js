require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');

const { montarPdfDocumento, orientacaoJpeg, pareceUmPdf } = require('../dist/lib/pdfDocumentos');

// Imagens reais de 40x20 px (mais largas que altas)
const JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAUACgDASIAAhEBAxEB/8QAGAABAQADAAAAAAAAAAAAAAAAAAUDBgj/xAAvEAABAQMICAcAAAAAAAAAAAAAEgIRFAEFBgcTFRYxBAgjJTI3QUNGYoOEobPD/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAMG/8QAHREAAQQCAwAAAAAAAAAAAAAAAAECBBEFQQMSIv/aAAwDAQACEQMRAD8Ay1a0ExteO8YGDs+xarWrzSOcn5LlNapsM0Z0yd76iodGyhUKU2yzmuV3E/LoW9WrxH7b9Td66eWc8+j9zBr5WSk8eSSO13i2pVJur1ZJGp1s5bABqiYAAAAAAAAAAAB//9k=',
  'base64',
);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAYAAAD/Rn+7AAAAAXNSR0IArs4c6QAAAARzQklUCAgICHwIZIgAAABNSURBVEiJY/R3e/qfYRADpoF2ACEw6kBKAQu6wIadUkRpDHB/Rgv3YIBBH4KjDqQUjDqQUjDqQErBqAMpBaMOpBQwjrYHKQSjDqQUAAAfgAgbWFkCtQAAAABJRU5ErkJggg==',
  'base64',
);

/** Coloca um bloco EXIF com a orientação logo depois do início do JPEG (como fazem as câmeras de celular). */
const comOrientacao = (jpeg, valor, littleEndian = false) => {
  const tiff = Buffer.alloc(26);
  const u16 = (numero, posicao) => (littleEndian ? tiff.writeUInt16LE(numero, posicao) : tiff.writeUInt16BE(numero, posicao));
  const u32 = (numero, posicao) => (littleEndian ? tiff.writeUInt32LE(numero, posicao) : tiff.writeUInt32BE(numero, posicao));
  tiff.write(littleEndian ? 'II' : 'MM', 0, 'latin1');
  u16(42, 2);
  u32(8, 4); // primeiro IFD logo depois do cabeçalho
  u16(1, 8); // uma entrada
  u16(0x0112, 10); // Orientation
  u16(3, 12); // SHORT
  u32(1, 14);
  u16(valor, 18);
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const cabecalho = Buffer.alloc(4);
  cabecalho.writeUInt16BE(0xffe1, 0);
  cabecalho.writeUInt16BE(exif.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), cabecalho, exif, jpeg.subarray(2)]);
};

const paginas = async (pdf) => (await PDFDocument.load(pdf)).getPages().map((pagina) => pagina.getSize());

test('orientação EXIF das fotos de celular', () => {
  assert.equal(orientacaoJpeg(JPG), 1);
  assert.equal(orientacaoJpeg(comOrientacao(JPG, 6)), 6);
  assert.equal(orientacaoJpeg(comOrientacao(JPG, 8, true)), 8);
  assert.equal(orientacaoJpeg(PNG), 1);
  assert.equal(orientacaoJpeg(Buffer.from('não é imagem')), 1);
});

test('fotos viram páginas A4 de um único PDF, na ordem enviada', async () => {
  const pdf = await montarPdfDocumento([
    { conteudo: JPG, mimeType: 'image/jpeg', nome: 'frente.jpg' },
    { conteudo: PNG, mimeType: 'image/png', nome: 'verso.png' },
  ]);
  assert.ok(pareceUmPdf(pdf));
  const tamanhos = await paginas(pdf);
  assert.equal(tamanhos.length, 2);
  // Foto mais larga que alta: A4 deitado
  assert.ok(Math.abs(tamanhos[0].width - 841.89) < 0.01 && Math.abs(tamanhos[0].height - 595.28) < 0.01, JSON.stringify(tamanhos[0]));
});

test('aceita arquivos que começam no meio de um bloco de memória (uploads pequenos do Node)', async () => {
  // Buffer que não começa no início do ArrayBuffer, como os que o Node reaproveita para arquivos pequenos
  const deslocado = (origem) => {
    const bloco = Buffer.alloc(origem.length + 7);
    origem.copy(bloco, 7);
    return bloco.subarray(7);
  };
  const pdf = await montarPdfDocumento([
    { conteudo: deslocado(JPG), mimeType: 'image/jpeg', nome: 'frente.jpg' },
    { conteudo: deslocado(comOrientacao(JPG, 6)), mimeType: 'image/jpeg', nome: 'verso.jpg' },
    { conteudo: deslocado(PNG), mimeType: 'image/png', nome: 'extra.png' },
  ]);
  assert.equal((await paginas(pdf)).length, 3);
});

test('foto de celular "deitada" (EXIF 6) vira página em pé', async () => {
  const [pagina] = await paginas(await montarPdfDocumento([{ conteudo: comOrientacao(JPG, 6), mimeType: 'image/jpeg', nome: 'rg.jpg' }]));
  assert.ok(pagina.height > pagina.width, JSON.stringify(pagina));
});

test('PDFs e fotos enviados juntos são unidos', async () => {
  const origem = await PDFDocument.create();
  origem.addPage([595.28, 841.89]);
  origem.addPage([595.28, 841.89]);
  const pdf = await montarPdfDocumento([
    { conteudo: Buffer.from(await origem.save()), mimeType: 'application/pdf', nome: 'historico.pdf' },
    { conteudo: JPG, mimeType: 'image/jpeg', nome: 'ultima-pagina.jpg' },
  ]);
  assert.equal((await paginas(pdf)).length, 3);
});

test('arquivo que não é imagem nem PDF de verdade é recusado', async () => {
  await assert.rejects(montarPdfDocumento([{ conteudo: Buffer.from('texto'), mimeType: 'image/jpeg', nome: 'falso.jpg' }]), { statusCode: 415 });
  await assert.rejects(montarPdfDocumento([{ conteudo: Buffer.from('texto'), mimeType: 'application/pdf', nome: 'falso.pdf' }]), { statusCode: 415 });
  assert.equal(pareceUmPdf(Buffer.from('%PDF-1.7\n...')), true);
  assert.equal(pareceUmPdf(Buffer.from('GIF89a')), false);
});
