import { Router } from 'express';
import { container } from 'tsyringe';
import { AiService } from './ai.service.js';
import { aiChatSchema, aiAnalyzeSchema } from './ai.schema.js';
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

const router = Router();
const service = container.resolve(AiService);

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
