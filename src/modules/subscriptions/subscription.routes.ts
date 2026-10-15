import { Router } from 'express';
import { container } from 'tsyringe';
import { SubscriptionService } from './subscription.service.js';
import { StripeBillingService } from './stripe-billing.service.js';
import { AiQuotaService } from './ai-quota.service.js';
import { changePlanSchema, checkoutSchema } from './subscription.schema.js';
import { COMMERCIAL_PLANS, PaidPlan, PLAN_CAPABILITIES, PLAN_LABELS } from './plans.config.js';
import { listOffers } from './pricing.config.js';
import { getOrganizationId, requireOrganization } from '../../shared/middleware/auth.middleware.js';
import { Permission } from '../../shared/auth/permissions.js';
import { authenticatedPipeline, ownerPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { validateBody } from '../../shared/middleware/validate.middleware.js';
import { asyncHandler, sendSuccess } from '../../shared/utils/response.util.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { withAudit } from '../../shared/audit/audit-request.js';
import { isOrgAdminLevel } from '../../shared/auth/roles.js';

/**
 * Routes d'abonnement — toujours accessibles, même essai ou abonnement échu,
 * pour consulter son statut, les offres et payer.
 */
const router = Router();
const service = container.resolve(SubscriptionService);
const billing = container.resolve(StripeBillingService);
const quotas = container.resolve(AiQuotaService);

const manage = [...ownerPipeline, requirePermission(Permission.SUBSCRIPTION_MANAGE)];

/** GET /subscription/status — tout membre : droits de son organisation (affichage des menus). */
router.get(
  '/status',
  ...authenticatedPipeline,
  requireOrganization,
  asyncHandler(async (req, res) => {
    const view = await service.getSubscription(getOrganizationId(req));
    if (isOrgAdminLevel(req.user!.role)) {
      sendSuccess(res, view);
      return;
    }
    sendSuccess(res, {
      plan: view.plan,
      planLabel: view.planLabel,
      status: view.status,
      entitled: view.entitled,
      capabilities: view.capabilities,
      serverTime: view.serverTime,
    });
  }),
);

/** GET /subscription — page Abonnement : état, offres, consommation IA. */
router.get(
  '/',
  ...manage,
  asyncHandler(async (req, res) => {
    const organizationId = getOrganizationId(req);
    const overview = await service.getOverview(organizationId);
    const aiUsage = overview.subscription.capabilities.includes('AI') ? await quotas.usage(organizationId) : [];
    sendSuccess(res, { ...overview, aiUsage });
  }),
);

/** GET /subscription/plans — matrice des capacités et grille tarifaire. */
router.get(
  '/plans',
  ...manage,
  asyncHandler(async (_req, res) => {
    sendSuccess(res, {
      plans: COMMERCIAL_PLANS.map((plan) => ({
        plan,
        label: PLAN_LABELS[plan],
        capabilities: PLAN_CAPABILITIES[plan],
        trialOnly: plan === 'STANDARD',
      })),
      offers: listOffers(),
    });
  }),
);

router.get(
  '/history',
  ...manage,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.getHistory(getOrganizationId(req)));
  }),
);

/** POST /subscription/checkout — ouvre le paiement Stripe ; l'activation n'a lieu qu'à réception du webhook. */
router.post(
  '/checkout',
  ...manage,
  validateBody(checkoutSchema),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.SUBSCRIPTION_CHANGE,
      () =>
        billing.createCheckout(
          getOrganizationId(req),
          { userId: req.user!.userId, email: req.user!.email ?? null },
          req.body.plan as PaidPlan,
          req.body.period,
        ),
      () => ({ resourceType: 'Subscription', newValue: { checkout: req.body.plan, period: req.body.period } }),
    );
    sendSuccess(res, result);
  }),
);

router.post(
  '/change-plan',
  ...manage,
  validateBody(changePlanSchema),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.SUBSCRIPTION_CHANGE,
      () => billing.changePlan(getOrganizationId(req), req.body.plan as PaidPlan, req.body.period, req.user!.userId),
      (r) => ({ resourceType: 'Subscription', newValue: { plan: req.body.plan, period: req.body.period, applied: r.applied } }),
    );
    sendSuccess(
      res,
      result,
      result.applied === 'NOW'
        ? 'Changement demandé : il sera appliqué dès la confirmation du paiement'
        : 'Changement programmé pour la fin de la période en cours',
    );
  }),
);

router.post(
  '/portal',
  ...manage,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await billing.createPortal(getOrganizationId(req)));
  }),
);

router.post(
  '/cancel',
  ...manage,
  asyncHandler(async (req, res) => {
    await withAudit(
      req,
      AuditAction.SUBSCRIPTION_CANCEL,
      () => billing.setCancelAtPeriodEnd(getOrganizationId(req), true, req.user!.userId),
      () => ({ resourceType: 'Subscription', newValue: { cancelAtPeriodEnd: true } }),
    );
    sendSuccess(res, null, 'Résiliation demandée : votre offre reste active jusqu\'à la fin de la période payée');
  }),
);

router.post(
  '/resume',
  ...manage,
  asyncHandler(async (req, res) => {
    await withAudit(
      req,
      AuditAction.SUBSCRIPTION_REACTIVATE,
      () => billing.setCancelAtPeriodEnd(getOrganizationId(req), false, req.user!.userId),
      () => ({ resourceType: 'Subscription', newValue: { cancelAtPeriodEnd: false } }),
    );
    sendSuccess(res, null, 'Résiliation annulée : votre abonnement sera renouvelé');
  }),
);

export default router;
