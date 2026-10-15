import { Capability } from '../../modules/subscriptions/plans.config.js';

import { isMaintenanceAgent, isPlatformAdmin, isTenant, normalizeRole } from './roles.js';

/** Catalogue modules produit (P3) — activés selon les capacités de l'offre. */
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
  { key: 'accounting', label: 'Comptabilité', description: 'Dépenses et rapports' },
  { key: 'portal', label: 'Portail locataire', description: 'Espace locataire' },
  { key: 'platform', label: 'Plateforme ITC', description: 'Console équipe ITC' },
];

const MODULE_CAPABILITY: Record<Exclude<ModuleKey, 'platform'>, Capability> = {
  core: Capability.CORE_MANAGEMENT,
  payments: Capability.CORE_MANAGEMENT,
  maintenance: Capability.CORE_MANAGEMENT,
  accounting: Capability.CORE_MANAGEMENT,
  portal: Capability.TENANT_MENU,
};

export function resolveModulesForCapabilities(capabilities: readonly string[]): ModuleKey[] {
  return (Object.keys(MODULE_CAPABILITY) as Array<keyof typeof MODULE_CAPABILITY>).filter((key) =>
    capabilities.includes(MODULE_CAPABILITY[key]),
  );
}

export function resolveModulesForRole(
  role: string,
  capabilities: readonly string[],
): Array<ModuleDef & { enabled: boolean }> {
  const canonical = normalizeRole(role);
  const enabled = new Set<ModuleKey>(resolveModulesForCapabilities(capabilities));
  if (isPlatformAdmin(canonical)) enabled.add('platform');
  if (isTenant(canonical)) {
    return MODULE_CATALOG.map((m) => ({ ...m, enabled: m.key === 'portal' && enabled.has('portal') }));
  }
  if (isMaintenanceAgent(canonical)) {
    const agentMenu = capabilities.includes(Capability.AGENT_MENU);
    return MODULE_CATALOG.map((m) => ({ ...m, enabled: m.key === 'maintenance' && agentMenu }));
  }
  return MODULE_CATALOG.map((m) => ({ ...m, enabled: enabled.has(m.key) }));
}
