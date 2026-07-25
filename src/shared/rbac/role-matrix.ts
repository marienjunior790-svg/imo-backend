/**
 * P6 — héritage RBAC.
 * Règle d'or côté locatif : OWNER ⊇ MANAGER ⊇ LETTING_OPS.
 * AGENT est un rôle terrain disjoint (maintenance uniquement), TENANT un rôle portail.
 */
import { ALL_PERMISSION_KEYS } from './permission-catalog.js';

export const SYSTEM_ROLES = [
  'SUPER_ADMIN',
  'OWNER',
  'MANAGER',
  'AGENT',
  'TENANT',
  'ACCOUNTANT',
  // Alias legacy — même matrice que leur rôle canonique (cf. shared/auth/roles.ts)
  'ORG_ADMIN',
  'TECHNICIAN',
  'MAINTENANCE_LEAD',
  'VISITOR',
  'SUPPORT',
  'SYSTEM_BOT',
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

function uniq(keys: string[]): string[] {
  return [...new Set(keys)];
}

/** Capacités admin org (users, audit, abonnement, exports). */
const OWNER_ADMIN: string[] = [
  'REVENUE_VIEW',
  'REVENUE_EXPORT',
  'PAYMENT_EXPORT',
  'PAYMENT_EXPORT_EXCEL',
  'SUBSCRIPTION_MANAGE',
  'AUDIT_VIEW',
  'AUDIT_EXPORT',
  'USER_VIEW',
  'USER_CREATE',
  'USER_EDIT',
  'USER_DELETE',
  'TENANT_PORTAL_RESET',
  'TENANT_PORTAL_SUSPEND',
  'SETTINGS_EDIT',
];

/** Opérations locatives quotidiennes (socle MANAGER / OWNER). */
const LETTING_OPS: string[] = [
  'DASHBOARD_VIEW',
  'BUILDING_VIEW',
  'BUILDING_CREATE',
  'BUILDING_EDIT',
  'APARTMENT_VIEW',
  'APARTMENT_CREATE',
  'APARTMENT_EDIT',
  'APARTMENT_DELETE',
  'TENANT_VIEW',
  'TENANT_CREATE',
  'TENANT_EDIT',
  'LEASE_VIEW',
  'LEASE_CREATE',
  'LEASE_EDIT',
  'LEASE_SIGN',
  'LEASE_RENEW',
  'LEASE_TERMINATE',
  'LEASE_EXPORT_PDF',
  'APPLICATION_VIEW',
  'APPLICATION_APPROVE',
  'APPLICATION_REJECT',
  'APPLICATION_SCORE',
  'INSPECTION_VIEW',
  'INSPECTION_CREATE',
  'INSPECTION_EDIT',
  'INSPECTION_SIGN',
  'MAINTENANCE_VIEW',
  'MAINTENANCE_CREATE',
  'MAINTENANCE_EDIT',
  'MAINTENANCE_ASSIGN',
  'MAINTENANCE_CLOSE',
  'PAYMENT_VIEW',
  'PAYMENT_CREATE',
  'PAYMENT_VALIDATE',
  'PAYMENT_EXPORT_PDF',
  'REPORT_VIEW',
  'REPORT_EXPORT',
  'LISTING_VIEW',
  'LISTING_CREATE',
  'LISTING_EDIT',
  'DOCUMENT_VIEW',
  'DOCUMENT_CREATE',
  'NOTIFICATION_VIEW',
  'NOTIFICATION_CENTER_VIEW',
  'MESSAGE_VIEW',
  'MESSAGE_SEND',
  'REMINDER_VIEW',
  'REMINDER_SEND',
  'TASK_VIEW',
  'TASK_CREATE',
  'TASK_COMPLETE',
  'AI_USE',
  'AI_CHAT',
  'AI_ANALYZE',
  'SETTINGS_VIEW',
  'TENANT_PORTAL_PROVISION',
  'TENANT_PORTAL_REGENERATE',
  'TENANT_PORTAL_VIEW_STATUS',
];

/** Manager = opérations locatives sans suppression + pilotage léger. */
const MANAGER = uniq([
  ...LETTING_OPS.filter((k) => !k.includes('DELETE')),
  'REVENUE_VIEW',
  'SUBSCRIPTION_MANAGE',
  'AUDIT_VIEW',
  'USER_VIEW',
  'USER_CREATE',
  'TENANT_PORTAL_RESET',
  'TENANT_PORTAL_SUSPEND',
]);

/** Owner = Manager ∪ opérations locatives ∪ admin org (héritage strict). */
const OWNER = uniq([...OWNER_ADMIN, ...MANAGER, ...LETTING_OPS]);

/**
 * Agent de maintenance — interventions qui lui sont assignées.
 * Aucun accès loyers / contrats / immeubles / finances.
 */
const MAINTENANCE_AGENT: string[] = [
  'TECH_HOME_VIEW',
  'TECH_JOBS_VIEW',
  'TECH_JOBS_MANAGE',
  'TECH_JOBS_COMMENT',
  'TECH_PHOTO_UPLOAD',
  'TECH_CALENDAR_VIEW',
  'TECH_HISTORY_VIEW',
  'MAINTENANCE_VIEW',
  'MAINTENANCE_CLOSE',
  'NOTIFICATION_VIEW',
  'NOTIFICATION_CENTER_VIEW',
  'MESSAGE_VIEW',
  'SETTINGS_VIEW',
  'PROFILE_VIEW',
];

/** Locataire — portail personnel uniquement. */
const TENANT: string[] = [
  'PORTAL_HOME_VIEW',
  'PORTAL_HOMES_VIEW',
  'PORTAL_LEASE_VIEW',
  'PORTAL_PAYMENTS_VIEW',
  'PORTAL_MAINTENANCE_VIEW',
  'PORTAL_MAINTENANCE_CREATE',
  'APPLICATION_SUBMIT',
  'APPLICATION_WITHDRAW',
  'APPLICATION_VIEW',
  'LISTING_VIEW',
  'NOTIFICATION_VIEW',
  'NOTIFICATION_CENTER_VIEW',
  'MESSAGE_VIEW',
  'SETTINGS_VIEW',
  'PROFILE_VIEW',
  'AI_USE',
  'AI_CHAT',
];

export const ROLE_PERMISSION_MATRIX: Record<SystemRole, string[] | 'ALL'> = {
  SUPER_ADMIN: 'ALL',
  OWNER,
  MANAGER,
  AGENT: MAINTENANCE_AGENT,
  TENANT,
  ACCOUNTANT: [
    'DASHBOARD_VIEW',
    'PAYMENT_VIEW',
    'PAYMENT_VALIDATE',
    'PAYMENT_EXPORT',
    'PAYMENT_EXPORT_EXCEL',
    'PAYMENT_EXPORT_PDF',
    'REVENUE_VIEW',
    'REVENUE_EXPORT',
    'REPORT_VIEW',
    'REPORT_EXPORT',
    'NOTIFICATION_CENTER_VIEW',
    'SETTINGS_VIEW',
  ],
  ORG_ADMIN: OWNER,
  TECHNICIAN: MAINTENANCE_AGENT,
  MAINTENANCE_LEAD: [
    'DASHBOARD_VIEW',
    'MAINTENANCE_VIEW',
    'MAINTENANCE_CREATE',
    'MAINTENANCE_EDIT',
    'MAINTENANCE_ASSIGN',
    'MAINTENANCE_CLOSE',
    'TECH_HOME_VIEW',
    'TECH_JOBS_VIEW',
    'TECH_JOBS_MANAGE',
    'TECH_JOBS_COMMENT',
    'TECH_PHOTO_UPLOAD',
    'TECH_HISTORY_VIEW',
    'INSPECTION_VIEW',
    'INSPECTION_CREATE',
    'NOTIFICATION_CENTER_VIEW',
    'SETTINGS_VIEW',
  ],
  VISITOR: ['DASHBOARD_VIEW', 'BUILDING_VIEW', 'APARTMENT_VIEW', 'REPORT_VIEW'],
  SUPPORT: [
    'PLATFORM_DASHBOARD_VIEW',
    'PLATFORM_ORG_VIEW',
    'PLATFORM_USER_VIEW',
    'USER_VIEW',
    'NOTIFICATION_CENTER_VIEW',
    'MESSAGE_VIEW',
    'MESSAGE_SEND',
  ],
  SYSTEM_BOT: ['WORKFLOW_EDIT', 'AI_USE', 'REMINDER_SEND', 'AI_SCORE'],
};

export function resolveRolePermissions(role: string): string[] {
  const entry = ROLE_PERMISSION_MATRIX[role as SystemRole];
  if (!entry) return [];
  if (entry === 'ALL') return [...ALL_PERMISSION_KEYS];
  return entry;
}

/** Vérifie Owner ⊇ Manager ⊇ opérations locatives (tests / invariants). */
export function assertOrgHierarchy(): { ok: boolean; missing: string[] } {
  const owner = new Set(resolveRolePermissions('OWNER'));
  const manager = resolveRolePermissions('MANAGER');
  const missing: string[] = [];
  for (const k of manager) if (!owner.has(k)) missing.push(`OWNER missing MANAGER:${k}`);
  for (const k of LETTING_OPS) if (!owner.has(k)) missing.push(`OWNER missing LETTING:${k}`);
  const managerSet = new Set(manager);
  for (const k of LETTING_OPS.filter((x) => !x.includes('DELETE'))) {
    if (!managerSet.has(k)) missing.push(`MANAGER missing LETTING:${k}`);
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Cloisonnement métier : l'agent de maintenance ne doit porter aucune permission
 * loyers / contrats / immeubles / finances.
 */
export function assertMaintenanceIsolation(): { ok: boolean; leaked: string[] } {
  const forbiddenPrefixes = ['PAYMENT_', 'LEASE_', 'BUILDING_', 'APARTMENT_', 'REVENUE_', 'REPORT_', 'TENANT_', 'BILLING_', 'SUBSCRIPTION_'];
  const leaked = resolveRolePermissions('AGENT').filter((k) =>
    forbiddenPrefixes.some((p) => k.startsWith(p)),
  );
  return { ok: leaked.length === 0, leaked };
}
