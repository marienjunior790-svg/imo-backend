import { Router } from 'express';
import { container } from 'tsyringe';
import { InvitationService } from './invitation.service.js';
import { acceptInvitationSchema, createInvitationSchema } from './invitation.schema.js';
import { adminUsersPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { Permission } from '../../shared/auth/permissions.js';
import { authRateLimit } from '../../shared/middleware/auth-rate-limit.middleware.js';
import { validateBody } from '../../shared/middleware/validate.middleware.js';
import { asyncHandler, sendSuccess } from '../../shared/utils/response.util.js';

const router = Router();
const service = container.resolve(InvitationService);

/** Admin — create invitation */
router.post(
  '/',
  ...adminUsersPipeline,
  requirePermission(Permission.USER_CREATE, Permission.PLATFORM_USER_MANAGE),
  validateBody(createInvitationSchema),
  asyncHandler(async (req, res) => {
    const result = await service.create(
      {
        userId: req.user!.userId,
        role: req.user!.role,
        organizationId: req.user!.organizationId,
      },
      req.body,
    );
    sendSuccess(res, result, 'Invitation créée', 201);
  }),
);

/** Admin — list invitations */
router.get(
  '/',
  ...adminUsersPipeline,
  requirePermission(Permission.USER_VIEW, Permission.PLATFORM_USER_VIEW),
  asyncHandler(async (req, res) => {
    const list = await service.list({
      role: req.user!.role,
      organizationId: req.user!.organizationId,
    });
    sendSuccess(res, list);
  }),
);

/** Admin — revoke */
router.post(
  '/:id/revoke',
  ...adminUsersPipeline,
  requirePermission(Permission.USER_EDIT, Permission.PLATFORM_USER_MANAGE),
  asyncHandler(async (req, res) => {
    const result = await service.revoke(
      {
        userId: req.user!.userId,
        role: req.user!.role,
        organizationId: req.user!.organizationId,
      },
      req.params.id,
    );
    sendSuccess(res, result, 'Invitation révoquée');
  }),
);

/** Public — preview invitation */
router.get(
  '/:token',
  authRateLimit,
  asyncHandler(async (req, res) => {
    const data = await service.getByToken(req.params.token);
    sendSuccess(res, data);
  }),
);

/** Public — accept + set password */
router.post(
  '/:token/accept',
  authRateLimit,
  validateBody(acceptInvitationSchema),
  asyncHandler(async (req, res) => {
    const session = await service.accept(req.params.token, req.body);
    sendSuccess(res, session, 'Compte activé', 201);
  }),
);

export default router;
