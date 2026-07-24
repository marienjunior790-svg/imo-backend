import { Router } from 'express';
import { container } from 'tsyringe';
import { LeaseStatus } from '@prisma/client';
import { LeaseService } from './lease.service.js';
import { createLeaseSchema, leaseListQuerySchema, renewLeaseSchema, updateLeaseSchema } from './lease.schema.js';
import { getOrganizationId } from '../../shared/middleware/auth.middleware.js';
import { Permission } from '../../shared/auth/permissions.js';
import { orgStaffPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { requireOrgResource } from '../../shared/middleware/resource-guard.middleware.js';
import { validateBody, validateQuery } from '../../shared/middleware/validate.middleware.js';
import { requireFeature } from '../../shared/middleware/feature.middleware.js';
import { FeatureKey } from '../../shared/constants/feature-keys.js';
import { asyncHandler, getPagination, sendSuccess, toPaginationMeta } from '../../shared/utils/response.util.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { withAudit } from '../../shared/audit/audit-request.js';

const router = Router();
const service = container.resolve(LeaseService);

router.use(...orgStaffPipeline);

router.get(
  '/',
  requirePermission(Permission.LEASE_VIEW),
  validateQuery(leaseListQuerySchema),
  asyncHandler(async (req, res) => {
    const orgId = getOrganizationId(req);
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const { status } = req.query as { status?: LeaseStatus };
    const { items, total } = await service.list(orgId, page, limit, skip, status);
    sendSuccess(res, items, undefined, 200, toPaginationMeta(page, limit, total));
  }),
);

router.get(
  '/:id',
  requirePermission(Permission.LEASE_VIEW),
  requireOrgResource('lease'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.get(getOrganizationId(req), req.params.id));
  }),
);

router.post(
  '/',
  requirePermission(Permission.LEASE_CREATE),
  requireFeature(FeatureKey.CREATE_LEASE),
  validateBody(createLeaseSchema),
  asyncHandler(async (req, res) => {
    const created = await withAudit(req, AuditAction.LEASE_CREATE, () => service.create(getOrganizationId(req), req.body), (r) => ({
      resourceType: 'Lease',
      resourceId: r.id,
      newValue: { apartmentId: r.apartmentId, tenantId: r.tenantId },
    }));
    sendSuccess(res, created, 'Contrat créé', 201);
  }),
);

router.put(
  '/:id',
  requirePermission(Permission.LEASE_EDIT),
  requireOrgResource('lease'),
  requireFeature(FeatureKey.EDIT_LEASE),
  validateBody(updateLeaseSchema),
  asyncHandler(async (req, res) => {
    const updated = await withAudit(
      req,
      AuditAction.LEASE_UPDATE,
      () => service.update(getOrganizationId(req), req.params.id, req.body),
      (r) => ({ resourceType: 'Lease', resourceId: r.id, newValue: { status: r.status } }),
    );
    sendSuccess(res, updated, 'Contrat mis à jour');
  }),
);

router.post(
  '/:id/activate',
  requirePermission(Permission.LEASE_SIGN),
  requireOrgResource('lease'),
  asyncHandler(async (req, res) => {
    const activated = await withAudit(
      req,
      AuditAction.LEASE_SIGN,
      () => service.activate(getOrganizationId(req), req.params.id, req.user!.userId),
      (r) => ({ resourceType: 'Lease', resourceId: r.id, newValue: { status: r.status } }),
    );
    sendSuccess(res, activated, 'Contrat activé');
  }),
);

router.post(
  '/:id/renew',
  requirePermission(Permission.LEASE_RENEW),
  requireOrgResource('lease'),
  validateBody(renewLeaseSchema),
  asyncHandler(async (req, res) => {
    const renewed = await withAudit(
      req,
      AuditAction.LEASE_RENEW,
      () => service.renew(getOrganizationId(req), req.params.id, req.body),
      (r) => ({
        resourceType: 'Lease',
        resourceId: r.id,
        newValue: { endDate: r.endDate, status: r.status },
      }),
    );
    sendSuccess(res, renewed, 'Bail renouvelé');
  }),
);

router.post(
  '/:id/terminate',
  requirePermission(Permission.LEASE_TERMINATE),
  requireOrgResource('lease'),
  asyncHandler(async (req, res) => {
    const terminated = await withAudit(
      req,
      AuditAction.LEASE_TERMINATE,
      () => service.terminate(getOrganizationId(req), req.params.id),
      (r) => ({ resourceType: 'Lease', resourceId: r.id, newValue: { status: r.status } }),
    );
    sendSuccess(res, terminated, 'Contrat résilié');
  }),
);

router.post(
  '/:id/generate-pdf',
  requirePermission(Permission.LEASE_EXPORT_PDF),
  requireOrgResource('lease'),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.LEASE_EXPORT_PDF,
      () => service.generateContractPdf(getOrganizationId(req), req.params.id),
      () => ({ resourceType: 'Lease', resourceId: req.params.id }),
    );
    sendSuccess(res, result, 'PDF contrat généré');
  }),
);

export default router;
