-- Nome do curso no título do histórico (modelo da certificadora)
ALTER TABLE "Turma" ADD COLUMN "curso" TEXT;

-- Exportação manual da pasta do aluno para o Google Drive
ALTER TABLE "Aluno" ADD COLUMN "driveExportadoEm" TIMESTAMP(3);
ALTER TABLE "Documento" ADD COLUMN "driveFileId" TEXT;
ALTER TABLE "Matricula" ADD COLUMN "historicoDriveFileId" TEXT;
