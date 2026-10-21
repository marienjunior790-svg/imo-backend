import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { container } from 'tsyringe';
import { getOrganizationId } from '../../shared/middleware/auth.middleware.js';
import { ownerPipeline } from '../../shared/middleware/security.stack.js';
import { validateBody, validateQuery } from '../../shared/middleware/validate.middleware.js';
import { asyncHandler, sendSuccess } from '../../shared/utils/response.util.js';
import { assertNoPrivateLeak } from './listing-view.js';
import { MatchingService } from './matching.service.js';
import { MarketStatsService } from './market-stats.service.js';
import {
  marketStatsOptInSchema,
  marketStatsQuerySchema,
  matchDemandSchema,
} from './matching.schema.js';

const router = Router();
const service = container.resolve(MatchingService);
const marketStats = container.resolve(MarketStatsService);

const matchLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de requêtes matching', code: 'RATE_LIMIT' },
});

/** GET /intelligence/health — statut moteur (public). */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, service.getHealth());
  }),
);

/** GET /intelligence/market-stats — agrégats anonymes opt-in (public). */
router.get(
  '/market-stats',
  matchLimiter,
  validateQuery(marketStatsQuerySchema),
  asyncHandler(async (req, res) => {
    const q = req.query as { city?: string; district?: string; currency?: string };
    const result = await marketStats.getStats(q);
    const leaks = assertNoPrivateLeak(result);
    if (leaks.length) {
      res.status(500).json({
        success: false,
        message: 'Réponse stats invalide',
        code: 'PRIVATE_LEAK_GUARD',
      });
      return;
    }
    sendSuccess(
      res,
      result,
      result.status === 'INSUFFICIENT_SAMPLE'
        ? 'Échantillon insuffisant — aucun indice inventé'
        : 'Statistiques de marché (annonces opt-in)',
    );
  }),
);

/** GET /intelligence/market-stats/opt-in — statut contribution org. */
router.get(
  '/market-stats/opt-in',
  ...ownerPipeline,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await marketStats.getOptIn(getOrganizationId(req)));
  }),
);

/** POST /intelligence/market-stats/opt-in — activer/désactiver contribution. */
router.post(
  '/market-stats/opt-in',
  ...ownerPipeline,
  validateBody(marketStatsOptInSchema),
  asyncHandler(async (req, res) => {
    const updated = await marketStats.setOptIn(getOrganizationId(req), req.body.enabled);
    sendSuccess(
      res,
      updated,
      updated.contributeMarketStats
        ? 'Contribution aux stats marché activée'
        : 'Contribution aux stats marché désactivée',
    );
  }),
);

/** POST /intelligence/match — correspondance déterministe (public, DTO whitelist). */
router.post(
  '/match',
  matchLimiter,
  validateBody(matchDemandSchema),
  asyncHandler(async (req, res) => {
    const { limit, ...demand } = req.body as {
      limit?: number;
      maxRent?: number;
      minRent?: number;
      minRooms?: number;
      minSurface?: number;
      cities?: string[];
      districts?: string[];
      preferredDistricts?: string[];
      excludedDistricts?: string[];
      currency?: string;
      locale?: string;
      text?: string;
      weights?: Record<string, number>;
    };

    const result = await service.match(demand, limit ?? 20);
    const leaks = assertNoPrivateLeak(result);
    if (leaks.length) {
      console.error('[intelligence.match] private leak blocked:', leaks);
      res.status(500).json({
        success: false,
        message: 'Réponse matching invalide',
        code: 'PRIVATE_LEAK_GUARD',
      });
      return;
    }

    sendSuccess(
      res,
      result,
      result.emptyReason === 'EMPTY_ELIGIBLE' ? 'Aucun logement éligible' : 'Correspondances calculées',
    );
  }),
);

export default router;
