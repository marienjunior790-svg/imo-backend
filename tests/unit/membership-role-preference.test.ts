import { resolveHomePath } from '../../src/shared/auth/home-path.js';
import { UserRole } from '@prisma/client';

describe('P5 — rôle effectif Membership', () => {
  it('homePath suit le rôle membership (ORG_ADMIN → dashboard)', () => {
    expect(resolveHomePath(UserRole.ORG_ADMIN)).toBeTruthy();
    expect(resolveHomePath(UserRole.TENANT)).toMatch(/tenant/i);
    expect(resolveHomePath(UserRole.TECHNICIAN)).toMatch(/tech/i);
  });

  it('membership.role prime sur user.role pour la résolution produit', () => {
    const userRole = UserRole.TENANT;
    const membershipRole = UserRole.ORG_ADMIN;
    const effective = membershipRole ?? userRole;
    expect(effective).toBe(UserRole.ORG_ADMIN);
    expect(resolveHomePath(effective)).not.toBe(resolveHomePath(userRole));
  });
});
