import { UserRole } from '@prisma/client';

/**
 * Canonical post-auth home path (P0 unified login).
 * Clients must redirect here — never ask the user to pick a "space".
 * Paths match the mobile GoRouter today; web maps them onto its shell.
 */
export function resolveHomePath(role: UserRole | string): string {
  switch (String(role).toUpperCase()) {
    case UserRole.SUPER_ADMIN:
      return '/admin/dashboard';
    case UserRole.ORG_ADMIN:
    case UserRole.AGENT:
    case UserRole.MANAGER:
    case UserRole.ACCOUNTANT:
      return '/dashboard';
    case UserRole.TECHNICIAN:
    case UserRole.MAINTENANCE_LEAD:
      return '/technician';
    case UserRole.TENANT:
      return '/tenant';
    default:
      return '/dashboard';
  }
}
