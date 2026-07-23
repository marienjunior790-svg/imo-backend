-- P1: Organization onboarding engine (JSON progress)
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "onboarding" JSONB;
