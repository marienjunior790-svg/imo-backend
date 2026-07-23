import { Router } from 'express';
import { container } from 'tsyringe';
import { OnboardingService } from './onboarding.service.js';
import { completeStepBodySchema, firstPropertyBodySchema } from './onboarding.schema.js';
import { authenticatedPipeline } from '../../shared/middleware/security.stack.js';
import { validateBody } from '../../shared/middleware/validate.middleware.js';
import { asyncHandler, sendSuccess } from '../../shared/utils/response.util.js';

const router = Router();
const service = container.resolve(OnboardingService);

router.use(...authenticatedPipeline);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await service.getForUser(req.user!.userId, req.user!.role, req.user!.organizationId);
    sendSuccess(res, result);
  }),
);

router.post(
  '/first-property',
  validateBody(firstPropertyBodySchema),
  asyncHandler(async (req, res) => {
    const result = await service.completeFirstProperty(
      req.user!.userId,
      req.user!.role,
      req.user!.organizationId,
      req.body,
    );
    sendSuccess(res, result, 'Premier bien créé', 201);
  }),
);

router.post(
  '/steps/:key/complete',
  validateBody(completeStepBodySchema),
  asyncHandler(async (req, res) => {
    const result = await service.completeStep(
      req.user!.userId,
      req.user!.role,
      req.user!.organizationId,
      req.params.key,
      req.body,
    );
    sendSuccess(res, result, 'Étape mise à jour');
  }),
);

export default router;
