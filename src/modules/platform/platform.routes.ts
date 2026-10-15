import { Router } from 'express';
import { container } from 'tsyringe';
import { z } from 'zod';
import { PlatformService } from './platform.service.js';
import { platformAdminPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { Permission } from '../../shared/auth/permissions.js';
import { validateBody } from '../../shared/middleware/validate.middleware.js';
import { asyncHandler, sendSuccess } from '../../shared/utils/response.util.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { auditSuccess } from '../../shared/audit/audit-request.js';
import { SubscriptionService } from '../subscriptions/subscription.service.js';
import { adminGrantSchema } from '../subscriptions/subscription.schema.js';
import { PaidPlan } from '../subscriptions/plans.config.js';

const router = Router();
const service = container.resolve(PlatformService);

router.use(...platformAdminPipeline);

router.get('/dashboard', requirePermission(Permission.PLATFORM_DASHBOARD_VIEW), asyncHandler(async (req, res) => {
  sendSuccess(res, await service.platformStats(req.user!.role));
}));

router.get('/stats', requirePermission(Permission.PLATFORM_STATS_VIEW), asyncHandler(async (req, res) => {
  sendSuccess(res, await service.platformStats(req.user!.role));
}));

router.get('/organizations', requirePermission(Permission.PLATFORM_ORG_VIEW), asyncHandler(async (req, res) => {
  sendSuccess(res, await service.listOrganizations(req.user!.role));
}));

router.get('/agencies', requirePermission(Permission.PLATFORM_AGENCY_VIEW), asyncHandler(async (req, res) => {
  sendSuccess(res, await service.listAgencies(req.user!.role));
}));

router.get('/users', requirePermission(Permission.PLATFORM_USER_VIEW), asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 50;
  sendSuccess(res, await service.listUsers(req.user!.role, page, limit));
}));

router.get('/subscriptions', requirePermission(Permission.SUBSCRIPTION_VIEW), asyncHandler(async (req, res) => {
  sendSuccess(res, await service.listSubscriptions(req.user!.role));
}));

router.get('/billing', requirePermission(Permission.BILLING_VIEW), asyncHandler(async (req, res) => {
  sendSuccess(res, service.platformBillingStub(req.user!.role));
}));

router.get('/audit-logs', requirePermission(Permission.PLATFORM_AUDIT_VIEW), asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 50;
  sendSuccess(res, await service.listAuditLogs(req.user!.role, page, limit));
}));

router.get('/audit-logs/export', requirePermission(Permission.AUDIT_EXPORT), asyncHandler(async (req, res) => {
  const csv = await service.exportAuditLogs(req.user!.role);
  await auditSuccess(req, AuditAction.AUDIT_EXPORT, {
    resourceType: 'AuditLog',
    newValue: { scope: 'platform' },
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-plateforme.csv"');
  res.send(csv);
}));

router.get('/workflows', requirePermission(Permission.WORKFLOW_VIEW), asyncHandler(async (req, res) => {
  sendSuccess(res, service.platformWorkflowsStub(req.user!.role));
}));

router.get('/ai', requirePermission(Permission.AI_CONFIGURE), asyncHandler(async (req, res) => {
  sendSuccess(res, service.platformAiStub(req.user!.role));
}));

router.get('/settings', requirePermission(Permission.PLATFORM_SETTINGS), asyncHandler(async (req, res) => {
  sendSuccess(res, service.platformSettingsStub(req.user!.role));
}));

router.patch(
  '/organizations/:id/validate',
  requirePermission(Permission.PLATFORM_ORG_MANAGE),
  validateBody(z.object({ isValidated: z.boolean() })),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.validateOrganization(req.user!.role, req.params.id, req.body.isValidated, req.user!.userId));
  }),
);

router.patch(
  '/organizations/:id/active',
  requirePermission(Permission.PLATFORM_ORG_MANAGE),
  validateBody(z.object({ isActive: z.boolean() })),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.setOrganizationActive(req.user!.role, req.params.id, req.body.isActive, req.user!.userId));
  }),
);

/** Geste commercial de l'équipe ITC : période offerte sans paiement, tracée dans l'historique. */
router.post(
  '/organizations/:id/subscription/grant',
  requirePermission(Permission.PLATFORM_ORG_MANAGE),
  validateBody(adminGrantSchema),
  asyncHandler(async (req, res) => {
    const view = await container
      .resolve(SubscriptionService)
      .adminGrant(req.params.id, { plan: req.body.plan as PaidPlan, until: req.body.until, reason: req.body.reason }, req.user!.userId);
    await auditSuccess(req, AuditAction.SUBSCRIPTION_CHANGE, {
      resourceType: 'Subscription',
      resourceId: view.id,
      newValue: { plan: req.body.plan, until: req.body.until, reason: req.body.reason, grant: true },
    });
    sendSuccess(res, view, 'Période offerte enregistrée');
  }),
);

export default router;
