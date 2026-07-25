import { Router } from 'express';
import { container } from 'tsyringe';
import { SubscriptionService } from './subscription.service.js';
import { changePlanSchema, reactivateSchema } from './subscription.schema.js';
import { PLAN_LIMITS } from '../../shared/constants/plan-limits.js';
import { getOrganizationId } from '../../shared/middleware/auth.middleware.js';
import { Permission } from '../../shared/auth/permissions.js';
import { ownerPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { validateBody } from '../../shared/middleware/validate.middleware.js';
import { asyncHandler, sendSuccess } from '../../shared/utils/response.util.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { withAudit } from '../../shared/audit/audit-request.js';

const router = Router();
const service = container.resolve(SubscriptionService);

router.use(...ownerPipeline);

router.get(
  '/',
  requirePermission(Permission.SUBSCRIPTION_MANAGE),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.getSubscription(getOrganizationId(req)));
  }),
);

router.get(
  '/plans',
  requirePermission(Permission.SUBSCRIPTION_MANAGE),
  asyncHandler(async (_req, res) => {
    const plans = Object.entries(PLAN_LIMITS).map(([key, value]) => ({
      plan: key,
      ...value,
      maxApartments: value.maxApartments === Infinity ? null : value.maxApartments,
      maxUsers: value.maxUsers === Infinity ? null : value.maxUsers,
    }));
    sendSuccess(res, plans);
  }),
);

router.post(
  '/change-plan',
  requirePermission(Permission.SUBSCRIPTION_MANAGE),
  validateBody(changePlanSchema),
  asyncHandler(async (req, res) => {
    const updated = await withAudit(
      req,
      AuditAction.SUBSCRIPTION_CHANGE,
      () => service.changePlan(getOrganizationId(req), req.body.plan),
      (r) => ({ resourceType: 'Subscription', resourceId: r.id, newValue: { plan: r.plan } }),
    );
    sendSuccess(res, updated, 'Plan mis à jour');
  }),
);

router.post(
  '/cancel',
  requirePermission(Permission.SUBSCRIPTION_MANAGE),
  asyncHandler(async (req, res) => {
    const cancelled = await withAudit(
      req,
      AuditAction.SUBSCRIPTION_CANCEL,
      () => service.cancel(getOrganizationId(req)),
      (r) => ({ resourceType: 'Subscription', resourceId: r.id, newValue: { status: r.status } }),
    );
    sendSuccess(res, cancelled, 'Abonnement annulé — vos données sont conservées');
  }),
);

router.post(
  '/reactivate',
  requirePermission(Permission.SUBSCRIPTION_MANAGE),
  validateBody(reactivateSchema),
  asyncHandler(async (req, res) => {
    const reactivated = await withAudit(
      req,
      AuditAction.SUBSCRIPTION_REACTIVATE,
      () => service.reactivate(getOrganizationId(req), req.body.plan),
      (r) => ({ resourceType: 'Subscription', resourceId: r.id, newValue: { plan: r.plan, status: r.status } }),
    );
    sendSuccess(res, reactivated, 'Abonnement réactivé');
  }),
);

export default router;
