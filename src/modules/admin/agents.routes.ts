import { Router } from 'express';
import { container } from 'tsyringe';
import { StaffProvisionService } from '../admin/staff-provision.service.js';
import { staffProvisionSchema } from '../admin/staff-provision.schema.js';
import { Permission } from '../../shared/auth/permissions.js';
import { orgStaffPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { validateBody } from '../../shared/middleware/validate.middleware.js';
import { asyncHandler, sendSuccess } from '../../shared/utils/response.util.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { withAudit } from '../../shared/audit/audit-request.js';

const router = Router();
const staffProvision = container.resolve(StaffProvisionService);

router.use(...orgStaffPipeline);

/**
 * POST /agents — provisionne Identity + Membership AGENT (+ mdp temporaire).
 * Alias métier de POST /admin/users/provision { role: AGENT }.
 */
router.post(
  '/',
  requirePermission(Permission.USER_CREATE),
  validateBody(staffProvisionSchema),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.USER_CREATE,
      () =>
        staffProvision.provision(
          {
            userId: req.user!.userId,
            role: req.user!.role,
            organizationId: req.user!.organizationId,
          },
          { ...req.body, role: 'AGENT' },
        ),
      (r) => ({
        resourceType: 'User',
        resourceId: r.user.id,
        newValue: { role: 'AGENT', identifier: r.account.identifier },
      }),
    );
    sendSuccess(res, result, 'Agent provisionné', 201);
  }),
);

export default router;
