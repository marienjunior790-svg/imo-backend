import { NextFunction, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { container } from 'tsyringe';
import { SubscriptionService } from '../../modules/subscriptions/subscription.service.js';
import { Capability } from '../../modules/subscriptions/plans.config.js';
import { isOrgAdminLevel, isPlatformAdmin, isTenant } from '../auth/roles.js';
import { asyncHandler } from '../utils/response.util.js';

/**
 * Capacité qu'un membre doit trouver dans l'offre de son organisation pour travailler dans ITC.
 * Le propriétaire a besoin de la gestion essentielle ; les collaborateurs et agents relèvent du menu Agent ;
 * les locataires du menu Locataire. Les permissions individuelles (RBAC) restent vérifiées ensuite.
 */
export function memberCapability(role: UserRole | string): Capability {
  if (isOrgAdminLevel(role)) return Capability.CORE_MANAGEMENT;
  if (isTenant(role)) return Capability.TENANT_MENU;
  return Capability.AGENT_MENU;
}

async function loadContext(req: Request) {
  if (!req.subscription) {
    req.subscription = await container.resolve(SubscriptionService).resolveAccessContext(req.user!.organizationId!);
  }
  return req.subscription;
}

/**
 * Contrôle d'abonnement des routes métier (lecture comprise) : refus HTTP 403 avec un code explicite
 * quand l'essai ou l'abonnement n'est plus valide. Les routes /auth et /subscription n'utilisent pas ce contrôle.
 */
export const verifySubscription = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user || isPlatformAdmin(req.user.role)) return next();
  if (!req.user.organizationId) return next();

  const context = await loadContext(req);
  const denial = container
    .resolve(SubscriptionService)
    .denialFor(context, req.user.role, memberCapability(req.user.role));
  if (denial) throw denial;
  next();
});

/** Exige une capacité de la matrice centrale (menu Agent, menu Locataire, IA…). */
export function requireCapability(capability: Capability) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || isPlatformAdmin(req.user.role)) return next();
    if (!req.user.organizationId) return next();

    const context = await loadContext(req);
    const denial = container.resolve(SubscriptionService).denialFor(context, req.user.role, capability);
    if (denial) throw denial;
    next();
  });
}

/** Variante conditionnelle : la capacité n'est exigée que si `when(req)` est vrai. */
export function requireCapabilityWhen(capability: Capability, when: (req: Request) => boolean) {
  const guard = requireCapability(capability);
  return (req: Request, res: Response, next: NextFunction) => (when(req) ? guard(req, res, next) : next());
}
