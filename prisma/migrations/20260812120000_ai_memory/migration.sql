-- Phase C — Mémoire intelligente ITC (additive, IF NOT EXISTS)

DO $$ BEGIN
  CREATE TYPE "AiMemoryScope" AS ENUM ('USER', 'ORGANIZATION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AiMemoryKind" AS ENUM ('PREFERENCE', 'FACT', 'HABIT', 'DECISION', 'CONTEXT', 'NOTE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AiMemorySource" AS ENUM ('EXPLICIT', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ai_memory_entries" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT,
  "scope" "AiMemoryScope" NOT NULL,
  "kind" "AiMemoryKind" NOT NULL DEFAULT 'FACT',
  "key" TEXT,
  "content" TEXT NOT NULL,
  "source" "AiMemorySource" NOT NULL DEFAULT 'EXPLICIT',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_memory_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ai_session_contexts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionKey" TEXT NOT NULL,
  "entitiesJson" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_session_contexts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_memory_entries_organizationId_scope_idx"
  ON "ai_memory_entries"("organizationId", "scope");
CREATE INDEX IF NOT EXISTS "ai_memory_entries_organizationId_userId_idx"
  ON "ai_memory_entries"("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "ai_memory_entries_organizationId_key_idx"
  ON "ai_memory_entries"("organizationId", "key");

CREATE UNIQUE INDEX IF NOT EXISTS "ai_session_contexts_organizationId_userId_sessionKey_key"
  ON "ai_session_contexts"("organizationId", "userId", "sessionKey");
CREATE INDEX IF NOT EXISTS "ai_session_contexts_expiresAt_idx"
  ON "ai_session_contexts"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "ai_memory_entries" ADD CONSTRAINT "ai_memory_entries_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ai_memory_entries" ADD CONSTRAINT "ai_memory_entries_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ai_memory_entries" ADD CONSTRAINT "ai_memory_entries_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ai_memory_entries" ADD CONSTRAINT "ai_memory_entries_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ai_session_contexts" ADD CONSTRAINT "ai_session_contexts_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ai_session_contexts" ADD CONSTRAINT "ai_session_contexts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
