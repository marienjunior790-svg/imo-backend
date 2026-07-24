import { RequestHandler } from 'express';
import { UserRole } from '@prisma/client';
import { authMiddleware, requireOrganization, requireRoles } from './auth.middleware.js';
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

/** Staff propriétaire / agence — ERP complet */
export const orgStaffPipeline: RequestHandler[] = [
  authMiddleware,
  validateSessionMiddleware,
  requirePasswordChangedMiddleware,
  verifyOrganizationActiveMiddleware,
  requireOrganization,
  verifySubscription,
  requireRoles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.AGENT, UserRole.ACCOUNTANT),
];

/** Locataire — portail & candidatures */
export const tenantPipeline: RequestHandler[] = [
  authMiddleware,
  validateSessionMiddleware,
  requirePasswordChangedMiddleware,
  requireRoles(UserRole.TENANT),
];

/** Technicien — interventions terrain */
export const technicianPipeline: RequestHandler[] = [
  authMiddleware,
  validateSessionMiddleware,
  requirePasswordChangedMiddleware,
  verifyOrganizationActiveMiddleware,
  requireOrganization,
  verifySubscription,
  requireRoles(UserRole.TECHNICIAN),
];

/** Tout utilisateur authentifié (notifications, profil) */
export const authenticatedPipeline: RequestHandler[] = [
  authMiddleware,
  validateSessionMiddleware,
];

/** Super administrateur plateforme */
export const platformAdminPipeline: RequestHandler[] = [
  authMiddleware,
  validateSessionMiddleware,
  requireRoles(UserRole.SUPER_ADMIN),
];

/** Admin organisation (gestion abonnement) */
export const orgAdminPipeline: RequestHandler[] = [
  authMiddleware,
  validateSessionMiddleware,
  requirePasswordChangedMiddleware,
  verifyOrganizationActiveMiddleware,
  requireOrganization,
  requireRoles(UserRole.ORG_ADMIN),
];

/**
 * Gestion utilisateurs — super admin (plateforme) ou admin org (avec org active).
 */
export const adminUsersPipeline: RequestHandler[] = [
  authMiddleware,
  validateSessionMiddleware,
  (req, res, next) => {
    if (req.user?.role === UserRole.SUPER_ADMIN) return next();
    verifyOrganizationActiveMiddleware(req, res, next);
  },
  (req, res, next) => {
    if (req.user?.role === UserRole.SUPER_ADMIN) return next();
    requireOrganization(req, res, next);
  },
];
