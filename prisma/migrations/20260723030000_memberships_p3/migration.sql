-- P3: Memberships (Identity cutover — dual-write with User.role)
CREATE TABLE IF NOT EXISTS "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_userId_organizationId_key" ON "memberships"("userId", "organizationId");
CREATE INDEX IF NOT EXISTS "memberships_userId_idx" ON "memberships"("userId");
CREATE INDEX IF NOT EXISTS "memberships_organizationId_idx" ON "memberships"("organizationId");
CREATE INDEX IF NOT EXISTS "memberships_role_idx" ON "memberships"("role");

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1:1 depuis User (orgs + plateforme SUPER_ADMIN)
INSERT INTO "memberships" ("id", "userId", "organizationId", "role", "isActive", "isPrimary", "createdAt", "updatedAt")
SELECT
  'mem_' || u."id",
  u."id",
  u."organizationId",
  u."role",
  u."isActive",
  true,
  NOW(),
  NOW()
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "memberships" m
  WHERE m."userId" = u."id"
    AND (
      (m."organizationId" IS NULL AND u."organizationId" IS NULL)
      OR m."organizationId" = u."organizationId"
    )
);
