import { SubscriptionPlan } from '@prisma/client';

/** Catalogue modules produit (P3) — activés selon le plan. */
export type ModuleKey = 'core' | 'payments' | 'maintenance' | 'accounting' | 'portal' | 'platform';

export type ModuleDef = {
  key: ModuleKey;
  label: string;
  description: string;
};

export const MODULE_CATALOG: ModuleDef[] = [
  { key: 'core', label: 'Cœur', description: 'Org, biens, locataires, contrats' },
  { key: 'payments', label: 'Paiements', description: 'Encaissements et retards' },
  { key: 'maintenance', label: 'Maintenance', description: 'Tickets et techniciens' },
  { key: 'accounting', label: 'Comptabilité', description: 'Exports et vue finance' },
  { key: 'portal', label: 'Portail locataire', description: 'Espace locataire' },
  { key: 'platform', label: 'Plateforme ITC', description: 'Console équipe ITC' },
];

const PLAN_MODULES: Record<SubscriptionPlan, ModuleKey[]> = {
  STARTER: ['core', 'payments', 'portal'],
  PRO: ['core', 'payments', 'maintenance', 'portal'],
  ENTERPRISE: ['core', 'payments', 'maintenance', 'accounting', 'portal'],
};

export function resolveModulesForPlan(plan: SubscriptionPlan | string | null | undefined): ModuleKey[] {
  const p = (plan ?? 'STARTER') as SubscriptionPlan;
  return PLAN_MODULES[p] ?? PLAN_MODULES.STARTER;
}

export function resolveModulesForRole(
  role: string,
  plan: SubscriptionPlan | string | null | undefined,
): Array<ModuleDef & { enabled: boolean }> {
  const enabled = new Set(resolveModulesForPlan(plan));
  if (role === 'SUPER_ADMIN') enabled.add('platform');
  if (role === 'TENANT') {
    return MODULE_CATALOG.map((m) => ({
      ...m,
      enabled: m.key === 'portal',
    }));
  }
  return MODULE_CATALOG.map((m) => ({
    ...m,
    enabled: enabled.has(m.key),
  }));
}
