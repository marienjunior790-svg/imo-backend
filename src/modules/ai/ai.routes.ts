import { Router } from 'express';
import multer from 'multer';
import { container } from 'tsyringe';
import { AiService } from './ai.service.js';
import { aiChatSchema, aiAnalyzeSchema, aiContractSchema, aiNormalizeSchema } from './ai.schema.js';
import { getOrganizationId } from '../../shared/middleware/auth.middleware.js';
import { Permission } from '../../shared/auth/permissions.js';
import { orgStaffPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { validateBody } from '../../shared/middleware/validate.middleware.js';
import { requireFeature } from '../../shared/middleware/feature.middleware.js';
import { FeatureKey } from '../../shared/constants/feature-keys.js';
import { asyncHandler, sendSuccess } from '../../shared/utils/response.util.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { withAudit } from '../../shared/audit/audit-request.js';
import { ValidationError } from '../../shared/errors/app.error.js';

const router = Router();
const service = container.resolve(AiService);

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('audio/') ||
      file.mimetype === 'video/mp4' || // parfois les enregistrements Android
      file.mimetype === 'application/octet-stream';
    cb(null, ok);
  },
});

router.use(...orgStaffPipeline);

/** GET /ai/suggestions — questions suggérées (contextuelles si org dispo) */
router.get(
  '/suggestions',
  requirePermission(Permission.AI_USE),
  asyncHandler(async (req, res) => {
    const orgId = getOrganizationId(req);
    const suggestions = await service.contextualSuggestions(orgId);
    sendSuccess(res, { suggestions });
  }),
);

/** GET /ai/analysis-types — types d'analyses LIA */
router.get(
  '/analysis-types',
  requirePermission(Permission.AI_USE),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { types: service.getAnalysisTypes() });
  }),
);

/** GET /ai/forecast — estimations déterministes (pas de ML) */
router.get(
  '/forecast',
  requirePermission(Permission.AI_USE),
  requireFeature(FeatureKey.ACCESS_LIA),
  asyncHandler(async (req, res) => {
    const result = await service.forecast(getOrganizationId(req), req.user!.userId, req.user!.role);
    sendSuccess(res, result);
  }),
);

/** POST /ai/chat — assistant conversationnel ITC */
router.post(
  '/chat',
  requirePermission(Permission.AI_USE),
  requireFeature(FeatureKey.ACCESS_AI),
  validateBody(aiChatSchema),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.AI_USE,
      () => service.chat(getOrganizationId(req), req.user!.userId, req.user!.role, req.body),
      () => ({ resourceType: 'AiChat', newValue: { mode: 'chat' } }),
    );
    sendSuccess(res, result);
  }),
);

/** POST /ai/transcribe — audio → transcription + réponse copilote */
router.post(
  '/transcribe',
  requirePermission(Permission.AI_USE),
  requireFeature(FeatureKey.ACCESS_AI),
  mediaUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('Fichier audio requis (champ file)');
    let history: Array<{ role: 'user' | 'assistant'; content: string }> | undefined;
    if (typeof req.body?.history === 'string' && req.body.history) {
      try {
        history = JSON.parse(req.body.history);
      } catch {
        history = undefined;
      }
    }
    const result = await withAudit(
      req,
      AuditAction.AI_USE,
      () =>
        service.chatFromAudio(
          getOrganizationId(req),
          req.user!.userId,
          req.user!.role,
          req.file!,
          history,
        ),
      () => ({ resourceType: 'AiAudio', newValue: { mode: 'transcribe' } }),
    );
    sendSuccess(res, result);
  }),
);

/** POST /ai/vision — image → lecture OCR / manuscrit / documents */
router.post(
  '/vision',
  requirePermission(Permission.AI_USE),
  requireFeature(FeatureKey.ACCESS_AI),
  mediaUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('Fichier image requis (champ file)');
    let history: Array<{ role: 'user' | 'assistant'; content: string }> | undefined;
    if (typeof req.body?.history === 'string' && req.body.history) {
      try {
        history = JSON.parse(req.body.history);
      } catch {
        history = undefined;
      }
    }
    const message = typeof req.body?.message === 'string' ? req.body.message : undefined;
    const result = await withAudit(
      req,
      AuditAction.AI_USE,
      () =>
        service.chatFromImage(
          getOrganizationId(req),
          req.user!.userId,
          req.user!.role,
          req.file!,
          message,
          history,
        ),
      () => ({ resourceType: 'AiVision', newValue: { mode: 'vision' } }),
    );
    sendSuccess(res, result);
  }),
);

/** POST /ai/normalize — corrige fautes / faux mots */
router.post(
  '/normalize',
  requirePermission(Permission.AI_USE),
  requireFeature(FeatureKey.ACCESS_AI),
  validateBody(aiNormalizeSchema),
  asyncHandler(async (req, res) => {
    const result = await service.normalizeText(
      getOrganizationId(req),
      req.user!.userId,
      req.user!.role,
      req.body.text,
    );
    sendSuccess(res, result);
  }),
);

/** POST /ai/contract — génère un contrat PDF pro (bailleur / locataire / agent) */
router.post(
  '/contract',
  requirePermission(Permission.AI_USE),
  requireFeature(FeatureKey.ACCESS_AI),
  validateBody(aiContractSchema),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.AI_USE,
      () =>
        service.generateContract(
          getOrganizationId(req),
          req.user!.userId,
          req.user!.role,
          req.body,
        ),
      () => ({ resourceType: 'AiContract', newValue: { leaseId: req.body.leaseId ?? null } }),
    );
    sendSuccess(res, result);
  }),
);

/** POST /ai/analyze — analyses de données LIA */
router.post(
  '/analyze',
  requirePermission(Permission.AI_USE),
  requireFeature(FeatureKey.ACCESS_LIA),
  validateBody(aiAnalyzeSchema),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.AI_USE,
      () => service.analyze(getOrganizationId(req), req.user!.userId, req.user!.role, req.body),
      () => ({ resourceType: 'AiAnalysis', newValue: { type: req.body.type } }),
    );
    sendSuccess(res, result);
  }),
);

export default router;
