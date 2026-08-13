-- Phase I — Persist AI pending actions (multi-instance Railway safety)

CREATE TABLE IF NOT EXISTS "ai_pending_actions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_pending_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_pending_actions_organizationId_userId_createdAt_idx"
  ON "ai_pending_actions"("organizationId", "userId", "createdAt");

CREATE INDEX IF NOT EXISTS "ai_pending_actions_expiresAt_idx"
  ON "ai_pending_actions"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "ai_pending_actions" ADD CONSTRAINT "ai_pending_actions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ai_pending_actions" ADD CONSTRAINT "ai_pending_actions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
