-- CreateEnum
CREATE TYPE "SituacaoMatricula" AS ENUM ('EM_DIA', 'TRIAL', 'ATRASADO', 'SUSPENSO', 'CANCELADO', 'QUITADO', 'FINALIZADO');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'FINANCEIRO';

-- AlterEnum
ALTER TYPE "TipoDocumento" ADD VALUE 'CERTIDAO_NASCIMENTO_CASAMENTO';

-- AlterTable
ALTER TABLE "Aluno" ADD COLUMN     "enderecoBairro" TEXT,
ADD COLUMN     "enderecoCep" TEXT,
ADD COLUMN     "enderecoCidade" TEXT,
ADD COLUMN     "enderecoComplemento" TEXT,
ADD COLUMN     "enderecoEstado" TEXT,
ADD COLUMN     "enderecoNumero" TEXT,
ADD COLUMN     "enderecoRua" TEXT,
ADD COLUMN     "ganhouCamiseta" BOOLEAN,
ADD COLUMN     "grupoWhatsapp" BOOLEAN,
ADD COLUMN     "importadoEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ItemLote" ADD COLUMN     "certificadoCanal" TEXT,
ADD COLUMN     "certificadoEnviadoEm" TIMESTAMP(3),
ADD COLUMN     "certificadoNomeArquivo" TEXT,
ADD COLUMN     "certificadoRef" TEXT;

-- AlterTable
ALTER TABLE "LoteCertificacao" ADD COLUMN     "importado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Matricula" ADD COLUMN     "dataCancelamento" TIMESTAMP(3),
ADD COLUMN     "entrouPorMigracao" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "numeroMatricula" TEXT,
ADD COLUMN     "saiuPorMigracao" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "situacao" "SituacaoMatricula" NOT NULL DEFAULT 'EM_DIA',
ADD COLUMN     "situacaoAtualizadaEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Turma" ADD COLUMN     "codigo" TEXT;

-- CreateIndex
CREATE INDEX "Matricula_situacao_idx" ON "Matricula"("situacao");

-- CreateIndex
CREATE INDEX "Matricula_numeroMatricula_idx" ON "Matricula"("numeroMatricula");

-- CreateIndex
CREATE UNIQUE INDEX "Turma_codigo_key" ON "Turma"("codigo");
