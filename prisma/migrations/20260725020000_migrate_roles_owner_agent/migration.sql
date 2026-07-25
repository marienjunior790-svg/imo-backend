-- P6 rôles — étape 2/2 : bascule des données vers les rôles canoniques.
--
--   ORG_ADMIN  → OWNER    (propriétaire / agence)
--   AGENT      → MANAGER  (ancien « agent immobilier » = gestion locative)
--   TECHNICIAN → AGENT    (nouveau sens : agent de maintenance)
--
-- L'ordre est important : AGENT est libéré avant d'y basculer les techniciens.
-- ORG_ADMIN et TECHNICIAN restent dans l'enum et sont normalisés au runtime
-- (shared/auth/roles.ts) pour les JWT et comptes non migrés.

-- 1) Ancien agent immobilier → gestionnaire locatif
UPDATE "users" SET "role" = 'MANAGER' WHERE "role" = 'AGENT';
UPDATE "memberships" SET "role" = 'MANAGER' WHERE "role" = 'AGENT';
UPDATE "invitations" SET "role" = 'MANAGER' WHERE "role" = 'AGENT' AND "acceptedAt" IS NULL;

-- 2) Technicien → agent de maintenance
UPDATE "users" SET "role" = 'AGENT' WHERE "role" = 'TECHNICIAN';
UPDATE "memberships" SET "role" = 'AGENT' WHERE "role" = 'TECHNICIAN';
UPDATE "invitations" SET "role" = 'AGENT' WHERE "role" = 'TECHNICIAN' AND "acceptedAt" IS NULL;

-- 3) Admin organisation → propriétaire
UPDATE "users" SET "role" = 'OWNER' WHERE "role" = 'ORG_ADMIN';
UPDATE "memberships" SET "role" = 'OWNER' WHERE "role" = 'ORG_ADMIN';
UPDATE "invitations" SET "role" = 'OWNER' WHERE "role" = 'ORG_ADMIN' AND "acceptedAt" IS NULL;

-- 4) Privilège minimal par défaut : un rôle opérationnel est toujours attribué explicitement.
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'TENANT';

-- 5) La matrice RBAC de AGENT change de métier : purge des anciens octrois,
--    RbacService.seed() reconstruit la matrice au démarrage.
DELETE FROM "rbac_role_permissions" WHERE "role" IN ('AGENT', 'ORG_ADMIN', 'TECHNICIAN');
