import { once } from 'events';
import archiver from 'archiver';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/errors';
import { linkPastaDrive } from '../lib/googleDrive';
import { slugificar } from '../lib/http';
import { ROTULOS_DOCUMENTO } from '../lib/semaforo';
import { lerArquivoCompleto, PREFIXO_EXTERNO } from '../lib/storage';

const EXTENSOES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const nomeSeguro = (texto: string) =>
  texto
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
const formatarCpf = (cpf: string) => cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
const campoCsv = (valor: string) => `"${valor.replace(/"/g, '""')}"`;

/**
 * Pacote (.zip) de um lote — ou de um aluno do lote — para a certificadora: uma pasta por aluno com o histórico
 * e os documentos aprovados, mais uma planilha-índice. Documentos conferidos antes do sistema só existem na pasta
 * antiga do Google Drive: entram como um aviso com o link da pasta.
 * O .zip é montado enquanto é baixado, um arquivo por vez (a memória não cresce com o tamanho do lote).
 */
export const gerarPacoteLote = async (loteId: string, filtro: Prisma.LoteCertificacaoWhereInput, itemId?: string) => {
  const lote = await prisma.loteCertificacao.findFirst({
    where: { id: loteId, ...filtro },
    select: {
      referencia: true,
      certificadora: { select: { nome: true } },
      itens: {
        where: itemId ? { id: itemId } : undefined,
        orderBy: { matricula: { aluno: { nome: 'asc' } } },
        select: {
          matricula: {
            select: {
              numeroMatricula: true,
              historicoRef: true,
              turma: { select: { nome: true } },
              aluno: {
                select: {
                  nome: true,
                  cpf: true,
                  driveFolderId: true,
                  documentos: {
                    where: { status: 'APROVADO' },
                    orderBy: { criadoEm: 'asc' },
                    select: { tipo: true, arquivoRef: true, mimeType: true, driveLink: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!lote) throw new HttpError(404, 'Lote não encontrado');
  if (itemId && !lote.itens.length) throw new HttpError(404, 'Aluno não encontrado neste lote');

  const primeiroAluno = lote.itens[0]?.matricula.aluno;
  const nome =
    itemId && primeiroAluno
      ? `lote-${lote.referencia}-${slugificar(primeiroAluno.nome)}.zip`
      : `lote-${lote.referencia}${lote.certificadora ? `-${slugificar(lote.certificadora.nome)}` : ''}.zip`;

  // PDFs já vêm compactados: guardar sem recompactar deixa o .zip rápido de montar
  const zip = archiver('zip', { store: true });

  const adicionar = async (conteudo: Buffer | string, caminho: string) => {
    const gravado = once(zip, 'entry');
    zip.append(conteudo, { name: caminho });
    await gravado;
  };

  const montar = async () => {
    const indice = [
      ['Aluno', 'CPF', 'Turma', 'Nº de matrícula', 'Histórico', 'Documentos no pacote', 'Só na pasta antiga do Drive', 'Pasta antiga do Drive', 'Arquivos não encontrados']
        .map(campoCsv)
        .join(';'),
    ];

    for (const { matricula } of lote.itens) {
      const { aluno, turma, historicoRef, numeroMatricula } = matricula;
      const pasta = `${nomeSeguro(aluno.nome)} - CPF ${formatarCpf(aluno.cpf)}`;
      const incluidos: string[] = [];
      const naPastaAntiga: string[] = [];
      const naoEncontrados: string[] = [];

      const incluirArquivo = async (ref: string, nomeArquivo: string, rotulo: string) => {
        let conteudo: Buffer;
        try {
          conteudo = await lerArquivoCompleto(ref);
        } catch {
          naoEncontrados.push(rotulo);
          return;
        }
        await adicionar(conteudo, `${pasta}/${nomeArquivo}`);
        incluidos.push(rotulo);
      };

      if (historicoRef) await incluirArquivo(historicoRef, `Histórico escolar - ${nomeSeguro(turma.nome)}.pdf`, 'Histórico');

      let linkAntigo = aluno.driveFolderId ? linkPastaDrive(aluno.driveFolderId) : '';
      const repetidos = new Map<string, number>();
      for (const documento of aluno.documentos) {
        const rotulo = ROTULOS_DOCUMENTO[documento.tipo];
        if (documento.arquivoRef.startsWith(PREFIXO_EXTERNO)) {
          naPastaAntiga.push(rotulo);
          linkAntigo ||= documento.driveLink ?? '';
          continue;
        }
        const vezes = (repetidos.get(rotulo) ?? 0) + 1;
        repetidos.set(rotulo, vezes);
        await incluirArquivo(documento.arquivoRef, `${nomeSeguro(rotulo)}${vezes > 1 ? ` (${vezes})` : ''}.${EXTENSOES[documento.mimeType] ?? 'pdf'}`, rotulo);
      }

      if (naPastaAntiga.length) {
        await adicionar(
          [
            'Documentos conferidos antes do sistema, que continuam na pasta antiga do Google Drive:',
            ...naPastaAntiga.map((rotulo) => `- ${rotulo}`),
            '',
            linkAntigo || '(link da pasta não registrado)',
          ].join('\r\n'),
          `${pasta}/LEIA-ME - documentos na pasta antiga do Drive.txt`,
        );
      }

      indice.push(
        [
          aluno.nome,
          formatarCpf(aluno.cpf),
          turma.nome,
          numeroMatricula ?? '',
          !historicoRef ? 'não gerado' : incluidos.includes('Histórico') ? 'sim' : 'arquivo não encontrado',
          incluidos.filter((rotulo) => rotulo !== 'Histórico').join(', '),
          naPastaAntiga.join(', '),
          naPastaAntiga.length ? linkAntigo : '',
          naoEncontrados.join(', '),
        ]
          .map(campoCsv)
          .join(';'),
      );
    }

    await adicionar(`\uFEFF${indice.join('\r\n')}`, `Índice do lote ${lote.referencia}.csv`);
    await zip.finalize();
  };

  montar().catch((erro) => {
    console.error('[pacote do lote] falha ao montar o .zip:', erro);
    zip.abort();
  });

  return { stream: zip, nome, alunos: lote.itens.length };
};
