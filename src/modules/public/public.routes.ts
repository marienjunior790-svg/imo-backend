import { Router } from 'express';
import { getPlatformCatalog } from './platform-catalog.js';
import { asyncHandler, sendSuccess } from '../../shared/utils/response.util.js';

const router = Router();

/**
 * GET /public/platforms — catalogue store réel (pas d’auth).
 * Le site ITC doit consommer cet endpoint pour les CTA Android / iOS / Web.
 */
router.get(
  '/platforms',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, getPlatformCatalog());
  }),
);

export default router;
