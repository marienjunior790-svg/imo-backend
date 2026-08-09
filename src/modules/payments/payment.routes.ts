import { Router } from 'express';
import { container } from 'tsyringe';
import { PaymentStatus } from '@prisma/client';
import { PaymentService } from './payment.service.js';
import { createPaymentSchema, mobileMoneyWebhookSchema, paymentListQuerySchema, recordPaymentSchema } from './payment.schema.js';
import { getOrganizationId } from '../../shared/middleware/auth.middleware.js';
import { Permission } from '../../shared/auth/permissions.js';
import { orgStaffPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { requireOrgResource } from '../../shared/middleware/resource-guard.middleware.js';
import { validateBody, validateQuery } from '../../shared/middleware/validate.middleware.js';
import { requireFeature } from '../../shared/middleware/feature.middleware.js';
import { FeatureKey } from '../../shared/constants/feature-keys.js';
import { verifyAutomationKey } from '../../shared/middleware/automation.middleware.js';
import { asyncHandler, getPagination, sendSuccess, toPaginationMeta } from '../../shared/utils/response.util.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { auditSuccess, auditSystem, withAudit } from '../../shared/audit/audit-request.js';

const router = Router();
const service = container.resolve(PaymentService);

router.post(
  '/webhooks/mobile-money',
  verifyAutomationKey,
  validateBody(mobileMoneyWebhookSchema),
  asyncHandler(async (req, res) => {
    const result = await service.processMobileMoneyWebhook(req.body);
    await auditSystem(AuditAction.PAYMENT_VALIDATE, {
      resourceType: 'Payment',
      resourceId: result?.id,
      newValue: { source: 'mobile-money-webhook' },
    });
    sendSuccess(res, result, 'Paiement Mobile Money enregistré');
  }),
);

router.use(...orgStaffPipeline);

router.get(
  '/export',
  requirePermission(Permission.PAYMENT_EXPORT_EXCEL),
  asyncHandler(async (req, res) => {
    const orgId = getOrganizationId(req);
    const csv = await service.exportExcel(orgId);
    await auditSuccess(req, AuditAction.PAYMENT_EXPORT_EXCEL, {
      resourceType: 'Payment',
      newValue: { organizationId: orgId },
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="paiements.csv"');
    res.send(csv);
  }),
);

router.get(
  '/',
  requirePermission(Permission.PAYMENT_VIEW),
  validateQuery(paymentListQuerySchema),
  asyncHandler(async (req, res) => {
    const orgId = getOrganizationId(req);
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const { status, leaseId, buildingId, apartmentId } = req.query as {
      status?: PaymentStatus;
      leaseId?: string;
      buildingId?: string;
      apartmentId?: string;
    };
    const { items, total } = await service.list(orgId, page, limit, skip, {
      status,
      leaseId,
      buildingId,
      apartmentId,
    });
    sendSuccess(res, items, undefined, 200, toPaginationMeta(page, limit, total));
  }),
);

router.get(
  '/:id',
  requirePermission(Permission.PAYMENT_VIEW),
  requireOrgResource('payment'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.get(getOrganizationId(req), req.params.id));
  }),
);

router.post(
  '/',
  requirePermission(Permission.PAYMENT_CREATE),
  requireFeature(FeatureKey.RECORD_PAYMENT),
  validateBody(createPaymentSchema),
  asyncHandler(async (req, res) => {
    const created = await withAudit(req, AuditAction.PAYMENT_CREATE, () => service.create(getOrganizationId(req), req.body), (r) => ({
      resourceType: 'Payment',
      resourceId: r.id,
      newValue: { leaseId: r.leaseId, amount: r.amount },
    }));
    sendSuccess(res, created, 'Échéance créée', 201);
  }),
);

router.post(
  '/:id/record',
  requirePermission(Permission.PAYMENT_VALIDATE),
  requireOrgResource('payment'),
  requireFeature(FeatureKey.RECORD_PAYMENT),
  validateBody(recordPaymentSchema),
  asyncHandler(async (req, res) => {
    const recorded = await withAudit(
      req,
      AuditAction.PAYMENT_VALIDATE,
      () => service.recordPayment(getOrganizationId(req), req.params.id, req.body),
      (r) => ({ resourceType: 'Payment', resourceId: r.id, newValue: { status: r.status } }),
    );
    sendSuccess(res, recorded, 'Paiement enregistré');
  }),
);

router.post(
  '/:id/initiate-mobile-money',
  requirePermission(Permission.PAYMENT_CREATE),
  requireOrgResource('payment'),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.PAYMENT_CREATE,
      () => service.initiateMobileMoney(getOrganizationId(req), req.params.id),
      (r) => ({ resourceType: 'Payment', resourceId: req.params.id, newValue: { reference: r.reference } }),
    );
    sendSuccess(res, result, 'Référence Mobile Money générée');
  }),
);

router.post(
  '/:id/generate-receipt',
  requirePermission(Permission.PAYMENT_EXPORT_PDF),
  requireOrgResource('payment'),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.PAYMENT_EXPORT_PDF,
      () => service.generateReceiptPdf(getOrganizationId(req), req.params.id),
      () => ({ resourceType: 'Payment', resourceId: req.params.id }),
    );
    sendSuccess(res, result, 'Reçu PDF généré');
  }),
);

router.post(
  '/:id/generate-notice',
  requirePermission(Permission.PAYMENT_EXPORT_PDF),
  requireOrgResource('payment'),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.PAYMENT_EXPORT_PDF,
      () => service.generateNoticePdf(getOrganizationId(req), req.params.id),
      () => ({ resourceType: 'Payment', resourceId: req.params.id }),
    );
    sendSuccess(res, result, 'Avis de paiement PDF généré');
  }),
);

export default router;
