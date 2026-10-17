import { ApartmentStatus } from '@prisma/client';
import { inject, injectable } from 'tsyringe';
import { env } from '../../config/env.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AppError } from '../../shared/errors/app.error.js';
import { INTERPRETER_VERSION } from './interpreter-version.js';
import { MARKET_STATS_VERSION } from './market-stats.js';
import { runMatchEngine } from './matching.engine.js';
import { toListingView, type ApartmentListingSource } from './listing-view.js';
import type { RawDemandInput } from './normalizer.js';
import { MATCH_CANDIDATE_RECALL_LIMIT, withRetrievalMeta } from './retrieval.js';
import { SCORER_VERSION } from './scorer-version.js';
import type { ListingCandidate, MatchResult } from './types.js';

@injectable()
export class MatchingService {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  getHealth() {
    return {
      enabled: env.INTELLIGENCE_MATCHING_ENABLED,
      scorerVersion: SCORER_VERSION,
      interpreterVersion: INTERPRETER_VERSION,
      marketStatsVersion: MARKET_STATS_VERSION,
      marketStatsMinSample: env.INTELLIGENCE_MARKET_STATS_MIN_SAMPLE,
      candidateRecallLimit: MATCH_CANDIDATE_RECALL_LIMIT,
      currencyDefault: env.DEFAULT_CURRENCY,
      localeDefault: 'fr-CG',
    };
  }

  assertEnabled(): void {
    if (!env.INTELLIGENCE_MATCHING_ENABLED) {
      throw new AppError(503, 'Moteur de correspondance désactivé', 'INTELLIGENCE_DISABLED');
    }
  }

  async match(raw: RawDemandInput, limit = 20): Promise<MatchResult> {
    this.assertEnabled();

    const rows = await this.prisma.apartment.findMany({
      where: {
        isPublished: true,
        status: ApartmentStatus.AVAILABLE,
        organization: { isActive: true, isValidated: true },
      },
      take: MATCH_CANDIDATE_RECALL_LIMIT,
      orderBy: { publishedAt: 'desc' },
      include: {
        building: {
          select: {
            name: true,
            address: true,
            district: true,
            city: true,
            latitude: true,
            longitude: true,
          },
        },
        organization: {
          select: { id: true, name: true, type: true, isActive: true, isValidated: true },
        },
        documents: {
          where: { type: 'APARTMENT_PHOTO' },
          take: 5,
          select: { cloudinaryUrl: true, type: true },
        },
      },
    });

    const candidates: ListingCandidate[] = rows.map((apt) => {
      const source = apt as unknown as ApartmentListingSource;
      const view = toListingView(source, 'INTERNAL_GESTION');
      return {
        view,
        isPublished: apt.isPublished,
        orgActive: apt.organization.isActive,
        orgValidated: apt.organization.isValidated,
      };
    });

    const result = runMatchEngine(candidates, raw, {
      limit,
      defaults: { currency: env.DEFAULT_CURRENCY, locale: 'fr-CG' },
    });

    return withRetrievalMeta(result, rows.length, MATCH_CANDIDATE_RECALL_LIMIT);
  }
}
