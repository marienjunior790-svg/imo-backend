import { UserRole } from '@prisma/client';
import { normalizeRole } from './roles.js';

/**
 * Canonical post-auth home path (P0 unified login).
 * Clients must redirect here — never ask the user to pick a "space".
 * Paths match the mobile GoRouter today; web maps them onto its shell.
 */
export function resolveHomePath(role: UserRole | string): string {
  switch (normalizeRole(role)) {
    case UserRole.SUPER_ADMIN:
      return '/admin/dashboard';
    case UserRole.OWNER:
    case UserRole.MANAGER:
    case UserRole.ACCOUNTANT:
      return '/dashboard';
    case UserRole.AGENT:
    case UserRole.MAINTENANCE_LEAD:
      return '/agent';
    case UserRole.TENANT:
      return '/tenant';
    default:
      return '/dashboard';
  }
}
