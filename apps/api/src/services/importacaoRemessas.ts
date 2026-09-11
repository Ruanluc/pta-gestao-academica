import ExcelJS from 'exceljs';
import { mkdir, writeFile } from 'fs/promises';
import { basename, join, resolve } from 'path';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { registrarAuditoria } from '../lib/audit';
import { normalizarNome, referenciaMes, somarMeses } from '../lib/planilhaAntiga';
import { certificadoraDoArquivo, cursoDoTitulo, lerRemessas, type AlunoRemessa, type Remessa } from '../lib/planilhaRemessas';
import { csv, textosDaLinha } from './importacaoPlanilha';

/*
 * Importação das planilhas de remessas das certificadoras ("Novas demandas de confecção dos certificados -
 * INOVE.xlsx", "... - USINA.xlsx"). Cada remessa (certificadora + data) vira um lote; os alunos que estavam nos
 * lotes mensais reconstruídos da planilha de controle passam para o lote da remessa, mantendo o que já havia
 * sido registrado. "ENTREGUE"/"OK" = certificado emitido e entregue ao aluno na data da remessa.
 */

const DIA = 24 * 60 * 60 * 1000;
const DURACAO_MESES = 18;

type Ocorrencia = { certificadora: string; remessa: Remessa; aluno: AlunoRemessa; codigo: string | null };

type ItemPlano = {
  matriculaId: string;
  certificadora: string;
  data: Date;
  emitidoEm: Date | null;
  entregueEm: Date | null;
  observacao: string | null;
};

type LinhaRelatorio = { certificadora: string; aba: string; turma: string; remessa: string; nome: string; anotacao: string; motivo?: string };

const dataIso = (data: Date | null) => (data ? data.toISOString().slice(0, 10) : '');

const lerArquivos = async (arquivos: string[], hoje: Date) => {
  const ocorrencias: Ocorrencia[] = [];
  const remessas: Array<{ certificadora: string; remessa: Remessa }> = [];
  for (const arquivo of arquivos) {
    const certificadora = certificadoraDoArquivo(arquivo);
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.readFile(arquivo);
    for (const aba of livro.worksheets) {
      const linhas = Array.from({ length: aba.rowCount + 1 }, (_, numero) => (numero === 0 ? [] : textosDaLinha(aba, numero)));
      for (const remessa of lerRemessas(aba.name, linhas, hoje)) {
        remessas.push({ certificadora, remessa });
        const codigo = remessa.curso && remessa.turma ? `${remessa.curso}${remessa.turma}` : null;
        for (const aluno of remessa.alunos) ocorrencias.push({ certificadora, remessa, aluno, codigo });
      }
    }
  }
  return { ocorrencias, remessas, certificadoras: [...new Set(arquivos.map(certificadoraDoArquivo))] };
};

