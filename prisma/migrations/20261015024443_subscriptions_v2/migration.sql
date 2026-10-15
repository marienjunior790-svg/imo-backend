-- Abonnements Standard / Pro / Plus / Pro Max — migration additive uniquement :
-- nouvelles valeurs d'enum, colonnes facultatives et nouvelles tables. Aucune donnée existante n'est modifiée.
-- Retour arrière : prisma/rollback/20261015024443_subscriptions_v2.down.sql

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'ANNUAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


-- IF NOT EXISTS : les valeurs survivent à un retour arrière, la migration doit pouvoir être rejouée.
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'STANDARD';
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'PLUS';
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'PRO_MAX';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIALING';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAST_DUE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "billingPeriod" "BillingPeriod",
ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "currentPeriodStart" TIMESTAMP(3),
ADD COLUMN     "legacyExpiresAt" TIMESTAMP(3),
ADD COLUMN     "legacyPlan" "SubscriptionPlan",
ADD COLUMN     "legacyStatus" "SubscriptionStatus",
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "trialStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "type" TEXT NOT NULL,
    "fromPlan" "SubscriptionPlan",
    "toPlan" "SubscriptionPlan",
    "fromStatus" "SubscriptionStatus",
    "toStatus" "SubscriptionStatus",
    "source" TEXT NOT NULL,
    "actorUserId" TEXT,
    "externalRef" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_provider_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "organizationId" TEXT,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_claims" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "valueHash" TEXT NOT NULL,
    "organizationId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'signup',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_events_organizationId_createdAt_idx" ON "subscription_events"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "subscription_events_type_idx" ON "subscription_events"("type");

-- CreateIndex
CREATE INDEX "payment_provider_events_organizationId_idx" ON "payment_provider_events"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_events_provider_eventId_key" ON "payment_provider_events"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_organizationId_unit_periodStart_key" ON "ai_usage"("organizationId", "unit", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "trial_claims_kind_valueHash_key" ON "trial_claims"("kind", "valueHash");

-- CreateIndex
CREATE INDEX "subscriptions_externalSubscriptionId_idx" ON "subscriptions"("externalSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_customerId_idx" ON "subscriptions"("customerId");

-- CreateIndex
CREATE INDEX "subscriptions_trialEndsAt_idx" ON "subscriptions"("trialEndsAt");

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
