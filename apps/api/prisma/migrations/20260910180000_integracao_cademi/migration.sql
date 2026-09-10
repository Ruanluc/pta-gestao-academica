-- CreateEnum
CREATE TYPE "OrigemNota" AS ENUM ('MANUAL', 'CADEMI');

-- CreateEnum
CREATE TYPE "StatusSincronizacao" AS ENUM ('EM_ANDAMENTO', 'SUCESSO', 'PARCIAL', 'ERRO');

-- AlterTable
ALTER TABLE "Disciplina" ADD COLUMN     "cademiId" TEXT;

-- AlterTable
ALTER TABLE "Aluno" ADD COLUMN     "cademiId" TEXT;

-- AlterTable
ALTER TABLE "Nota" ADD COLUMN     "importadoEm" TIMESTAMP(3),
ADD COLUMN     "origem" "OrigemNota" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "SincronizacaoCademi" (
    "id" TEXT NOT NULL,
    "turmaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "automatica" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusSincronizacao" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "notasImportadas" INTEGER NOT NULL DEFAULT 0,
    "notasIgnoradas" INTEGER NOT NULL DEFAULT 0,
    "detalhes" TEXT,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "SincronizacaoCademi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SincronizacaoCademi_turmaId_iniciadoEm_idx" ON "SincronizacaoCademi"("turmaId", "iniciadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Disciplina_turmaId_cademiId_key" ON "Disciplina"("turmaId", "cademiId");

-- CreateIndex
CREATE UNIQUE INDEX "Aluno_cademiId_key" ON "Aluno"("cademiId");

-- AddForeignKey
ALTER TABLE "SincronizacaoCademi" ADD CONSTRAINT "SincronizacaoCademi_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SincronizacaoCademi" ADD CONSTRAINT "SincronizacaoCademi_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

