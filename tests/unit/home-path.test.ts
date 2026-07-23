import { UserRole } from '@prisma/client';
import { resolveHomePath } from '../../src/shared/auth/home-path.js';

describe('resolveHomePath (P0 unified login)', () => {
  it('mappe chaque rôle actif vers un home canonique', () => {
    expect(resolveHomePath(UserRole.SUPER_ADMIN)).toBe('/admin/dashboard');
    expect(resolveHomePath(UserRole.ORG_ADMIN)).toBe('/dashboard');
    expect(resolveHomePath(UserRole.AGENT)).toBe('/dashboard');
    expect(resolveHomePath(UserRole.TECHNICIAN)).toBe('/technician');
    expect(resolveHomePath(UserRole.TENANT)).toBe('/tenant');
  });

  it('normalise une string role et a un fallback sûr', () => {
    expect(resolveHomePath('tenant')).toBe('/tenant');
    expect(resolveHomePath('UNKNOWN_ROLE')).toBe('/dashboard');
  });
});
