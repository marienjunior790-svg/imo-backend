import { UserRole } from '@prisma/client';

/**
 * P6 — rôles canoniques ITC.
 *
 *   OWNER       propriétaire / agence — pilotage complet
 *   MANAGER     gestion locative (baux, paiements, candidatures)
 *   AGENT       agent de maintenance — interventions terrain
 *   TENANT      locataire — portail personnel
 *   SUPER_ADMIN plateforme (inchangé)
 *
 * ORG_ADMIN et TECHNICIAN restent des valeurs valides en base : ils sont normalisés
 * ici pour que les JWT émis avant la migration et les comptes non basculés continuent
 * de fonctionner. Toute comparaison de rôle doit passer par ce module.
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

/** Libellé produit exposé aux clients (mobile / web). */
export function roleLabel(role: UserRole | string | null | undefined): string {
  switch (normalizeRole(role)) {
    case UserRole.SUPER_ADMIN:
      return 'Administrateur plateforme';
    case UserRole.OWNER:
      return 'Propriétaire / Agence';
    case UserRole.MANAGER:
      return 'Gestionnaire locatif';
    case UserRole.AGENT:
      return 'Agent de maintenance';
    case UserRole.ACCOUNTANT:
      return 'Comptable';
    case UserRole.TENANT:
      return 'Locataire';
    default:
      return String(role ?? '');
  }
}
