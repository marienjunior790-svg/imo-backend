import { Router } from 'express';
import { container } from 'tsyringe';
import { z } from 'zod';
import { AuditService } from '../../shared/services/audit.service.js';
import { Permission } from '../../shared/auth/permissions.js';
import { authenticatedPipeline, orgStaffPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { getOrganizationId } from '../../shared/middleware/auth.middleware.js';
import { validateQuery } from '../../shared/middleware/validate.middleware.js';
import { asyncHandler, sendSuccess } from '../../shared/utils/response.util.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { auditSuccess } from '../../shared/audit/audit-request.js';
import { isOrgAdminLevel } from '../../shared/auth/roles.js';
import { ForbiddenError } from '../../shared/errors/app.error.js';

const router = Router();
const auditService = container.resolve(AuditService);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  action: z.string().optional(),
  userId: z.string().optional(),
});

/** Historique des actions de l'utilisateur connecté */
router.get(
  '/me',
  ...authenticatedPipeline,
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const u = req.user!;
    const result = await auditService.list(page, limit, {
      userId: u.userId,
      organizationId: u.organizationId ?? undefined,
      action: req.query.action as string | undefined,
    });
    sendSuccess(res, result);
  }),
);

/** Historique des actions d'un utilisateur (admin organisation) */
router.get(
  '/users/:userId',
  ...orgStaffPipeline,
  requirePermission(Permission.AUDIT_VIEW),
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    if (!isOrgAdminLevel(req.user!.role)) {
      throw new ForbiddenError('Réservé au propriétaire de l\'organisation');
    }
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const orgId = getOrganizationId(req);
    const result = await auditService.list(page, limit, {
      organizationId: orgId,
      userId: req.params.userId,
      action: req.query.action as string | undefined,
    });
    sendSuccess(res, result);
  }),
);

/** Journal d'audit organisation */
router.get(
  '/',
  ...orgStaffPipeline,
  requirePermission(Permission.AUDIT_VIEW),
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const orgId = getOrganizationId(req);
    const result = await auditService.list(page, limit, {
      organizationId: orgId,
      action: req.query.action as string | undefined,
      userId: req.query.userId as string | undefined,
    });
    sendSuccess(res, result);
  }),
);

router.get(
  '/export',
  ...orgStaffPipeline,
  requirePermission(Permission.AUDIT_EXPORT),
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const orgId = getOrganizationId(req);
    const result = await auditService.list(1, 5000, { organizationId: orgId });
    const csv = auditService.toCsv(result.items);
    await auditSuccess(req, AuditAction.AUDIT_EXPORT, {
      resourceType: 'AuditLog',
      newValue: { scope: 'organization', count: result.items.length },
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-organisation.csv"');
    res.send(csv);
  }),
);

export default router;
