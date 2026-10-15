import { assertOrgHierarchy, resolveRolePermissions } from '../../src/shared/rbac/role-matrix.js';
import { resolveModulesForCapabilities, resolveModulesForRole } from '../../src/shared/auth/modules.js';
import { PLAN_CAPABILITIES } from '../../src/modules/subscriptions/plans.config.js';

describe('RBAC inheritance (P3)', () => {
  it('ORG_ADMIN ⊇ MANAGER ⊇ AGENT (sans DELETE pour Manager)', () => {
    const check = assertOrgHierarchy();
    expect(check.missing).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it('ORG_ADMIN a BUILDING_CREATE (corrigé vs AGENT)', () => {
    const owner = resolveRolePermissions('ORG_ADMIN');
    expect(owner).toContain('BUILDING_CREATE');
    expect(owner).toContain('PAYMENT_CREATE');
    expect(owner).toContain('USER_CREATE');
  });
});

describe('Modules (capacités de l’offre)', () => {
  it('PRO n’a pas le portail locataire', () => {
    expect(resolveModulesForCapabilities(PLAN_CAPABILITIES.PRO)).toEqual([
      'core',
      'payments',
      'maintenance',
      'accounting',
    ]);
  });

  it('PLUS active le portail locataire', () => {
    const mods = resolveModulesForRole('ORG_ADMIN', PLAN_CAPABILITIES.PLUS);
    expect(mods.find((m) => m.key === 'portal')?.enabled).toBe(true);
    expect(mods.find((m) => m.key === 'maintenance')?.enabled).toBe(true);
  });

  it('TENANT ne voit que portal (et seulement si l’offre l’inclut)', () => {
    const plus = resolveModulesForRole('TENANT', PLAN_CAPABILITIES.PLUS);
    expect(plus.filter((m) => m.enabled).map((m) => m.key)).toEqual(['portal']);
    const pro = resolveModulesForRole('TENANT', PLAN_CAPABILITIES.PRO);
    expect(pro.filter((m) => m.enabled)).toEqual([]);
  });

  it('aucune capacité → aucun module', () => {
    expect(resolveModulesForCapabilities([])).toEqual([]);
  });
});