const planejar = async ({ ocorrencias, remessas, certificadoras }: Awaited<ReturnType<typeof lerArquivos>>) => {
  const turmas = await prisma.turma.findMany({
    where: { codigo: { not: null } },
    select: { codigo: true, matriculas: { select: { id: true, aluno: { select: { nome: true } } } } },
  });
  const porCodigo = new Map(
    turmas.map((turma) => {
      const porNome = new Map<string, string[]>();
      for (const matricula of turma.matriculas) {
        const chave = normalizarNome(matricula.aluno.nome);
        porNome.set(chave, [...(porNome.get(chave) ?? []), matricula.id]);
      }
      return [turma.codigo as string, porNome];
    }),
  );

  const turmasNovas = new Map<string, { codigo: string; titulo: string | null; primeiraRemessa: Date | null }>();
  const nomesSemAluno: LinhaRelatorio[] = [];
  const nomesEmTurmasNovas: LinhaRelatorio[] = [];
  const andamentos: Record<string, number> = {};
  const porMatricula = new Map<string, Ocorrencia[]>();

  for (const ocorrencia of ocorrencias) {
    const { certificadora, remessa, aluno, codigo } = ocorrencia;
    andamentos[aluno.andamento] = (andamentos[aluno.andamento] ?? 0) + 1;
    const linha: LinhaRelatorio = { certificadora, aba: remessa.aba, turma: codigo ?? '?', remessa: dataIso(remessa.data), nome: aluno.nome, anotacao: aluno.anotacao ?? '' };

    if (!codigo) {
      nomesSemAluno.push({ ...linha, motivo: 'turma não identificada na planilha' });
      continue;
    }
    const porNome = porCodigo.get(codigo);
    if (!porNome) {
      const nova = turmasNovas.get(codigo) ?? { codigo, titulo: remessa.titulo, primeiraRemessa: remessa.data };
      if (remessa.data && (!nova.primeiraRemessa || remessa.data < nova.primeiraRemessa)) nova.primeiraRemessa = remessa.data;
      nova.titulo ??= remessa.titulo;
      turmasNovas.set(codigo, nova);
      nomesEmTurmasNovas.push(linha);
      continue;
    }
    if (!remessa.data) {
      nomesSemAluno.push({ ...linha, motivo: 'remessa sem data' });
      continue;
    }
    const candidatos = porNome.get(normalizarNome(aluno.nome)) ?? [];
    if (candidatos.length !== 1) {
      nomesSemAluno.push({ ...linha, motivo: candidatos.length ? 'nome repetido na turma' : 'nome não encontrado na turma' });
      continue;
    }
    porMatricula.set(candidatos[0], [...(porMatricula.get(candidatos[0]) ?? []), ocorrencia]);
  }

  // Cada matrícula fica em um lote: o da remessa em que o certificado foi entregue; sem entrega, o da mais recente
  const itens: ItemPlano[] = [];
  for (const [matriculaId, lista] of porMatricula) {
    const ordenadas = [...lista].sort((a, b) => (a.remessa.data as Date).getTime() - (b.remessa.data as Date).getTime());
    const entregues = ordenadas.filter((ocorrencia) => ocorrencia.aluno.andamento === 'ENTREGUE');
    const entregue = entregues[entregues.length - 1];
    const emitida = ordenadas.find((ocorrencia) => ocorrencia.aluno.andamento === 'ENTREGUE' || ocorrencia.aluno.andamento === 'RECEBIDO');
    const final = entregue ?? ordenadas[ordenadas.length - 1];
    itens.push({
      matriculaId,
      certificadora: final.certificadora,
      data: final.remessa.data as Date,
      emitidoEm: emitida?.remessa.data ?? null,
      entregueEm: entregue?.remessa.data ?? null,
      observacao: final.aluno.anotacao,
    });
  }

  const lotes = new Map<string, { certificadora: string; data: Date; itens: ItemPlano[] }>();
  for (const item of itens) {
    const chave = `${item.certificadora}|${dataIso(item.data)}`;
    const lote = lotes.get(chave) ?? { certificadora: item.certificadora, data: item.data, itens: [] };
    lote.itens.push(item);
    lotes.set(chave, lote);
  }

  return {
    certificadoras,
    turmasNovas: [...turmasNovas.values()].sort((a, b) => a.codigo.localeCompare(b.codigo)),
    lotes: [...lotes.values()].sort((a, b) => a.data.getTime() - b.data.getTime()),
    itens,
    nomesSemAluno,
    nomesEmTurmasNovas,
    resumo: {
      remessas: remessas.length,
      nomes: ocorrencias.length,
      porCertificadora: Object.fromEntries(
        certificadoras.map((nome) => [
          nome,
          { remessas: remessas.filter((item) => item.certificadora === nome).length, nomes: ocorrencias.filter((item) => item.certificadora === nome).length },
        ]),
      ),
      andamentos,
      alunosCasados: itens.length,
      nomesSemAluno: nomesSemAluno.length,
      nomesEmTurmasNovas: nomesEmTurmasNovas.length,
      turmasNovas: [...turmasNovas.keys()].sort(),
      lotes: lotes.size,
      entregues: itens.filter((item) => item.entregueEm).length,
      emitidos: itens.filter((item) => item.emitidoEm).length,
      comAnotacao: itens.filter((item) => item.observacao).length,
    },
  };
};

type Plano = Awaited<ReturnType<typeof planejar>>;

