import { assertOrgHierarchy, resolveRolePermissions } from '../../src/shared/rbac/role-matrix.js';
import { resolveModulesForPlan, resolveModulesForRole } from '../../src/shared/auth/modules.js';

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

describe('Modules (P3)', () => {
  it('STARTER n’a pas maintenance ni accounting', () => {
    expect(resolveModulesForPlan('STARTER')).toEqual(['core', 'payments', 'portal']);
  });

  it('ENTERPRISE active accounting', () => {
    const mods = resolveModulesForRole('ORG_ADMIN', 'ENTERPRISE');
    expect(mods.find((m) => m.key === 'accounting')?.enabled).toBe(true);
    expect(mods.find((m) => m.key === 'maintenance')?.enabled).toBe(true);
  });

  it('TENANT ne voit que portal', () => {
    const mods = resolveModulesForRole('TENANT', 'ENTERPRISE');
    expect(mods.filter((m) => m.enabled).map((m) => m.key)).toEqual(['portal']);
  });
});
