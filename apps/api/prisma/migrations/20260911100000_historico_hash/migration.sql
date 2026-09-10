-- Impressão digital do conteúdo do histórico (evita regerar o PDF sem mudança)
ALTER TABLE "Matricula" ADD COLUMN "historicoHash" TEXT;