const aplicarPlano = async (plano: Plano, hoje: Date) => {
  const resultado = {
    certificadorasCriadas: 0,
    turmasCriadas: 0,
    lotesCriados: 0,
    alunosMovidosDeLotesMensais: 0,
    alunosNovosEmLote: 0,
    alunosJaNoLote: 0,
    conflitos: 0,
    lotesMensaisRemovidos: 0,
  };
  const conflitos: Array<{ matriculaId: string; loteAtual: string }> = [];

  const certificadoras = new Map<string, string>();
  for (const nome of plano.certificadoras) {
    let certificadora = await prisma.certificadora.findUnique({ where: { nome }, select: { id: true } });
    if (!certificadora) {
      certificadora = await prisma.certificadora.create({ data: { nome }, select: { id: true } });
      resultado.certificadorasCriadas += 1;
    }
    certificadoras.set(nome, certificadora.id);
  }

  // Turmas que só aparecem nas remessas: criadas vazias (as planilhas não têm CPF para cadastrar os alunos)
  for (const nova of plano.turmasNovas) {
    if (await prisma.turma.findUnique({ where: { codigo: nova.codigo }, select: { id: true } })) continue;
    const curso = nova.titulo ? cursoDoTitulo(nova.titulo) : null;
    const dataFim = nova.primeiraRemessa ?? hoje;
    await prisma.turma.create({
      data: {
        codigo: nova.codigo,
        nome: curso ? `${curso} - ${nova.codigo}` : nova.codigo,
        curso,
        cargaHoraria: 360,
        dataInicio: somarMeses(dataFim, -DURACAO_MESES),
        dataFim,
        ativa: false,
      },
    });
    resultado.turmasCriadas += 1;
  }

  const lotesTocados = new Set<string>();
  for (const grupo of plano.lotes) {
    const certificadoraId = certificadoras.get(grupo.certificadora) as string;
    let lote = await prisma.loteCertificacao.findFirst({ where: { certificadoraId, enviadoEm: grupo.data }, select: { id: true } });
    if (!lote) {
      const prazoEm = new Date(grupo.data.getTime() + config.certificacao.prazoDias * DIA);
      lote = await prisma.loteCertificacao.create({
        data: {
          referencia: referenciaMes(grupo.data),
          certificadoraId,
          status: 'ENVIADO',
          enviadoEm: grupo.data,
          prazoEm,
          // Remessa ainda dentro do prazo segue como um lote normal (com alertas); as antigas não alertam
          importado: prazoEm < hoje,
        },
        select: { id: true },
      });
      resultado.lotesCriados += 1;
    }
    lotesTocados.add(lote.id);

    for (const item of grupo.itens) {
      const atual = await prisma.itemLote.findUnique({
        where: { matriculaId: item.matriculaId },
        include: { lote: { select: { importado: true, certificadoraId: true } } },
      });
      // O que já estava registrado prevalece; a remessa completa o que falta
      const dados = {
        certificadoEmitidoEm: atual?.certificadoEmitidoEm ?? item.emitidoEm,
        certificadoEnviadoEm: atual?.certificadoEnviadoEm ?? item.entregueEm,
        certificadoCanal: atual?.certificadoCanal ?? (item.entregueEm ? 'manual' : null),
        observacao: item.observacao ?? atual?.observacao ?? null,
      };

      if (!atual) {
        await prisma.itemLote.create({ data: { loteId: lote.id, matriculaId: item.matriculaId, ...dados } });
        resultado.alunosNovosEmLote += 1;
        continue;
      }
      const deLoteMensal = atual.lote.importado && !atual.lote.certificadoraId;
      if (atual.loteId !== lote.id && !deLoteMensal) {
        // Já está em um lote criado no sistema (ou em outra remessa): não mexe
        resultado.conflitos += 1;
        conflitos.push({ matriculaId: item.matriculaId, loteAtual: atual.loteId });
        continue;
      }
      if (atual.loteId !== lote.id) {
        lotesTocados.add(atual.loteId);
        resultado.alunosMovidosDeLotesMensais += 1;
      } else {
        resultado.alunosJaNoLote += 1;
      }
      await prisma.itemLote.update({ where: { id: atual.id }, data: { loteId: lote.id, ...dados } });
    }
  }

  // Situação de cada lote tocado; lote mensal que ficou vazio é removido
  for (const loteId of lotesTocados) {
    const lote = await prisma.loteCertificacao.findUnique({ where: { id: loteId }, select: { importado: true, certificadoraId: true } });
    const itens = await prisma.itemLote.findMany({ where: { loteId }, select: { certificadoEmitidoEm: true } });
    if (!itens.length && lote?.importado && !lote.certificadoraId) {
      await prisma.loteCertificacao.delete({ where: { id: loteId } });
      resultado.lotesMensaisRemovidos += 1;
      continue;
    }
    const pendentes = itens.filter((item) => !item.certificadoEmitidoEm).length;
    const ultimo = itens.reduce<Date | null>(
      (maior, item) => (item.certificadoEmitidoEm && (!maior || item.certificadoEmitidoEm > maior) ? item.certificadoEmitidoEm : maior),
      null,
    );
    await prisma.loteCertificacao.update({
      where: { id: loteId },
      data: itens.length && pendentes === 0 ? { status: 'CONCLUIDO', concluidoEm: ultimo } : { status: 'ENVIADO', concluidoEm: null },
    });
  }

  return { resultado, conflitos };
};

