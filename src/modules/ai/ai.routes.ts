import { Router } from 'express';
import multer from 'multer';
import { container } from 'tsyringe';
import { AiService } from './ai.service.js';
import {
  aiChatSchema,
  aiAnalyzeSchema,
  aiContractSchema,
  aiNormalizeSchema,
  aiActionConfirmSchema,
  aiSpeakSchema,
} from './ai.schema.js';
import { getOrganizationId } from '../../shared/middleware/auth.middleware.js';
import { Permission } from '../../shared/auth/permissions.js';
import { orgStaffPipeline } from '../../shared/middleware/security.stack.js';
import { requirePermission } from '../../shared/middleware/permission.middleware.js';
import { validateBody } from '../../shared/middleware/validate.middleware.js';
import { requireFeature } from '../../shared/middleware/feature.middleware.js';
import { FeatureKey } from '../../shared/constants/feature-keys.js';
import { asyncHandler, sendError, sendSuccess } from '../../shared/utils/response.util.js';
import { AuditAction } from '../../shared/audit/audit-actions.js';
import { auditFailure, auditSuccess, withAudit } from '../../shared/audit/audit-request.js';
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
      file.mimetype === 'video/mp4' ||
      file.mimetype === 'application/octet-stream' ||
      file.mimetype === 'application/pdf';
    cb(null, ok);
  },
});

router.use(...orgStaffPipeline);

/** GET /ai/status — mode openai | local (jamais de secret exposé) */
router.get(
  '/status',
  requirePermission(Permission.AI_USE),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, service.getStatus());
  }),
);

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

/** POST /ai/chat — assistant conversationnel ITC (+ outils données réelles) */
router.post(
  '/chat',
  requirePermission(Permission.AI_USE),
  requireFeature(FeatureKey.ACCESS_AI),
  validateBody(aiChatSchema),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.AI_CHAT,
      () => service.chat(getOrganizationId(req), req.user!.userId, req.user!.role, req.body),
      (r) => ({
        resourceType: 'AiChat',
        newValue: {
          mode: r.poweredBy,
          toolsUsed: r.toolsUsed ?? [],
          pendingActionId: r.pendingAction?.id ?? null,
        },
      }),
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

/** POST /ai/contract — propose un contrat (confirmation obligatoire ensuite) */
router.post(
  '/contract',
  requirePermission(Permission.AI_USE),
  requireFeature(FeatureKey.ACCESS_AI),
  validateBody(aiContractSchema),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.AI_CONTRACT_PROPOSE,
      () =>
        service.proposeLeasePdf(
          getOrganizationId(req),
          req.user!.userId,
          req.user!.role,
          req.body.leaseId,
        ),
      (r) => ({
        resourceType: 'AiContract',
        newValue: { leaseId: req.body.leaseId ?? null, pendingActionId: r.pendingAction?.id ?? null },
      }),
    );
    sendSuccess(res, result);
  }),
);

/** POST /ai/actions/confirm — exécute une action sensible après confirmation */
router.post(
  '/actions/confirm',
  requirePermission(Permission.AI_USE),
  requireFeature(FeatureKey.ACCESS_AI),
  validateBody(aiActionConfirmSchema),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.AI_CONTRACT_CONFIRM,
      () =>
        service.confirmAction(
          getOrganizationId(req),
          req.user!.userId,
          req.user!.role,
          req.body.actionId,
        ),
      (r) => ({
        resourceType: 'AiAction',
        resourceId: req.body.actionId,
        newValue: { documentUrl: r.documentUrl ?? null, status: 'CONFIRMED' },
      }),
    );
    sendSuccess(res, result);
  }),
);

/** POST /ai/actions/cancel */
router.post(
  '/actions/cancel',
  requirePermission(Permission.AI_USE),
  requireFeature(FeatureKey.ACCESS_AI),
  validateBody(aiActionConfirmSchema),
  asyncHandler(async (req, res) => {
    const result = await withAudit(
      req,
      AuditAction.AI_ACTION_CANCEL,
      () =>
        service.cancelAction(
          getOrganizationId(req),
          req.user!.userId,
          req.user!.role,
          req.body.actionId,
        ),
      () => ({
        resourceType: 'AiAction',
        resourceId: req.body.actionId,
        newValue: { status: 'CANCELLED' },
      }),
    );
    sendSuccess(res, result);
  }),
);

/** POST /ai/speak — TTS (mp3 binaire) */
router.post(
  '/speak',
  requirePermission(Permission.AI_USE),
  requireFeature(FeatureKey.ACCESS_AI),
  validateBody(aiSpeakSchema),
  asyncHandler(async (req, res) => {
    try {
      // TTS d’abord — l’audit ne doit pas bloquer ni perdre l’audio.
      const audio = await service.speak(
        getOrganizationId(req),
        req.user!.userId,
        req.user!.role,
        req.body.text,
      );
      try {
        await auditSuccess(req, AuditAction.AI_TTS, {
          resourceType: 'AiTts',
          newValue: { chars: String(req.body.text).length },
        });
      } catch (auditErr) {
        console.error('[ai.speak] auditSuccess failed (non-blocking):', auditErr);
      }
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', String(audio.length));
      res.status(200);
      res.end(audio);
    } catch (err) {
      try {
        await auditFailure(req, AuditAction.AI_TTS, {
          resourceType: 'AiTts',
          errorMessage: err instanceof Error ? err.message : 'Erreur TTS',
        });
      } catch {
        /* ignore */
      }
      sendError(res, err);
    }
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
      () => ({ resourceType: 'AiAnalysis', newValue: { type: req.body.analysisType } }),
    );
    sendSuccess(res, result);
  }),
);

export default router;
