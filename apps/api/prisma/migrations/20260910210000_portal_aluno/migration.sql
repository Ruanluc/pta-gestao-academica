-- AlterTable
ALTER TABLE "Turma" ADD COLUMN     "codigoInscricao" TEXT,
ADD COLUMN     "inscricoesAbertas" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Aluno" ADD COLUMN     "acessoExpiraEm" TIMESTAMP(3),
ADD COLUMN     "acessoTokenHash" TEXT,
ADD COLUMN     "inscricaoOnline" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Turma_codigoInscricao_key" ON "Turma"("codigoInscricao");

-- CreateIndex
CREATE UNIQUE INDEX "Aluno_acessoTokenHash_key" ON "Aluno"("acessoTokenHash");

