-- Rollback T1 tenant portal access (manuel — ne pas appliquer via migrate down auto)
-- Prérequis : aucun User avec email IS NULL (sinon restaurer NOT NULL échoue)

-- 1) Retirer contrainte CHECK
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_or_login_id";

-- 2) Remplir email manquants avant NOT NULL (ex. synthétique) si besoin :
-- UPDATE "users" SET email = lower("loginId") || '@void.local' WHERE email IS NULL;

-- 3) Restaurer email NOT NULL
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;

-- 4) Drop colonnes
DROP INDEX IF EXISTS "users_portalStatus_idx";
DROP INDEX IF EXISTS "users_loginId_key";
ALTER TABLE "users" DROP COLUMN IF EXISTS "portalStatus";
ALTER TABLE "users" DROP COLUMN IF EXISTS "passwordChangedAt";
ALTER TABLE "users" DROP COLUMN IF EXISTS "tempPasswordSetAt";
ALTER TABLE "users" DROP COLUMN IF EXISTS "mustChangePassword";
ALTER TABLE "users" DROP COLUMN IF EXISTS "loginId";

ALTER TABLE "organizations" DROP COLUMN IF EXISTS "portalAccess";

DROP TYPE IF EXISTS "PortalAccessStatus";
