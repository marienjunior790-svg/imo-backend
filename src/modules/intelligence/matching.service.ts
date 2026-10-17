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
import {
  mergeProgressiveRounds,
  pickClosestToTarget,
  progressiveMidWindow,
  progressivePerRound,
  progressivePriceTarget,
  resolveSqlFetchMode,
  type SqlFetchMode,
} from './sql-fetch.js';
import type { DemandSpec, ListingCandidate, MatchResult } from './types.js';

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
    const sqlFetchMode = resolveSqlFetchMode(
      sqlMatchCount,
      env.INTELLIGENCE_SQL_FETCH_POLICY,
      MATCH_SQL_FETCH_LIMIT,
    );

    const fetched =
      sqlFetchMode === 'progressive'
        ? await this.fetchProgressive(where, demand)
        : await this.fetchRentAsc(where);

    const sqlFetchTruncated = sqlMatchCount > fetched.length;

    const gate = filterEligible(fetched, demand);
    if (!gate.ok) {
      const empty = runMatchEngine(fetched, raw, { limit, defaults });
      return withRetrievalMeta(
        { ...empty, eligibleCount: 0 },
        buildRetrievalMeta({
          candidateCount: 0,
          truncated: sqlFetchTruncated,
          eligibleTotal: 0,
          sqlFetchCount: fetched.length,
          sqlMatchCount,
          sqlFetchMode,
        }),
      );
    }

    const pre = preselectByScore(gate.eligible, demand, MATCH_CANDIDATE_RECALL_LIMIT);
    const result = runMatchEngine(pre.selected, raw, { limit, defaults });
    const truncated = sqlFetchTruncated || pre.truncated;

    return withRetrievalMeta(
      {
        ...result,
        eligibleCount: pre.eligibleTotal,
      },
      buildRetrievalMeta({
        candidateCount: pre.selected.length,
        truncated,
        eligibleTotal: pre.eligibleTotal,
        sqlFetchCount: fetched.length,
        sqlMatchCount,
        sqlFetchMode,
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

  /** A — rent ASC + take limit. */
  private async fetchRentAsc(where: Prisma.ApartmentWhereInput): Promise<ListingCandidate[]> {
    const rows = await this.prisma.apartment.findMany({
      where,
      take: MATCH_SQL_FETCH_LIMIT,
      orderBy: [{ rentAmount: 'asc' }, { publishedAt: 'desc' }, { id: 'asc' }],
      include: LISTING_INCLUDE,
    });
    return rows.map((apt) => this.toCandidate(apt));
  }

  /**
   * C — 3 lots (bas / milieu / haut), budget global sqlFetchLimit.
   * 3 requêtes max. Pas de garantie de rappel exact (Phase 0E.2).
   */
  private async fetchProgressive(
    where: Prisma.ApartmentWhereInput,
    demand: DemandSpec,
  ): Promise<ListingCandidate[]> {
    const perRound = progressivePerRound(MATCH_SQL_FETCH_LIMIT, 3);
    const target = progressivePriceTarget(demand);
    const positiveWhere: Prisma.ApartmentWhereInput = {
      AND: [where, { rentAmount: { gt: 0 } }],
    };

    const [lowRows, highRows] = await Promise.all([
      this.prisma.apartment.findMany({
        where: positiveWhere,
        take: perRound,
        orderBy: [{ rentAmount: 'asc' }, { publishedAt: 'desc' }, { id: 'asc' }],
        include: LISTING_INCLUDE,
      }),
      this.prisma.apartment.findMany({
        where: positiveWhere,
        take: perRound,
        orderBy: [{ rentAmount: 'desc' }, { id: 'asc' }],
        include: LISTING_INCLUDE,
      }),
    ]);

    const low = lowRows.map((apt) => this.toCandidate(apt));
    const high = highRows.map((apt) => this.toCandidate(apt));
    const exclude = new Set([...low, ...high].map((c) => c.view.id));

    let mid: ListingCandidate[] = [];
    if (target != null) {
      const win = progressiveMidWindow(demand, target);
      const midOversample = await this.prisma.apartment.findMany({
        where: {
          AND: [positiveWhere, { rentAmount: { gte: win.gte, lte: win.lte } }],
        },
        take: Math.min(perRound * 5, MATCH_SQL_FETCH_LIMIT),
        orderBy: [{ rentAmount: 'asc' }, { id: 'asc' }],
        include: LISTING_INCLUDE,
      });
      mid = pickClosestToTarget(
        midOversample.map((apt) => this.toCandidate(apt)),
        target,
        perRound,
        exclude,
      );
    }

    if (!mid.length) {
      const fallback = await this.prisma.apartment.findMany({
        where: positiveWhere,
        take: perRound,
        orderBy: [{ id: 'asc' }],
        include: LISTING_INCLUDE,
      });
      mid = fallback
        .map((apt) => this.toCandidate(apt))
        .filter((c) => !exclude.has(c.view.id))
        .slice(0, perRound);
    }

    const { merged } = mergeProgressiveRounds([low, mid, high], MATCH_SQL_FETCH_LIMIT);
    return merged;
  }
}

export type { SqlFetchMode };
