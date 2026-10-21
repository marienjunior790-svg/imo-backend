import { inject, injectable } from 'tsyringe';
import type { Prisma } from '@prisma/client';
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
import { readKeysetPages, RENT_KEYSET_ORDER } from './sql-keyset.js';
import type { ListingCandidate, MatchResult } from './types.js';

const LISTING_INCLUDE = {
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
    where: { type: 'APARTMENT_PHOTO' as const },
    take: 5,
    select: { cloudinaryUrl: true, type: true },
  },
} satisfies Prisma.ApartmentInclude;

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
      sqlFetchPolicy: env.INTELLIGENCE_SQL_FETCH_POLICY,
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

    const sqlMatchCount = await this.prisma.apartment.count({ where });
    const { rows: fetched, batches } = await this.fetchRentAscAll(where);
    if (fetched.length !== sqlMatchCount) {
      throw new AppError(
        503,
        'Lecture du catalogue interrompue avant la fin du filtre SQL.',
        'MATCH_READ_INCOMPLETE',
      );
    }

    const gate = filterEligible(fetched, demand);
    const retrievalBase = {
      sqlFetchCount: fetched.length,
      sqlMatchCount,
      sqlFetchMode: 'rent_asc' as const,
      completeness: 'complete' as const,
      batches,
    };
    if (!gate.ok) {
      const empty = runMatchEngine(fetched, raw, { limit, defaults });
      return withRetrievalMeta(
        { ...empty, eligibleCount: 0 },
        buildRetrievalMeta({
          candidateCount: 0,
          truncated: false,
          eligibleTotal: 0,
          ...retrievalBase,
        }),
      );
    }

    const pre = preselectByScore(gate.eligible, demand, MATCH_CANDIDATE_RECALL_LIMIT);
    const result = runMatchEngine(pre.selected, raw, { limit, defaults });

    return withRetrievalMeta(
      {
        ...result,
        eligibleCount: pre.eligibleTotal,
      },
      buildRetrievalMeta({
        candidateCount: pre.selected.length,
        truncated: pre.truncated,
        eligibleTotal: pre.eligibleTotal,
        ...retrievalBase,
      }),
    );
  }

  private toCandidate(apt: {
    isPublished: boolean;
    organization: { isActive: boolean; isValidated: boolean };
  } & Record<string, unknown>): ListingCandidate {
    const source = apt as unknown as ApartmentListingSource;
    const view = toListingView(source, 'INTERNAL_GESTION');
    return {
      view,
      isPublished: apt.isPublished,
      orgActive: apt.organization.isActive,
      orgValidated: apt.organization.isValidated,
    };
  }

  /** Lecture ordonnée par lots, jusqu'à épuisement du filtre SQL. Le score n'est pas appelé ici. */
  private async fetchRentAscAll(where: Prisma.ApartmentWhereInput): Promise<{
    rows: ListingCandidate[];
    batches: number;
  }> {
    const { rows, batches } = await readKeysetPages({
      batchSize: MATCH_SQL_FETCH_LIMIT,
      read: (query) =>
        this.prisma.apartment.findMany({
          where,
          take: query.take,
          ...(query.cursor ? { cursor: query.cursor, skip: query.skip } : {}),
          orderBy: RENT_KEYSET_ORDER,
          include: LISTING_INCLUDE,
        }),
    });
    return { rows: rows.map((apt) => this.toCandidate(apt)), batches };
  }
}
