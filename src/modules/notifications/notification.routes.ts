import { Router } from 'express';
import { container } from 'tsyringe';
import { NotificationService } from './notification.service.js';
import { Permission } from '../../shared/auth/permissions.js';
import { authenticatedPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { isMaintenanceAgent, isTenant } from '../../shared/auth/roles.js';
import { UnauthorizedError } from '../../shared/errors/app.error.js';
import { asyncHandler, sendSuccess } from '../../shared/utils/response.util.js';

const router = Router();
const service = container.resolve(NotificationService);

function resolveOrgId(req: import('express').Request): string {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new UnauthorizedError('Organisation requise');
  return orgId;
}

/**
 * Locataires et agents de maintenance ne voient que leurs propres notifications :
 * les diffusions d'organisation (userId null) restent réservées au staff.
 */
function isPersonalScope(role: string | undefined): boolean {
  return isTenant(role) || isMaintenanceAgent(role);
}

router.use(...authenticatedPipeline, requirePermission(Permission.NOTIFICATION_VIEW));

router.get('/', asyncHandler(async (req, res) => {
  const u = req.user!;
  const filter = req.query.filter as 'unread' | 'read' | undefined;
  const orgId = resolveOrgId(req);

  const items = isPersonalScope(u.role)
    ? await service.listPersonal(orgId, u.userId, filter)
    : await service.listForUser(orgId, u.userId, filter);

  sendSuccess(res, items, undefined, 200, { unread: items.filter((n) => !n.readAt).length });
}));

router.patch('/read-all', asyncHandler(async (req, res) => {
  const u = req.user!;
  const orgId = resolveOrgId(req);
  const count = isPersonalScope(u.role)
    ? await service.markAllOwnRead(orgId, u.userId)
    : await service.markAllRead(orgId, u.userId);
  sendSuccess(res, { count }, 'Notifications marquées comme lues');
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const u = req.user!;
  const orgId = resolveOrgId(req);
  const item = isPersonalScope(u.role)
    ? await service.markOwnRead(orgId, u.userId, req.params.id)
    : await service.markRead(orgId, u.userId, req.params.id);
  sendSuccess(res, item);
}));

export default router;
