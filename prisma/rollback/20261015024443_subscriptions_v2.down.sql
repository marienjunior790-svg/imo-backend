-- Retour arrière de la migration 20261015024443_subscriptions_v2.
--
-- Ordre obligatoire :
--   1. Restaurer les données : npx tsx scripts/subscriptions-transition.ts --rollback --apply
--      (remet plan / statut / échéance d'origine à partir des colonnes legacy*).
--   2. Redéployer la version précédente du backend.
--   3. Exécuter ce fichier (psql -v ON_ERROR_STOP=1 --single-transaction -f …) : il retire aussi la migration de « _prisma_migrations »,
--      ce qui permet de la rejouer plus tard avec « prisma migrate deploy ».
--
-- Les valeurs ajoutées aux enums (STANDARD, PLUS, PRO_MAX, TRIALING, PAST_DUE, EXPIRED) ne peuvent pas être
-- retirées sans recréer le type. Elles sont laissées en place : inutilisées par l'ancien code, elles sont sans effet.
-- Le contrôle ci-dessous refuse d'aller plus loin si des lignes les utilisent encore.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "subscriptions"
    WHERE "plan" IN ('STANDARD', 'PLUS', 'PRO_MAX') OR "status" IN ('TRIALING', 'PAST_DUE', 'EXPIRED')
  ) OR EXISTS (
    SELECT 1 FROM "organizations"
    WHERE "plan" IN ('STANDARD', 'PLUS', 'PRO_MAX') OR "subscriptionStatus" IN ('TRIALING', 'PAST_DUE', 'EXPIRED')
  ) THEN
    RAISE EXCEPTION 'Des abonnements utilisent encore les nouveaux plans ou statuts : restaurer les données avant ce retour arrière.';
  END IF;
END $$;

DROP TABLE IF EXISTS "trial_claims";
DROP TABLE IF EXISTS "ai_usage";
DROP TABLE IF EXISTS "payment_provider_events";
DROP TABLE IF EXISTS "subscription_events";

DROP INDEX IF EXISTS "subscriptions_externalSubscriptionId_idx";
DROP INDEX IF EXISTS "subscriptions_customerId_idx";
DROP INDEX IF EXISTS "subscriptions_trialEndsAt_idx";

ALTER TABLE "subscriptions"
  DROP COLUMN IF EXISTS "billingPeriod",
  DROP COLUMN IF EXISTS "cancelAtPeriodEnd",
  DROP COLUMN IF EXISTS "cancelledAt",
  DROP COLUMN IF EXISTS "currentPeriodEnd",
  DROP COLUMN IF EXISTS "currentPeriodStart",
  DROP COLUMN IF EXISTS "legacyExpiresAt",
  DROP COLUMN IF EXISTS "legacyPlan",
  DROP COLUMN IF EXISTS "legacyStatus",
  DROP COLUMN IF EXISTS "trialEndsAt",
  DROP COLUMN IF EXISTS "trialStartedAt";

DROP TYPE IF EXISTS "BillingPeriod";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261015024443_subscriptions_v2';
