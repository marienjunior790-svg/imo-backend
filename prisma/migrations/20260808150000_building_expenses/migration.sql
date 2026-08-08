-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('MAINTENANCE', 'REPAIR', 'ELECTRICITY', 'WATER', 'CLEANING', 'SECURITY', 'INSURANCE', 'TAX', 'WORKS', 'OTHER');

-- AlterTable
ALTER TABLE "maintenance_tickets" ADD COLUMN IF NOT EXISTS "estimatedCost" DECIMAL(12,0);
ALTER TABLE "maintenance_tickets" ADD COLUMN IF NOT EXISTS "actualCost" DECIMAL(12,0);

-- CreateTable
CREATE TABLE "building_expenses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "apartmentId" TEXT,
    "maintenanceTicketId" TEXT,
    "amount" DECIMAL(12,0) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "incurredAt" DATE NOT NULL,
    "description" TEXT,
    "vendor" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "building_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "building_expenses_organizationId_buildingId_idx" ON "building_expenses"("organizationId", "buildingId");
CREATE INDEX "building_expenses_organizationId_incurredAt_idx" ON "building_expenses"("organizationId", "incurredAt");
CREATE INDEX "building_expenses_buildingId_category_idx" ON "building_expenses"("buildingId", "category");

-- AddForeignKey
ALTER TABLE "building_expenses" ADD CONSTRAINT "building_expenses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "building_expenses" ADD CONSTRAINT "building_expenses_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "building_expenses" ADD CONSTRAINT "building_expenses_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "apartments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "building_expenses" ADD CONSTRAINT "building_expenses_maintenanceTicketId_fkey" FOREIGN KEY ("maintenanceTicketId") REFERENCES "maintenance_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "building_expenses" ADD CONSTRAINT "building_expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
