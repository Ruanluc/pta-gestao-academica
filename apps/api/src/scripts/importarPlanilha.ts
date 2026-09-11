/**
 * Importação única da planilha antiga de controle de alunos.
 *   npm run importar:planilha -w apps/api -- "C:\caminho\CONTROLE DE ALUNOS.xlsx"            simulação: não grava nada
 *   npm run importar:planilha -w apps/api -- "C:\caminho\CONTROLE DE ALUNOS.xlsx" --aplicar  grava no banco
 * Pode rodar de novo: o que já existe não é duplicado nem sobrescrito.
 */

// Nenhum aviso sai para os alunos durante a importação (precisa vir antes de carregar a configuração)
process.env.AVISOS_EMAIL = 'false';

const executar = async () => {
  const [arquivo, ...opcoes] = process.argv.slice(2);
  if (!arquivo) {
    console.error('Informe o caminho da planilha (.xlsx). Ex.: npm run importar:planilha -w apps/api -- "C:\\planilha.xlsx" [--aplicar]');
    process.exitCode = 1;
    return;
  }

  const { importarPlanilha } = await import('../services/importacaoPlanilha');
  const { prisma } = await import('../lib/prisma');
  try {
    await importarPlanilha({ arquivo, aplicar: opcoes.includes('--aplicar') });
  } finally {
    await prisma.$disconnect();
  }
};

executar().catch((erro) => {
  console.error('Falha na importação:', erro);
  process.exitCode = 1;
});
