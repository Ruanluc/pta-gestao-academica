/**
 * Importa as planilhas de remessas das certificadoras ("Novas demandas de confecção dos certificados - INOVE.xlsx"...).
 * A certificadora vem do fim do nome do arquivo (" - INOVE").
 *   npm run importar:remessas -w apps/api -- "C:\...\... - INOVE.xlsx" "C:\...\... - USINA.xlsx"            simulação
 *   npm run importar:remessas -w apps/api -- "C:\...\... - INOVE.xlsx" "C:\...\... - USINA.xlsx" --aplicar  grava
 */

// Nenhum aviso sai durante a importação (precisa vir antes de carregar a configuração)
process.env.AVISOS_EMAIL = 'false';

const executar = async () => {
  const argumentos = process.argv.slice(2);
  const arquivos = argumentos.filter((argumento) => !argumento.startsWith('--'));
  if (!arquivos.length) {
    console.error('Informe as planilhas (.xlsx). Ex.: npm run importar:remessas -w apps/api -- "C:\\INOVE.xlsx" "C:\\USINA.xlsx" [--aplicar]');
    process.exitCode = 1;
    return;
  }

  const { importarRemessas } = await import('../services/importacaoRemessas');
  const { prisma } = await import('../lib/prisma');
  try {
    await importarRemessas({ arquivos, aplicar: argumentos.includes('--aplicar') });
  } finally {
    await prisma.$disconnect();
  }
};

executar().catch((erro) => {
  console.error('Falha na importação:', erro);
  process.exitCode = 1;
});

// Módulo próprio (sem isso o TypeScript trata os scripts como globais e acusa nomes repetidos)
export {};
