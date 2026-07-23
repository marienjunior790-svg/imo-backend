/**
 * P3 — héritage RBAC.
 * Règle d'or : ORG_ADMIN ⊇ MANAGER ⊇ AGENT (capacités opérationnelles).
 */
import { ALL_PERMISSION_KEYS } from './permission-catalog.js';

export const SYSTEM_ROLES = [
  'SUPER_ADMIN',
  'ORG_ADMIN',
  'AGENT',
  'TENANT',
  'TECHNICIAN',
  'ACCOUNTANT',
  'MANAGER',
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
];

/** Agent — opérations immobilières quotidiennes. */
const AGENT: string[] = [
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
];

/** Manager = Agent sans DELETE + pilotage léger. */
const MANAGER = uniq([
  ...AGENT.filter((k) => !k.includes('DELETE')),
  'REVENUE_VIEW',
  'SUBSCRIPTION_MANAGE',
  'AUDIT_VIEW',
  'USER_VIEW',
  'USER_CREATE',
]);

/** Owner / ORG_ADMIN = Manager ∪ Agent ∪ admin org (héritage strict). */
const ORG_ADMIN = uniq([...OWNER_ADMIN, ...MANAGER, ...AGENT]);

export const ROLE_PERMISSION_MATRIX: Record<SystemRole, string[] | 'ALL'> = {
  SUPER_ADMIN: 'ALL',
  ORG_ADMIN,
  AGENT,
  TENANT: [
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
    'AI_USE',
    'AI_CHAT',
  ],
  TECHNICIAN: [
    'TECH_HOME_VIEW',
    'TECH_JOBS_VIEW',
    'TECH_JOBS_MANAGE',
    'TECH_CALENDAR_VIEW',
    'TECH_HISTORY_VIEW',
    'MAINTENANCE_VIEW',
    'MAINTENANCE_CLOSE',
    'NOTIFICATION_VIEW',
    'NOTIFICATION_CENTER_VIEW',
    'MESSAGE_VIEW',
    'SETTINGS_VIEW',
  ],
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
  MANAGER,
  MAINTENANCE_LEAD: [
    'DASHBOARD_VIEW',
    'MAINTENANCE_VIEW',
    'MAINTENANCE_CREATE',
    'MAINTENANCE_EDIT',
    'MAINTENANCE_ASSIGN',
    'MAINTENANCE_CLOSE',
    'TECH_JOBS_VIEW',
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

/** Vérifie Owner ⊇ Manager ⊇ Agent (tests / invariants). */
export function assertOrgHierarchy(): { ok: boolean; missing: string[] } {
  const owner = new Set(resolveRolePermissions('ORG_ADMIN'));
  const manager = resolveRolePermissions('MANAGER');
  const agent = resolveRolePermissions('AGENT');
  const missing: string[] = [];
  for (const k of manager) if (!owner.has(k)) missing.push(`ORG_ADMIN missing MANAGER:${k}`);
  for (const k of agent) if (!owner.has(k)) missing.push(`ORG_ADMIN missing AGENT:${k}`);
  const managerSet = new Set(manager);
  for (const k of agent.filter((x) => !x.includes('DELETE'))) {
    if (!managerSet.has(k)) missing.push(`MANAGER missing AGENT:${k}`);
  }
  return { ok: missing.length === 0, missing };
}
