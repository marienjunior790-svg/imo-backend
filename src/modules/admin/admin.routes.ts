import { Router } from 'express';
import { container } from 'tsyringe';
import { AdminService } from './admin.service.js';
import { createOrgUserSchema, updateOrgUserSchema } from './admin.schema.js';
import { Permission } from '../../shared/auth/permissions.js';
import { adminUsersPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { validateBody } from '../../shared/middleware/validate.middleware.js';
import { asyncHandler, sendSuccess } from '../../shared/utils/response.util.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { auditSuccess, withAudit } from '../../shared/audit/audit-request.js';

const router = Router();
const service = container.resolve(AdminService);

router.use(...adminUsersPipeline);

router.get(
  '/',
  requirePermission(Permission.USER_VIEW, Permission.PLATFORM_USER_VIEW),
  asyncHandler(async (req, res) => {
    const users = await service.listUsers(req.user!.role, req.user!.organizationId);
    sendSuccess(res, users);
  }),
);

router.post(
  '/',
  requirePermission(Permission.USER_CREATE, Permission.PLATFORM_USER_MANAGE),
  validateBody(createOrgUserSchema),
  asyncHandler(async (req, res) => {
    const user = await withAudit(
      req,
      AuditAction.USER_CREATE,
      () => service.createUser(req.user!.role, req.user!.organizationId, req.body),
      (u) => ({
        resourceType: 'User',
        resourceId: u.id,
        newValue: { email: u.email, role: u.role },
      }),
    );
    // P5 / D11 : soft-deprecate — pas de 410 tant que major non décidé
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', 'Sat, 01 Aug 2026 00:00:00 GMT');
    res.setHeader('Link', '</api/v1/invitations>; rel="successor-version"');
    sendSuccess(
      res,
      {
        ...user,
        deprecated: true,
        prefer: 'POST /api/v1/invitations',
        message: 'Création avec mot de passe dépréciée — utilisez les invitations',
      },
      'Utilisateur créé (deprecated — préférer /invitations)',
      201,
    );
  }),
);

router.patch(
  '/:id',
  requirePermission(Permission.USER_EDIT, Permission.PLATFORM_USER_MANAGE),
  validateBody(updateOrgUserSchema),
  asyncHandler(async (req, res) => {
    const targetId = req.params.id;
    const before = await service.getUserForAudit(req.user!.role, req.user!.organizationId, targetId);

    const user = await service.updateUser(req.user!.role, req.user!.organizationId, targetId, req.body);

    if (req.body.role !== undefined && req.body.role !== before.role) {
      await auditSuccess(req, AuditAction.USER_ROLE_CHANGE, {
        resourceType: 'User',
        resourceId: targetId,
        oldValue: { role: before.role },
        newValue: { role: user.role },
      });
    } else if (req.body.isActive === false) {
      await auditSuccess(req, AuditAction.USER_DEACTIVATE, {
        resourceType: 'User',
        resourceId: targetId,
        oldValue: { isActive: before.isActive },
        newValue: { isActive: false },
      });
    } else if (req.body.isActive === true) {
      await auditSuccess(req, AuditAction.USER_ACTIVATE, {
        resourceType: 'User',
        resourceId: targetId,
        oldValue: { isActive: before.isActive },
        newValue: { isActive: true },
      });
    } else {
      await auditSuccess(req, AuditAction.USER_UPDATE, {
        resourceType: 'User',
        resourceId: targetId,
        newValue: req.body,
      });
    }

    sendSuccess(res, user, 'Utilisateur mis à jour');
  }),
);

router.delete(
  '/:id',
  requirePermission(Permission.USER_DELETE, Permission.PLATFORM_USER_MANAGE),
  asyncHandler(async (req, res) => {
    const deleted = await withAudit(
      req,
      AuditAction.USER_DELETE,
      () =>
        service.deleteUser(
          req.user!.role,
          req.user!.organizationId,
          req.user!.userId,
          req.params.id,
        ),
      (r) => ({
        resourceType: 'User',
        resourceId: r.id,
        oldValue: { email: r.email },
      }),
    );
    sendSuccess(res, deleted, 'Utilisateur supprimé');
  }),
);

export default router;
