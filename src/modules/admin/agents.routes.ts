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
import { roleLabel } from '../../shared/auth/roles.js';

const router = Router();
const staffProvision = container.resolve(StaffProvisionService);

router.use(...orgStaffPipeline);

/**
 * POST /agents — provisionne un collaborateur métier.
 *
 * Rôles acceptés (body.role) :
 *   MANAGER (défaut) = agent gestionnaire / ops (locataires, baux, paiements, maintenance desk)
 *   AGENT            = agent terrain (interventions assignées uniquement)
 *   ACCOUNTANT       = comptable
 *
 * Alias pratique de POST /admin/users/provision.
 */
router.post(
  '/',
  requirePermission(Permission.USER_CREATE),
  validateBody(staffProvisionSchema),
  asyncHandler(async (req, res) => {
    const staffRole = req.body.role ?? 'MANAGER';
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
          { ...req.body, role: staffRole },
        ),
      (r) => ({
        resourceType: 'User',
        resourceId: r.user.id,
        newValue: { role: staffRole, identifier: r.account.identifier },
      }),
    );
    sendSuccess(res, result, `${roleLabel(staffRole)} provisionné`, 201);
  }),
);

export default router;
