import { Router, type Request } from 'express';
import { container } from 'tsyringe';
import { MaintenanceService } from './maintenance.service.js';
import {
  addNoteSchema,
  assignMaintenanceSchema,
  createMaintenanceSchema,
  maintenanceListQuerySchema,
  updateMaintenanceSchema,
} from './maintenance.schema.js';
import { getOrganizationId } from '../../shared/middleware/auth.middleware.js';
import { Permission } from '../../shared/auth/permissions.js';
import { orgStaffPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { requireOrgResource } from '../../shared/middleware/resource-guard.middleware.js';
import { validateBody, validateQuery } from '../../shared/middleware/validate.middleware.js';
import { asyncHandler, getPagination, sendSuccess, toPaginationMeta } from '../../shared/utils/response.util.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { withAudit } from '../../shared/audit/audit-request.js';

const router = Router();
const service = container.resolve(MaintenanceService);

router.use(...orgStaffPipeline);

function actorFrom(req: Request) {
  const u = req.user!;
  return { userId: u.userId, name: u.email };
}

router.get(
  '/',
  requirePermission(Permission.MAINTENANCE_VIEW),
  validateQuery(maintenanceListQuerySchema),
  asyncHandler(async (req, res) => {
    const orgId = getOrganizationId(req);
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const { status, priority, apartmentId, buildingId } = req.query as {
      status?: import('@prisma/client').MaintenanceTicketStatus;
      priority?: import('@prisma/client').MaintenancePriority;
      apartmentId?: string;
      buildingId?: string;
    };
    const { items, total } = await service.list(orgId, skip, limit, {
      status,
      priority,
      apartmentId,
      buildingId,
    });
    sendSuccess(res, items, undefined, 200, toPaginationMeta(page, limit, total));
  }),
);

/** Liste des agents assignables — AVANT /:id pour éviter le conflit de route. */
router.get(
  '/agents',
  requirePermission(Permission.MAINTENANCE_ASSIGN),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.listMaintenanceAgents(getOrganizationId(req)));
  }),
);

router.get(
  '/:id',
  requirePermission(Permission.MAINTENANCE_VIEW),
  requireOrgResource('maintenanceTicket'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.get(getOrganizationId(req), req.params.id));
  }),
);

router.post(
  '/',
  requirePermission(Permission.MAINTENANCE_CREATE),
  validateBody(createMaintenanceSchema),
  asyncHandler(async (req, res) => {
    const created = await withAudit(
      req,
      AuditAction.MAINTENANCE_CREATE,
      () => service.create(getOrganizationId(req), req.body, actorFrom(req)),
      (r) => ({ resourceType: 'MaintenanceTicket', resourceId: r.id, newValue: { title: r.title } }),
    );
    sendSuccess(res, created, 'Ticket créé', 201);
  }),
);

router.patch(
  '/:id',
  requirePermission(Permission.MAINTENANCE_EDIT),
  requireOrgResource('maintenanceTicket'),
  validateBody(updateMaintenanceSchema),
  asyncHandler(async (req, res) => {
    const updated = await withAudit(
      req,
      AuditAction.MAINTENANCE_UPDATE,
      () => service.update(getOrganizationId(req), req.params.id, req.body, actorFrom(req)),
      (r) => ({ resourceType: 'MaintenanceTicket', resourceId: r.id, newValue: { status: r.status } }),
    );
    sendSuccess(res, updated, 'Ticket mis à jour');
  }),
);

router.post(
  '/:id/assign',
  requirePermission(Permission.MAINTENANCE_ASSIGN),
  requireOrgResource('maintenanceTicket'),
  validateBody(assignMaintenanceSchema),
  asyncHandler(async (req, res) => {
    const assigned = await withAudit(
      req,
      AuditAction.MAINTENANCE_ASSIGN,
      () => service.assign(getOrganizationId(req), req.params.id, req.body, actorFrom(req)),
      (r) => ({ resourceType: 'MaintenanceTicket', resourceId: r.id, newValue: { assignedToId: r.assignedToId } }),
    );
    sendSuccess(res, assigned, 'Technicien assigné');
  }),
);

router.post(
  '/:id/start',
  requirePermission(Permission.MAINTENANCE_EDIT),
  requireOrgResource('maintenanceTicket'),
  asyncHandler(async (req, res) => {
    const started = await withAudit(
      req,
      AuditAction.MAINTENANCE_UPDATE,
      () => service.start(getOrganizationId(req), req.params.id, actorFrom(req)),
      (r) => ({ resourceType: 'MaintenanceTicket', resourceId: r.id, newValue: { status: r.status } }),
    );
    sendSuccess(res, started, 'Intervention démarrée');
  }),
);

router.post(
  '/:id/complete',
  requirePermission(Permission.MAINTENANCE_CLOSE),
  requireOrgResource('maintenanceTicket'),
  asyncHandler(async (req, res) => {
    const completed = await withAudit(
      req,
      AuditAction.MAINTENANCE_CLOSE,
      () => service.complete(getOrganizationId(req), req.params.id, actorFrom(req)),
      (r) => ({ resourceType: 'MaintenanceTicket', resourceId: r.id, newValue: { status: r.status } }),
    );
    sendSuccess(res, completed, 'Intervention terminée');
  }),
);

router.post(
  '/:id/close',
  requirePermission(Permission.MAINTENANCE_CLOSE),
  requireOrgResource('maintenanceTicket'),
  asyncHandler(async (req, res) => {
    const closed = await withAudit(
      req,
      AuditAction.MAINTENANCE_CLOSE,
      () => service.close(getOrganizationId(req), req.params.id, actorFrom(req)),
      (r) => ({ resourceType: 'MaintenanceTicket', resourceId: r.id, newValue: { status: r.status } }),
    );
    sendSuccess(res, closed, 'Ticket clôturé');
  }),
);

router.post(
  '/:id/notes',
  requirePermission(Permission.MAINTENANCE_EDIT),
  requireOrgResource('maintenanceTicket'),
  validateBody(addNoteSchema),
  asyncHandler(async (req, res) => {
    const note = await withAudit(
      req,
      AuditAction.MAINTENANCE_UPDATE,
      () => service.addNote(getOrganizationId(req), req.params.id, req.body.message, actorFrom(req)),
      () => ({ resourceType: 'MaintenanceTicket', resourceId: req.params.id }),
    );
    sendSuccess(res, note, 'Note ajoutée');
  }),
);

export default router;
