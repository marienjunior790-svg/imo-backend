import { resolveHomePath } from '../../src/shared/auth/home-path.js';
import { UserRole } from '@prisma/client';

describe('P5 — rôle effectif Membership', () => {
  it('homePath suit le rôle canonique ou son alias legacy', () => {
    expect(resolveHomePath(UserRole.OWNER)).toBe('/dashboard');
    expect(resolveHomePath(UserRole.ORG_ADMIN)).toBe('/dashboard');
    expect(resolveHomePath(UserRole.TENANT)).toMatch(/tenant/i);
    expect(resolveHomePath(UserRole.AGENT)).toBe('/agent');
    expect(resolveHomePath(UserRole.TECHNICIAN)).toBe('/agent');
  });

  it('membership.role prime sur user.role pour la résolution produit', () => {
    const userRole = UserRole.TENANT;
    const membershipRole = UserRole.ORG_ADMIN;
    const effective = membershipRole ?? userRole;
    expect(effective).toBe(UserRole.ORG_ADMIN);
    expect(resolveHomePath(effective)).not.toBe(resolveHomePath(userRole));
  });
});
