-- Spec locataire v1.0 — T1 portal access (ordre verrouillé CTO)
-- Prisma mappe camelCase : loginId, mustChangePassword, …

-- 1) Enum statut compte
CREATE TYPE "PortalAccessStatus" AS ENUM (
  'PROVISIONED',
  'INVITE_SENT',
  'ACTIVATED',
  'SUSPENDED',
  'ARCHIVED'
);

-- 2) Colonnes users (avant d'assouplir email)
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "portalAccess" JSONB;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "loginId" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tempPasswordSetAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "portalStatus" "PortalAccessStatus";

CREATE UNIQUE INDEX IF NOT EXISTS "users_loginId_key" ON "users"("loginId");
CREATE INDEX IF NOT EXISTS "users_portalStatus_idx" ON "users"("portalStatus");

-- 3) email nullable (après colonnes loginId prêtes)
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- 4) Invariant : au moins un identifiant
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_or_login_id";
ALTER TABLE "users" ADD CONSTRAINT "users_email_or_login_id"
  CHECK ("email" IS NOT NULL OR "loginId" IS NOT NULL);

-- 5) tenants.userId NOT NULL — HORS T1
-- À appliquer seulement après backfill des CRM liées (phase post-données).
-- Voir docs/identity-tenant-provisioning-v1.md § T1.5
