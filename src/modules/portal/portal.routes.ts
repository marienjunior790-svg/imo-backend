import { Router } from 'express';
import { container } from 'tsyringe';
import { PortalService } from './portal.service.js';
import { portalMaintenanceSchema, portalMaintenanceCommentSchema } from './portal.schema.js';
import { Permission } from '../../shared/auth/permissions.js';
import { tenantPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { validateBody } from '../../shared/middleware/validate.middleware.js';
import { asyncHandler, sendSuccess } from '../../shared/utils/response.util.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { withAudit } from '../../shared/audit/audit-request.js';

const router = Router();
const service = container.resolve(PortalService);

router.use(...tenantPipeline);

router.get(
  '/dashboard',
  requirePermission(Permission.PORTAL_HOME_VIEW),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.dashboard(req.user!.userId));
  }),
);

router.get(
  '/homes',
  requirePermission(Permission.PORTAL_HOMES_VIEW),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.listHomes(req.user!.userId));
  }),
);

router.get(
  '/lease',
  requirePermission(Permission.PORTAL_LEASE_VIEW),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.getActiveLease(req.user!.userId));
  }),
);

router.get(
  '/payments',
  requirePermission(Permission.PORTAL_PAYMENTS_VIEW),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.listPayments(req.user!.userId));
  }),
);

router.get(
  '/maintenance',
  requirePermission(Permission.PORTAL_MAINTENANCE_VIEW),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.listMaintenance(req.user!.userId));
  }),
);

router.get(
  '/maintenance/:id',
  requirePermission(Permission.PORTAL_MAINTENANCE_VIEW),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.getMaintenance(req.user!.userId, req.params.id));
  }),
);

router.post(
  '/maintenance',
  requirePermission(Permission.PORTAL_MAINTENANCE_CREATE),
  validateBody(portalMaintenanceSchema),
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const actor = { userId: u.userId, name: u.email };
    const ticket = await withAudit(
      req,
      AuditAction.PORTAL_MAINTENANCE_CREATE,
      () => service.createMaintenance(u.userId, req.body, actor),
      (t) => ({
        resourceType: 'MaintenanceTicket',
        resourceId: t.id,
        newValue: { title: t.title, organizationId: t.organizationId },
      }),
    );
    sendSuccess(res, ticket, 'Demande de maintenance envoyée', 201);
  }),
);

router.post(
  '/maintenance/:id/comment',
  requirePermission(Permission.PORTAL_MAINTENANCE_CREATE),
  validateBody(portalMaintenanceCommentSchema),
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const actor = { userId: u.userId, name: u.email };
    const ticket = await withAudit(
      req,
      AuditAction.PORTAL_MAINTENANCE_CREATE,
      () => service.addMaintenanceComment(u.userId, req.params.id, req.body.message, actor),
      (t) => ({ resourceType: 'MaintenanceTicket', resourceId: t.id }),
    );
    sendSuccess(res, ticket, 'Message envoyé', 201);
  }),
);

router.post(
  '/maintenance/:id/confirm',
  requirePermission(Permission.PORTAL_MAINTENANCE_CREATE),
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const actor = { userId: u.userId, name: u.email };
    const ticket = await withAudit(
      req,
      AuditAction.PORTAL_MAINTENANCE_CREATE,
      () => service.confirmMaintenanceResolved(u.userId, req.params.id, actor),
      (t) => ({ resourceType: 'MaintenanceTicket', resourceId: t.id, newValue: { status: t.status } }),
    );
    sendSuccess(res, ticket, 'Résolution confirmée — merci');
  }),
);

export default router;
