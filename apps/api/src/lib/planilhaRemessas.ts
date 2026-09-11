import { dataDoTexto, normalizar } from './planilhaAntiga';

/*
 * Planilhas "Novas demandas de confecção dos certificados - <CERTIFICADORA>": uma aba por curso e, em cada
 * aba, blocos em colunas: "Pós-Graduação em ..." / "Turma 02" / "Remessa solicitada dia: dd/mm/aaaa" /
 * "Total de alunos: N" / "NOME DOS ALUNOS:" seguido dos nomes, com o andamento na coluna ao lado.
 * Uma mesma coluna pode ter várias remessas, uma embaixo da outra. Só funções puras.
 */

export type AndamentoRemessa = 'ENTREGUE' | 'RECEBIDO' | 'NA_CERTIFICADORA' | 'PENDENCIA' | 'EXTENSAO' | 'SO_FISICO' | 'OUTRO' | 'SEM_ANOTACAO';

export type AlunoRemessa = { nome: string; linha: number; andamento: AndamentoRemessa; anotacao: string | null };

export type Remessa = {
  aba: string;
  /** Prefixo do código da turma (B, TF, SM...) */
  curso: string | null;
  /** "Pós-Graduação em ..." */
  titulo: string | null;
  turma: number | null;
  data: Date | null;
  totalDeclarado: number | null;
  alunos: AlunoRemessa[];
};

const PREFIXOS: Array<[RegExp, string]> = [
  [/biomec/, 'B'],
  [/funcional/, 'TF'],
  [/personal/, 'PT'],
  [/saude da mulher/, 'SM'],
  [/bodybuilding/, 'BB'],
  [/fisiologia/, 'FE'],
  [/jiu|judo|wrestling|jjw/, 'JJW'],
  [/smart ?fit|fitness/, 'SMARTFIT'],
];

/** Prefixo do código da turma pelo nome do curso (Biomecânica -> B, Saúde da Mulher -> SM...). */
export const prefixoDoCurso = (texto: string) => PREFIXOS.find(([regex]) => regex.test(normalizar(texto)))?.[1] ?? null;

/** Andamento anotado ao lado do aluno ("ENTREGUE", "OK", "ENVIADO PARA IES", "FALTA CPF"...). */
export const andamentoDaRemessa = (texto: string): AndamentoRemessa => {
  const normal = normalizar(texto);
  if (!normal) return 'SEM_ANOTACAO';
  if (/extens/.test(normal)) return 'EXTENSAO';
  if (/somente fisico|apenas fisico/.test(normal)) return 'SO_FISICO';
  if (/^(entregue|ok)\b/.test(normal) && !normal.includes('?')) return 'ENTREGUE';
  if (/^receb/.test(normal)) return 'RECEBIDO';
  if (/falta|sem |ilegiv|fora do padrao|nao e do aluno|pasta vazia|correc/.test(normal)) return 'PENDENCIA';
  if (/ies|emissao|conferencia|verificando|rota de entrega|^envi|urgente/.test(normal)) return 'NA_CERTIFICADORA';
  return 'OUTRO';
};

const TITULO = /^(p[oó]s-gradua|forma[cç][aã]o integral)/i;
const NOMES = /^nome( dos alunos)?:?$/i;
const CABECALHO = /^(p[oó]s-gradua|forma[cç][aã]o integral|turma\s*\d|remessa solicitada|total de alunos|nome( dos alunos)?:?$|novas demandas|observa)/i;

/**
 * Lê as remessas de uma aba a partir do texto das células (linhas e colunas indexadas pelo número, a partir de 1).
 * O andamento de cada aluno fica na primeira coluna à direita que não seja outra lista de nomes.
 */
export const lerRemessas = (aba: string, linhas: string[][], hoje: Date): Remessa[] => {
  const colunasDeNomes = new Set<number>();
  linhas.forEach((celulas) => celulas?.forEach((texto, coluna) => NOMES.test(texto ?? '') && colunasDeNomes.add(coluna)));

  const remessas: Remessa[] = [];
  for (const coluna of [...colunasDeNomes].sort((a, b) => a - b)) {
    const colunaAndamento = [coluna + 1, coluna + 2].find((indice) => !colunasDeNomes.has(indice));
    let atual: Remessa = { aba, curso: prefixoDoCurso(aba), titulo: null, turma: null, data: null, totalDeclarado: null, alunos: [] };
    let lendoNomes = false;

    const fechar = () => {
      if (atual.alunos.length) remessas.push(atual);
      atual = { ...atual, alunos: [], totalDeclarado: null };
      lendoNomes = false;
    };

    linhas.forEach((celulas, linha) => {
      const texto = (celulas?.[coluna] ?? '').trim();
      if (!texto) return;

      if (TITULO.test(texto)) {
        fechar();
        atual.titulo = texto;
        atual.curso = prefixoDoCurso(texto) ?? atual.curso;
        return;
      }
      const turma = texto.match(/^turma\s*0?(\d+)/i);
      if (turma) {
        fechar();
        atual.turma = Number(turma[1]);
        return;
      }
      const remessa = texto.match(/remessa solicitada dia:?\s*(.+)/i);
      if (remessa) {
        fechar();
        atual.data = dataDoTexto(remessa[1], null, hoje);
        return;
      }
      const total = texto.match(/total de alunos:?\s*(\d+)/i);
      if (total) {
        atual.totalDeclarado = Number(total[1]);
        return;
      }
      if (NOMES.test(texto)) {
        lendoNomes = true;
        return;
      }
      if (!lendoNomes || CABECALHO.test(texto)) return;

      const bruto = colunaAndamento !== undefined ? (celulas?.[colunaAndamento] ?? '').trim() : '';
      const andamento = andamentoDaRemessa(bruto);
      atual.alunos.push({
        nome: texto,
        linha,
        andamento,
        anotacao: andamento === 'ENTREGUE' || andamento === 'SEM_ANOTACAO' ? null : bruto.slice(0, 300),
      });
    });
    fechar();
  }

  return remessas;
};

/** Certificadora pelo nome do arquivo: "Novas demandas de confecção dos certificados - INOVE.xlsx" -> "INOVE". */
export const certificadoraDoArquivo = (arquivo: string) =>
  (arquivo.split(/[\\/]/).pop() ?? arquivo)
    .replace(/\.xlsx?$/i, '')
    .split(' - ')
    .pop()!
    .trim()
    .toUpperCase();

/** "Pós-Graduação em Biomecânica, Musculação..." -> "Biomecânica, Musculação..." */
export const cursoDoTitulo = (titulo: string) => titulo.replace(/^p[oó]s-gradua[çc][ãa]o\s*(em\s*)?/i, '').trim();
