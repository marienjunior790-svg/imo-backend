import { UserRole } from '@prisma/client';
import { orgResourceGateForRole } from '../../src/shared/middleware/resource-guard.middleware.js';

describe('orgResourceGateForRole (TECH-001)', () => {
  it('SUPER_ADMIN bypass le contrôle org', () => {
    expect(orgResourceGateForRole(UserRole.SUPER_ADMIN)).toBe('bypass');
  });

  it('TENANT est refusé (plus de bypass IDOR)', () => {
    expect(orgResourceGateForRole(UserRole.TENANT)).toBe('deny');
  });

  it('staff org doit vérifier organizationId', () => {
    expect(orgResourceGateForRole(UserRole.ORG_ADMIN)).toBe('check');
    expect(orgResourceGateForRole(UserRole.AGENT)).toBe('check');
    expect(orgResourceGateForRole(UserRole.TECHNICIAN)).toBe('check');
  });

  it('rôle absent → check (échouera sans org)', () => {
    expect(orgResourceGateForRole(undefined)).toBe('check');
  });
});
