-- Stockage des fichiers en base quand Cloudinary n'est pas configuré

CREATE TABLE IF NOT EXISTS "stored_files" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "folder" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "stored_files_token_key" ON "stored_files"("token");

CREATE UNIQUE INDEX IF NOT EXISTS "stored_files_folder_fileName_key" ON "stored_files"("folder", "fileName");