const imprimirResumo = (plano: Plano) => {
  const { resumo } = plano;
  console.info(`\nRemessas: ${resumo.remessas} | nomes: ${resumo.nomes} | por certificadora: ${JSON.stringify(resumo.porCertificadora)}`);
  console.info(`Andamentos: ${JSON.stringify(resumo.andamentos)}`);
  console.info(
    `Alunos casados com a matrícula: ${resumo.alunosCasados} | nomes sem aluno correspondente: ${resumo.nomesSemAluno} | nomes em turmas que ainda não existem: ${resumo.nomesEmTurmasNovas}`,
  );
  console.info(`Turmas a criar (vazias): ${resumo.turmasNovas.join(', ') || 'nenhuma'}`);
  console.info(`Lotes (um por remessa): ${resumo.lotes} | certificados emitidos: ${resumo.emitidos} | entregues: ${resumo.entregues} | com anotação: ${resumo.comAnotacao}`);
};

const COLUNAS_RELATORIO = ['Certificadora', 'Aba', 'Turma', 'Remessa', 'Nome', 'Anotação'];
const linhaCsv = (linha: LinhaRelatorio) => [linha.certificadora, linha.aba, linha.turma, linha.remessa, linha.nome, linha.anotacao];

/**
 * Lê as planilhas de remessas, mostra o resumo e grava o relatório em STORAGE_DIR/importacao/<data>-remessas.
 * Só grava no banco com `aplicar: true`. Pode rodar de novo sem duplicar.
 */
export const importarRemessas = async ({ arquivos, aplicar, hoje = new Date() }: { arquivos: string[]; aplicar: boolean; hoje?: Date }) => {
  console.info(`Lendo ${arquivos.map((arquivo) => basename(arquivo)).join(', ')}...`);
  const plano = await planejar(await lerArquivos(arquivos, hoje));
  imprimirResumo(plano);

  const pasta = resolve(config.storageDir, 'importacao', `${new Date().toISOString().replace(/[:.]/g, '-')}-remessas`);
  await mkdir(pasta, { recursive: true });
  await Promise.all([
    writeFile(join(pasta, 'resumo.json'), JSON.stringify(plano.resumo, null, 2)),
    writeFile(join(pasta, 'nomes-sem-aluno.csv'), csv([...COLUNAS_RELATORIO, 'Motivo'], plano.nomesSemAluno.map((linha) => [...linhaCsv(linha), linha.motivo]))),
    writeFile(join(pasta, 'alunos-de-turmas-novas.csv'), csv(COLUNAS_RELATORIO, plano.nomesEmTurmasNovas.map(linhaCsv))),
  ]);
  console.info(`\nRelatório detalhado (com nomes, fica fora do git): ${pasta}`);

  if (!aplicar) {
    console.info('Simulação: nada foi gravado. Confira o relatório e rode de novo com --aplicar.');
    return { resumo: plano.resumo, pasta, aplicado: null };
  }

  console.info('\nGravando no banco...');
  const { resultado, conflitos } = await aplicarPlano(plano, hoje);
  await registrarAuditoria({
    acao: 'IMPORTAR_REMESSAS',
    entidade: 'Sistema',
    entidadeId: 'remessas-certificadoras',
    detalhes: { arquivos: arquivos.map((arquivo) => basename(arquivo)), ...resultado },
  });
  await writeFile(join(pasta, 'aplicado.json'), JSON.stringify({ ...resultado, conflitos }, null, 2));
  console.info(`Concluído: ${JSON.stringify(resultado)}`);
  return { resumo: plano.resumo, pasta, aplicado: resultado };
};
