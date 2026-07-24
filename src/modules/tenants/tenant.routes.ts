import { Router } from 'express';
import { container } from 'tsyringe';
import { z } from 'zod';
import { TenantService } from './tenant.service.js';
import { PortalAccessService } from './portal-access.service.js';
import { createTenantSchema, tenantListQuerySchema, updateTenantSchema } from './tenant.schema.js';
import { getOrganizationId } from '../../shared/middleware/auth.middleware.js';
import { Permission } from '../../shared/auth/permissions.js';
import { orgStaffPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { requireOrgResource } from '../../shared/middleware/resource-guard.middleware.js';
import { validateBody, validateQuery } from '../../shared/middleware/validate.middleware.js';
import { asyncHandler, getPagination, sendSuccess, toPaginationMeta } from '../../shared/utils/response.util.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { auditSuccess, withAudit } from '../../shared/audit/audit-request.js';

const router = Router();
const service = container.resolve(TenantService);
const portalAccess = container.resolve(PortalAccessService);

const portalSettingsSchema = z.object({
  autoProvisionOnLeaseActive: z.boolean().optional(),
  deliveryModes: z.array(z.enum(['IN_APP', 'EMAIL', 'SMS'])).min(1).optional(),
});

function actor(req: { user?: { userId: string; role: import('@prisma/client').UserRole; organizationId: string | null } }) {
  return {
    userId: req.user!.userId,
    role: req.user!.role,
    organizationId: getOrganizationId(req as never),
  };
}

router.use(...orgStaffPipeline);

router.get(
  '/portal-access-settings',
  requirePermission(Permission.SETTINGS_VIEW),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await portalAccess.getOrgSettingsByOrgId(getOrganizationId(req)));
  }),
);

router.patch(
  '/portal-access-settings',
  requirePermission(Permission.SETTINGS_EDIT),
  validateBody(portalSettingsSchema),
  asyncHandler(async (req, res) => {
    const settings = await portalAccess.updateOrgSettings(actor(req), req.body);
    sendSuccess(res, settings, 'Paramètres portail mis à jour');
  }),
);

router.get(
  '/',
  requirePermission(Permission.TENANT_VIEW),
  validateQuery(tenantListQuerySchema),
  asyncHandler(async (req, res) => {
    const orgId = getOrganizationId(req);
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const { search } = req.query as { search?: string };
    const { items, total } = await service.list(orgId, page, limit, skip, search);
    sendSuccess(res, items, undefined, 200, toPaginationMeta(page, limit, total));
  }),
);

router.get(
  '/:id/portal-access',
  requirePermission(Permission.TENANT_PORTAL_VIEW_STATUS),
  requireOrgResource('tenant'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await portalAccess.getStatus(actor(req), req.params.id));
  }),
);

router.post(
  '/:id/portal-access',
  requirePermission(Permission.TENANT_PORTAL_PROVISION),
  requireOrgResource('tenant'),
  asyncHandler(async (req, res) => {
    const result = await portalAccess.provision(actor(req), req.params.id);
    sendSuccess(res, result, result.message, 201);
  }),
);

router.post(
  '/:id/portal-access/regenerate',
  requirePermission(Permission.TENANT_PORTAL_REGENERATE),
  requireOrgResource('tenant'),
  asyncHandler(async (req, res) => {
    const result = await portalAccess.regenerate(actor(req), req.params.id);
    sendSuccess(res, result, 'Mot de passe temporaire régénéré');
  }),
);

router.post(
  '/:id/portal-access/reset',
  requirePermission(Permission.TENANT_PORTAL_RESET),
  requireOrgResource('tenant'),
  asyncHandler(async (req, res) => {
    const result = await portalAccess.reset(actor(req), req.params.id);
    sendSuccess(res, result, 'Compte portail réinitialisé');
  }),
);

router.post(
  '/:id/portal-access/suspend',
  requirePermission(Permission.TENANT_PORTAL_SUSPEND),
  requireOrgResource('tenant'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await portalAccess.suspend(actor(req), req.params.id), 'Accès suspendu');
  }),
);

router.post(
  '/:id/portal-access/reactivate',
  requirePermission(Permission.TENANT_PORTAL_SUSPEND),
  requireOrgResource('tenant'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await portalAccess.reactivate(actor(req), req.params.id), 'Accès réactivé');
  }),
);

router.post(
  '/:id/portal-access/archive',
  requirePermission(Permission.TENANT_PORTAL_SUSPEND),
  requireOrgResource('tenant'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await portalAccess.archive(actor(req), req.params.id), 'Accès archivé');
  }),
);

router.get(
  '/:id',
  requirePermission(Permission.TENANT_VIEW),
  requireOrgResource('tenant'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.get(getOrganizationId(req), req.params.id));
  }),
);

router.post(
  '/',
  requirePermission(Permission.TENANT_CREATE),
  validateBody(createTenantSchema),
  asyncHandler(async (req, res) => {
    const created = await withAudit(req, AuditAction.TENANT_CREATE, () => service.create(getOrganizationId(req), req.body), (r) => ({
      resourceType: 'Tenant',
      resourceId: r.id,
      newValue: { firstName: r.firstName, lastName: r.lastName },
    }));
    sendSuccess(res, created, 'Locataire créé', 201);
  }),
);

router.put(
  '/:id',
  requirePermission(Permission.TENANT_EDIT),
  requireOrgResource('tenant'),
  validateBody(updateTenantSchema),
  asyncHandler(async (req, res) => {
    const orgId = getOrganizationId(req);
    const before = await service.get(orgId, req.params.id);
    const updated = await withAudit(req, AuditAction.TENANT_UPDATE, () => service.update(orgId, req.params.id, req.body), (r) => ({
      resourceType: 'Tenant',
      resourceId: r.id,
      oldValue: { firstName: before.firstName, lastName: before.lastName },
      newValue: { firstName: r.firstName, lastName: r.lastName },
    }));
    sendSuccess(res, updated, 'Locataire mis à jour');
  }),
);

router.delete(
  '/:id',
  requirePermission(Permission.TENANT_DELETE),
  requireOrgResource('tenant'),
  asyncHandler(async (req, res) => {
    const orgId = getOrganizationId(req);
    const existing = await service.get(orgId, req.params.id);
    await service.delete(orgId, req.params.id);
    await auditSuccess(req, AuditAction.TENANT_DELETE, {
      resourceType: 'Tenant',
      resourceId: req.params.id,
      oldValue: { firstName: existing.firstName, lastName: existing.lastName },
    });
    sendSuccess(res, null, 'Locataire supprimé');
  }),
);

export default router;
