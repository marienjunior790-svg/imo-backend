-- P6 rôles — étape 1/2 : nouvelles valeurs d'enum + colonnes.
-- PostgreSQL interdit d'UTILISER une valeur d'enum dans la transaction qui l'ajoute :
-- la bascule des données est donc dans la migration 20260725020000_migrate_roles_owner_agent.

-- 1) OWNER (propriétaire / agence) rejoint UserRole. ORG_ADMIN reste en base comme alias legacy.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'OWNER';

-- 2) Photos avant / après d'intervention (portail agent de maintenance)
ALTER TYPE "MaintenanceEventType" ADD VALUE IF NOT EXISTS 'PHOTO_ADDED';

ALTER TABLE "maintenance_tickets" ADD COLUMN IF NOT EXISTS "photos" JSONB;
