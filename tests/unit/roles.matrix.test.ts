import { UserRole } from '@prisma/client';
import {
  isMaintenanceAgent,
  isOrgStaff,
  isOwner,
  isPlatformAdmin,
  isTenant,
  MAINTENANCE_ROLES,
  normalizeRole,
  ORG_STAFF_ROLES,
} from '../../src/shared/auth/roles.js';

describe('Rôle matrix — OWNER / AGENT / TENANT / SUPER_ADMIN', () => {
  it('normalise les alias legacy ORG_ADMIN → OWNER et TECHNICIAN → AGENT', () => {
    expect(normalizeRole(UserRole.ORG_ADMIN)).toBe(UserRole.OWNER);
    expect(normalizeRole(UserRole.TECHNICIAN)).toBe(UserRole.AGENT);
    expect(normalizeRole('technician')).toBe(UserRole.AGENT);
  });

  it('isMaintenanceAgent couvre AGENT + alias TECHNICIAN + MAINTENANCE_LEAD', () => {
    for (const role of MAINTENANCE_ROLES) {
      expect(isMaintenanceAgent(role)).toBe(true);
    }
    expect(isMaintenanceAgent(UserRole.OWNER)).toBe(false);
    expect(isMaintenanceAgent(UserRole.MANAGER)).toBe(false);
    expect(isMaintenanceAgent(UserRole.TENANT)).toBe(false);
    expect(isMaintenanceAgent(UserRole.SUPER_ADMIN)).toBe(false);
  });

  it('sépare staff ERP, locataire et plateforme', () => {
    expect(isOwner(UserRole.OWNER)).toBe(true);
    expect(isOwner(UserRole.ORG_ADMIN)).toBe(true);
    expect(isOrgStaff(UserRole.MANAGER)).toBe(true);
    expect(isOrgStaff(UserRole.AGENT)).toBe(false);
    expect(ORG_STAFF_ROLES).not.toContain(UserRole.AGENT);
    expect(isTenant(UserRole.TENANT)).toBe(true);
    expect(isPlatformAdmin(UserRole.SUPER_ADMIN)).toBe(true);
  });
});
