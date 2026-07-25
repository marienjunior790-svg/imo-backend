import { Router, type Request } from 'express';
import multer from 'multer';
import { container } from 'tsyringe';
import { MaintenanceService } from '../maintenance/maintenance.service.js';
import { maintenanceListQuerySchema } from '../maintenance/maintenance.schema.js';
import { agentCommentSchema, agentPhotoSchema, agentRefuseSchema } from './agent.schema.js';
import { CloudinaryService } from '../../infrastructure/storage/cloudinary.service.js';
import { getOrganizationId } from '../../shared/middleware/auth.middleware.js';
import { Permission } from '../../shared/auth/permissions.js';
import { maintenanceAgentPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { validateBody, validateQuery } from '../../shared/middleware/validate.middleware.js';
import { ValidationError } from '../../shared/errors/app.error.js';
import { asyncHandler, getPagination, sendSuccess, toPaginationMeta } from '../../shared/utils/response.util.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { withAudit } from '../../shared/audit/audit-request.js';
import type { PhotoPhase } from '../maintenance/maintenance.photos.js';

/**
 * Portail agent de maintenance.
 * Monté sur /agent (canonique) et /technician (alias legacy — anciens clients mobiles).
 * Toutes les routes sont doublement scopées : organisation + assignation à l'agent connecté.
 */
const router = Router();
const service = container.resolve(MaintenanceService);
const cloudinary = container.resolve(CloudinaryService);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
  },
});

router.use(...maintenanceAgentPipeline);

function actorFrom(req: Request) {
  const u = req.user!;
  return { userId: u.userId, name: u.email };
}

/** Tableau de bord agent — compteurs et prochaines interventions. */
router.get(
  '/dashboard',
  requirePermission(Permission.TECH_HOME_VIEW),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await service.agentStats(getOrganizationId(req), req.user!.userId));
  }),
);

router.get(
  '/jobs',
  requirePermission(Permission.TECH_JOBS_VIEW),
  validateQuery(maintenanceListQuerySchema),
  asyncHandler(async (req, res) => {
    const orgId = getOrganizationId(req);
    const userId = req.user!.userId;
    const { page, limit, skip } = getPagination(req.query as { page?: string; limit?: string });
    const { status, priority } = req.query as {
      status?: import('@prisma/client').MaintenanceTicketStatus;
      priority?: import('@prisma/client').MaintenancePriority;
    };
    const { items, total } = await service.listForAgent(orgId, userId, skip, limit, { status, priority });
    sendSuccess(res, items, undefined, 200, toPaginationMeta(page, limit, total));
  }),
);

router.get('/jobs/:id', requirePermission(Permission.TECH_JOBS_VIEW), asyncHandler(async (req, res) => {
  sendSuccess(res, await service.getForAgent(getOrganizationId(req), req.user!.userId, req.params.id));
}));

router.post('/jobs/:id/accept', requirePermission(Permission.TECH_JOBS_MANAGE), asyncHandler(async (req, res) => {
  const result = await withAudit(
    req,
    AuditAction.MAINTENANCE_ASSIGN,
    () => service.acceptJob(getOrganizationId(req), req.params.id, actorFrom(req)),
    (r) => ({ resourceType: 'MaintenanceTicket', resourceId: r.id }),
  );
  sendSuccess(res, result, 'Intervention acceptée');
}));

router.post(
  '/jobs/:id/refuse',
  requirePermission(Permission.TECH_JOBS_MANAGE),
  validateBody(agentRefuseSchema),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.MAINTENANCE_UPDATE,
      () =>
        service.refuseJob(
          getOrganizationId(req),
          req.params.id,
          actorFrom(req),
          req.body.reason as string | undefined,
        ),
      (r) => ({ resourceType: 'MaintenanceTicket', resourceId: r.id, newValue: { status: r.status } }),
    );
    sendSuccess(res, result, 'Mission refusée');
  }),
);

router.post('/jobs/:id/start', requirePermission(Permission.TECH_JOBS_MANAGE), asyncHandler(async (req, res) => {
  const result = await withAudit(
    req,
    AuditAction.MAINTENANCE_UPDATE,
    () => service.startForAgent(getOrganizationId(req), req.params.id, actorFrom(req)),
    (r) => ({ resourceType: 'MaintenanceTicket', resourceId: r.id, newValue: { status: r.status } }),
  );
  sendSuccess(res, result, 'Intervention démarrée');
}));

router.post(
  '/jobs/:id/comment',
  requirePermission(Permission.TECH_JOBS_COMMENT),
  validateBody(agentCommentSchema),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.MAINTENANCE_UPDATE,
      () => service.addAgentNote(getOrganizationId(req), req.params.id, req.body.message, actorFrom(req)),
      (r) => ({ resourceType: 'MaintenanceTicket', resourceId: r.id }),
    );
    sendSuccess(res, result, 'Commentaire ajouté', 201);
  }),
);

router.post(
  '/jobs/:id/photos',
  requirePermission(Permission.TECH_PHOTO_UPLOAD),
  upload.single('file'),
  validateBody(agentPhotoSchema),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new ValidationError('Photo requise (JPEG, PNG ou WebP, 10 Mo max)');
    const orgId = getOrganizationId(req);
    const actor = actorFrom(req);
    const phase = req.body.phase as PhotoPhase;

    const uploaded = await cloudinary.uploadFile(file, {
      folder: `immo-tec/${orgId}/maintenance/${req.params.id}`,
    });

    const result = await withAudit(
      req,
      AuditAction.MAINTENANCE_UPDATE,
      () =>
        service.attachPhoto(
          orgId,
          req.params.id,
          phase,
          {
            url: uploaded.url,
            publicId: uploaded.publicId,
            fileName: file.originalname,
            uploadedById: actor.userId,
            uploadedAt: new Date().toISOString(),
          },
          actor,
          { scopeToAssignee: true },
        ),
      (r) => ({ resourceType: 'MaintenanceTicket', resourceId: r.id, newValue: { phase } }),
    );
    sendSuccess(res, result, 'Photo ajoutée', 201);
  }),
);

router.post('/jobs/:id/complete', requirePermission(Permission.MAINTENANCE_CLOSE), asyncHandler(async (req, res) => {
  const result = await withAudit(
    req,
    AuditAction.MAINTENANCE_CLOSE,
    () => service.completeForAgent(getOrganizationId(req), req.params.id, actorFrom(req)),
    (r) => ({ resourceType: 'MaintenanceTicket', resourceId: r.id, newValue: { status: r.status } }),
  );
  sendSuccess(res, result, 'Intervention terminée');
}));

router.post('/jobs/:id/close', requirePermission(Permission.MAINTENANCE_CLOSE), asyncHandler(async (req, res) => {
  const result = await withAudit(
    req,
    AuditAction.MAINTENANCE_CLOSE,
    () => service.closeForAgent(getOrganizationId(req), req.params.id, actorFrom(req)),
    (r) => ({ resourceType: 'MaintenanceTicket', resourceId: r.id, newValue: { status: r.status } }),
  );
  sendSuccess(res, result, 'Intervention clôturée');
}));

export default router;
