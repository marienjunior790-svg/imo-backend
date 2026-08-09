import { UserRole } from '@prisma/client';

/**
 * Hiérarchie métier ITC (entreprise de gestion immobilière) :
 *
 *   OWNER    = boss / supervision (pilotage, équipe, config, vue globale)
 *   MANAGER  = agent gestionnaire / chef de service (opérations quotidiennes)
 *   AGENT    = agent de maintenance / terrain (interventions assignées uniquement)
 *   TENANT   = locataire (portail personnel)
 *
 * Ne pas confondre rôle utilisateur (OWNER/MANAGER/AGENT/TENANT)
 * et type d’organisation (AGENCY | OWNER dans Organization.type).
 *
 * ORG_ADMIN et TECHNICIAN restent des alias legacy normalisés ici.
 */
export const LEGACY_ROLE_ALIASES: Readonly<Record<string, UserRole>> = {
  ORG_ADMIN: UserRole.OWNER,
  TECHNICIAN: UserRole.AGENT,
};

export function normalizeRole(role: UserRole | string | null | undefined): UserRole {
  const raw = String(role ?? '').trim().toUpperCase();
  return LEGACY_ROLE_ALIASES[raw] ?? (raw as UserRole);
}

/** Propriétaire — inclut l'alias legacy pour les gardes qui comparent la valeur brute. */
export const OWNER_ROLES: UserRole[] = [UserRole.OWNER, UserRole.ORG_ADMIN];

/** Staff organisation autorisé sur l'ERP (immeubles, baux, paiements, rapports). */
export const ORG_STAFF_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.ORG_ADMIN,
  UserRole.MANAGER,
  UserRole.ACCOUNTANT,
];

/** Encadrement locatif — décisions sur les locataires et leurs accès portail. */
export const LETTING_MANAGER_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.ORG_ADMIN,
  UserRole.MANAGER,
];

/** Maintenance terrain — ne gère ni loyers, ni contrats, ni immeubles. */
export const MAINTENANCE_ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.TECHNICIAN,
  UserRole.MAINTENANCE_LEAD,
];

/** Destinataires des notifications d'exploitation (nouveau ticket, candidature…). */
export const ORG_NOTIFY_ROLES: UserRole[] = LETTING_MANAGER_ROLES;

function has(roles: UserRole[], role: UserRole | string | null | undefined): boolean {
  return roles.includes(normalizeRole(role));
}

export const isPlatformAdmin = (role: UserRole | string | null | undefined): boolean =>
  normalizeRole(role) === UserRole.SUPER_ADMIN;

export const isOwner = (role: UserRole | string | null | undefined): boolean =>
  normalizeRole(role) === UserRole.OWNER;

export const isTenant = (role: UserRole | string | null | undefined): boolean =>
  normalizeRole(role) === UserRole.TENANT;

/** Administration de l'organisation : propriétaire ou super admin. */
export const isOrgAdminLevel = (role: UserRole | string | null | undefined): boolean =>
  isOwner(role) || isPlatformAdmin(role);

export const isLettingManager = (role: UserRole | string | null | undefined): boolean =>
  has(LETTING_MANAGER_ROLES, role) || isPlatformAdmin(role);

export const isOrgStaff = (role: UserRole | string | null | undefined): boolean =>
  has(ORG_STAFF_ROLES, role) || isPlatformAdmin(role);

export const isMaintenanceAgent = (role: UserRole | string | null | undefined): boolean =>
  has(MAINTENANCE_ROLES, role);

/** Libellé produit exposé aux clients (mobile / web) — hiérarchie Boss / Gestionnaire / Terrain / Locataire. */
export function roleLabel(role: UserRole | string | null | undefined): string {
  switch (normalizeRole(role)) {
    case UserRole.SUPER_ADMIN:
      return 'Administrateur plateforme';
    case UserRole.OWNER:
      return 'Propriétaire (supervision)';
    case UserRole.MANAGER:
      return 'Agent gestionnaire';
    case UserRole.AGENT:
      return 'Agent terrain (maintenance)';
    case UserRole.ACCOUNTANT:
      return 'Comptable';
    case UserRole.TENANT:
      return 'Locataire';
    case UserRole.MAINTENANCE_LEAD:
      return 'Responsable maintenance';
    default:
      return String(role ?? '');
  }
}

/** Rôle « centre de gravité opérationnel » (chef de service). */
export const isOpsManager = (role: UserRole | string | null | undefined): boolean =>
  normalizeRole(role) === UserRole.MANAGER;
