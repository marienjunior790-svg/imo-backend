-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MessageChannel" AS ENUM ('IN_APP', 'WHATSAPP', 'EMAIL', 'SMS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MessageDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DELIVERED', 'READ');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable messages (additive, non-breaking)
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "channel" "MessageChannel" NOT NULL DEFAULT 'IN_APP';
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "deliveryStatus" "MessageDeliveryStatus" NOT NULL DEFAULT 'DELIVERED';
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "error" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "toPhone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "messages_providerMessageId_key" ON "messages"("providerMessageId");
CREATE INDEX IF NOT EXISTS "messages_organizationId_channel_idx" ON "messages"("organizationId", "channel");
CREATE INDEX IF NOT EXISTS "messages_tenantId_idx" ON "messages"("tenantId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
