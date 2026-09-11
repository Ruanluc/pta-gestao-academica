-- AlterTable
ALTER TABLE "ItemLote" ADD COLUMN     "observacao" TEXT;

-- AlterTable
ALTER TABLE "LoteCertificacao" ADD COLUMN     "certificadoraId" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "certificadoraId" TEXT;

-- CreateTable
CREATE TABLE "Certificadora" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certificadora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Certificadora_nome_key" ON "Certificadora"("nome");

-- CreateIndex
CREATE INDEX "LoteCertificacao_certificadoraId_idx" ON "LoteCertificacao"("certificadoraId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_certificadoraId_fkey" FOREIGN KEY ("certificadoraId") REFERENCES "Certificadora"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoteCertificacao" ADD CONSTRAINT "LoteCertificacao_certificadoraId_fkey" FOREIGN KEY ("certificadoraId") REFERENCES "Certificadora"("id") ON DELETE SET NULL ON UPDATE CASCADE;

