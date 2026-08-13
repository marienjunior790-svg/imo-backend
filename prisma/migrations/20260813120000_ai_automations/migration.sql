-- Phase H — Intelligent automations ITC (additive, IF NOT EXISTS)

DO $$ BEGIN
  CREATE TYPE "AiAutomationKind" AS ENUM (
    'OUTSTANDING_REMINDER',
    'LEASE_EXPIRY_REMINDER',
    'MAINTENANCE_ASSIGN_TASK',
    'ANOMALY_ACTION'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AiAutomationRunStatus" AS ENUM (
    'DETECTED',
    'PROPOSED',
    'APPROVED',
    'EXECUTING',
    'SUCCEEDED',
    'PARTIAL',
    'FAILED',
    'CANCELLED',
    'SKIPPED_DUPLICATE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ai_automation_rules" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind" "AiAutomationKind" NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "autoExecute" BOOLEAN NOT NULL DEFAULT false,
  "config" JSONB,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_automation_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ai_automation_runs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ruleId" TEXT,
  "kind" "AiAutomationKind" NOT NULL,
  "status" "AiAutomationRunStatus" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "detectionJson" JSONB,
  "proposalJson" JSONB,
  "resultJson" JSONB,
  "error" TEXT,
  "proposedById" TEXT,
  "approvedById" TEXT,
  "executedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_automation_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_automation_rules_organizationId_kind_name_key"
  ON "ai_automation_rules"("organizationId", "kind", "name");
CREATE INDEX IF NOT EXISTS "ai_automation_rules_organizationId_kind_enabled_idx"
  ON "ai_automation_rules"("organizationId", "kind", "enabled");

CREATE UNIQUE INDEX IF NOT EXISTS "ai_automation_runs_organizationId_idempotencyKey_key"
  ON "ai_automation_runs"("organizationId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "ai_automation_runs_organizationId_kind_status_createdAt_idx"
  ON "ai_automation_runs"("organizationId", "kind", "status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ai_automation_rules" ADD CONSTRAINT "ai_automation_rules_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ai_automation_rules" ADD CONSTRAINT "ai_automation_rules_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ai_automation_runs" ADD CONSTRAINT "ai_automation_runs_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ai_automation_runs" ADD CONSTRAINT "ai_automation_runs_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "ai_automation_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ai_automation_runs" ADD CONSTRAINT "ai_automation_runs_proposedById_fkey"
    FOREIGN KEY ("proposedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ai_automation_runs" ADD CONSTRAINT "ai_automation_runs_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
