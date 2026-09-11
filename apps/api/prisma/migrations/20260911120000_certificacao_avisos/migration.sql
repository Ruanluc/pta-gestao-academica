-- CreateEnum
CREATE TYPE "StatusLote" AS ENUM ('ABERTO', 'ENVIADO', 'CONCLUIDO');

-- CreateEnum
CREATE TYPE "StatusSolicitacao" AS ENUM ('PENDENTE', 'APROVADA', 'RECUSADA');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CERTIFICADORA';

-- AlterTable
ALTER TABLE "Aluno" ADD COLUMN     "ultimoLembreteEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LoteCertificacao" (
    "id" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "status" "StatusLote" NOT NULL DEFAULT 'ABERTO',
    "enviadoEm" TIMESTAMP(3),
    "prazoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "driveFolderId" TEXT,
    "driveIndiceId" TEXT,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoteCertificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemLote" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "matriculaId" TEXT NOT NULL,
    "driveFolderId" TEXT,
    "certificadoNumero" TEXT,
    "certificadoEmitidoEm" TIMESTAMP(3),
    "registradoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitacaoAlteracao" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "dados" TEXT NOT NULL,
    "status" "StatusSolicitacao" NOT NULL DEFAULT 'PENDENTE',
    "motivoRecusa" TEXT,
    "analisadoPorId" TEXT,
    "analisadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolicitacaoAlteracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT,
    "para" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "referencia" TEXT,
    "assunto" TEXT NOT NULL,
    "enviado" BOOLEAN NOT NULL,
    "erro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoteCertificacao_status_idx" ON "LoteCertificacao"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ItemLote_matriculaId_key" ON "ItemLote"("matriculaId");

-- CreateIndex
CREATE INDEX "ItemLote_loteId_idx" ON "ItemLote"("loteId");

-- CreateIndex
CREATE INDEX "SolicitacaoAlteracao_alunoId_status_idx" ON "SolicitacaoAlteracao"("alunoId", "status");

-- CreateIndex
CREATE INDEX "SolicitacaoAlteracao_status_idx" ON "SolicitacaoAlteracao"("status");

-- CreateIndex
CREATE INDEX "Notificacao_alunoId_criadoEm_idx" ON "Notificacao"("alunoId", "criadoEm");

-- CreateIndex
CREATE INDEX "Notificacao_tipo_referencia_idx" ON "Notificacao"("tipo", "referencia");

-- AddForeignKey
ALTER TABLE "LoteCertificacao" ADD CONSTRAINT "LoteCertificacao_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLote" ADD CONSTRAINT "ItemLote_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LoteCertificacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLote" ADD CONSTRAINT "ItemLote_matriculaId_fkey" FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLote" ADD CONSTRAINT "ItemLote_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoAlteracao" ADD CONSTRAINT "SolicitacaoAlteracao_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoAlteracao" ADD CONSTRAINT "SolicitacaoAlteracao_analisadoPorId_fkey" FOREIGN KEY ("analisadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

