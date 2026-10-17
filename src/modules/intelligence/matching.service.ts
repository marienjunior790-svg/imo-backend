import { inject, injectable } from 'tsyringe';
import { env } from '../../config/env.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AppError } from '../../shared/errors/app.error.js';
import { mergeDemandWithText } from './demand-interpreter.js';
import { filterEligible } from './eligibility.js';
import { buildHardApartmentWhere } from './hard-where.js';
import { INTERPRETER_VERSION } from './interpreter-version.js';
import { MARKET_STATS_VERSION } from './market-stats.js';
import { runMatchEngine } from './matching.engine.js';
import { toListingView, type ApartmentListingSource } from './listing-view.js';
import { normalizeDemand, type RawDemandInput } from './normalizer.js';
import { preselectByScore } from './preselect.js';
import {
  MATCH_CANDIDATE_RECALL_LIMIT,
  MATCH_SQL_FETCH_LIMIT,
  buildRetrievalMeta,
  withRetrievalMeta,
} from './retrieval.js';
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
      sqlFetchLimit: MATCH_SQL_FETCH_LIMIT,
      retrievalStrategy: 'hard_sql_score_preselect' as const,
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

    const defaults = { currency: env.DEFAULT_CURRENCY, locale: 'fr-CG' };
    const { demand: merged } = mergeDemandWithText(raw);
    const demand = normalizeDemand(merged, defaults);
    const where = buildHardApartmentWhere(demand);

    const [rows, sqlMatchCount] = await Promise.all([
      this.prisma.apartment.findMany({
        where,
        take: MATCH_SQL_FETCH_LIMIT,
        orderBy: [{ rentAmount: 'asc' }, { publishedAt: 'desc' }, { id: 'asc' }],
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
      }),
      this.prisma.apartment.count({ where }),
    ]);

    const sqlFetchTruncated = sqlMatchCount > rows.length;

    const fetched: ListingCandidate[] = rows.map((apt) => {
      const source = apt as unknown as ApartmentListingSource;
      const view = toListingView(source, 'INTERNAL_GESTION');
      return {
        view,
        isPublished: apt.isPublished,
        orgActive: apt.organization.isActive,
        orgValidated: apt.organization.isValidated,
      };
    });

    const gate = filterEligible(fetched, demand);
    if (!gate.ok) {
      const empty = runMatchEngine(fetched, raw, { limit, defaults });
      return withRetrievalMeta(
        { ...empty, eligibleCount: 0 },
        buildRetrievalMeta({
          candidateCount: 0,
          truncated: sqlFetchTruncated,
          eligibleTotal: 0,
          sqlFetchCount: rows.length,
          sqlMatchCount,
        }),
      );
    }

    const pre = preselectByScore(gate.eligible, demand, MATCH_CANDIDATE_RECALL_LIMIT);
    const result = runMatchEngine(pre.selected, raw, { limit, defaults });
    const truncated = sqlFetchTruncated || pre.truncated;

    return withRetrievalMeta(
      {
        ...result,
        // Pool éligible réel (avant fenêtre de ranking), pas la taille du sous-ensemble scoré
        eligibleCount: pre.eligibleTotal,
      },
      buildRetrievalMeta({
        candidateCount: pre.selected.length,
        truncated,
        eligibleTotal: pre.eligibleTotal,
        sqlFetchCount: rows.length,
        sqlMatchCount,
      }),
    );
  }
}
