import { RequestHandler } from 'express';
import { UserRole } from '@prisma/client';
import { authMiddleware, requireOrganization, requireRoles } from './auth.middleware.js';
import { MAINTENANCE_ROLES, ORG_STAFF_ROLES, OWNER_ROLES, isPlatformAdmin } from '../auth/roles.js';
import { validateSessionMiddleware } from './session.middleware.js';
import { verifyOrganizationActiveMiddleware } from './organization.middleware.js';
import { verifySubscription } from './subscription.middleware.js';
import { requirePasswordChangedMiddleware } from './password-change.middleware.js';

/**
 * Pipelines de sécurité standardisés.
 *
 * Chaque requête protégée vérifie dans l'ordre :
 * 1. Authentification JWT
 * 2. Utilisateur actif (+ rôle/org à jour en base)
 * 3. Organisation active & validée (si applicable)
 * 4. Abonnement valide pour mutations (via verifySubscription)
 * 5. Rôle autorisé
 * 6. Permission métier (requirePermission par route)
 * 7. Appartenance ressource (requireOrgResource par route :id)
 */

/** Staff propriétaire / agence — ERP complet (l'agent de maintenance en est exclu) */
export const orgStaffPipeline: RequestHandler[] = [
  authMiddleware,
  validateSessionMiddleware,
  requirePasswordChangedMiddleware,
  verifyOrganizationActiveMiddleware,
  requireOrganization,
  verifySubscription,
  requireRoles(...ORG_STAFF_ROLES),
];

/** Locataire — portail & candidatures */
export const tenantPipeline: RequestHandler[] = [
  authMiddleware,
  validateSessionMiddleware,
  requirePasswordChangedMiddleware,
  requireRoles(UserRole.TENANT),
];

/** Agent de maintenance — interventions terrain */
export const maintenanceAgentPipeline: RequestHandler[] = [
  authMiddleware,
  validateSessionMiddleware,
  requirePasswordChangedMiddleware,
  verifyOrganizationActiveMiddleware,
  requireOrganization,
  verifySubscription,
  requireRoles(...MAINTENANCE_ROLES),
];

/**
 * Tout utilisateur authentifié — routes métier génériques (notifications, audit, …).
 * Inclut le password gate. Les routes auth (/me, /change-password, /logout) utilisent
 * `authenticatedStack` (auth.stack.ts), pas ce pipeline.
 */
export const authenticatedPipeline: RequestHandler[] = [
  authMiddleware,
  validateSessionMiddleware,
  requirePasswordChangedMiddleware,
];

/** Super administrateur plateforme */
export const platformAdminPipeline: RequestHandler[] = [
  authMiddleware,
  validateSessionMiddleware,
  requirePasswordChangedMiddleware,
  requireRoles(UserRole.SUPER_ADMIN),
];

/** Propriétaire de l'organisation (gestion abonnement) */
export const ownerPipeline: RequestHandler[] = [
  authMiddleware,
  validateSessionMiddleware,
  requirePasswordChangedMiddleware,
  verifyOrganizationActiveMiddleware,
  requireOrganization,
  requireRoles(...OWNER_ROLES),
];

/**
 * Gestion utilisateurs — super admin (plateforme) ou admin org (avec org active).
 */
export const adminUsersPipeline: RequestHandler[] = [
  authMiddleware,
  validateSessionMiddleware,
  requirePasswordChangedMiddleware,
  (req, res, next) => {
    if (isPlatformAdmin(req.user?.role)) return next();
    verifyOrganizationActiveMiddleware(req, res, next);
  },
  (req, res, next) => {
    if (isPlatformAdmin(req.user?.role)) return next();
    requireOrganization(req, res, next);
  },
];
