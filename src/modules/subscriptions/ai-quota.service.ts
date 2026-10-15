import { randomUUID } from 'crypto';
import { inject, injectable } from 'tsyringe';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { BillingAccessError } from '../../shared/errors/subscription.error.js';
import { clock } from '../../shared/time/clock.js';
import { SubscriptionService } from './subscription.service.js';
import {
  AI_UNIT_LABELS,
  AI_UNITS,
  AiUnit,
  nextQuotaReset,
  quotaLimit,
  quotaPeriodStart,
} from './quotas.config.js';

export interface AiUsageLine {
  unit: AiUnit;
  label: string;
  used: number;
  limit: number | null;
  resetsAt: Date;
}

/**
 * Comptage des quotas IA côté serveur.
 * La réservation est une mise à jour conditionnelle unique (`used < limite`) : deux requêtes simultanées
 * ne peuvent pas dépasser la limite. Une opération qui échoue techniquement rend sa réservation.
 */
@injectable()
export class AiQuotaService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(SubscriptionService) private readonly subscriptions: SubscriptionService,
  ) {}

  async run<T>(organizationId: string, unit: AiUnit, operation: () => Promise<T>): Promise<T> {
    const release = await this.reserve(organizationId, unit);
    try {
      return await operation();
    } catch (err) {
      await release().catch((releaseErr) =>
        console.warn('[ai-quota] réservation non rendue:', releaseErr instanceof Error ? releaseErr.message : releaseErr),
      );
      throw err;
    }
  }

  /** Réserve une unité ; renvoie la fonction qui l'annule. */
  async reserve(organizationId: string, unit: AiUnit): Promise<() => Promise<void>> {
    const state = await this.subscriptions.getAccess(organizationId);
    const now = clock.now();
    const periodStart = quotaPeriodStart(now);
    const limit = quotaLimit(state.plan, unit);

    await this.prisma.aiUsage.createMany({
      data: [{ id: randomUUID(), organizationId, unit, periodStart, used: 0 }],
      skipDuplicates: true,
    });
    // Ligne ciblée par son id : une comparaison SQL brute sur la date dépendrait du fuseau de la session.
    const row = await this.prisma.aiUsage.findUniqueOrThrow({
      where: { organizationId_unit_periodStart: { organizationId, unit, periodStart } },
      select: { id: true },
    });

    const reserved = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "ai_usage" SET "used" = "used" + 1, "updatedAt" = NOW()
      WHERE "id" = ${row.id}
      ${limit == null ? Prisma.empty : Prisma.sql`AND "used" < ${limit}`}
    `);

    if (reserved !== 1) {
      const resetsAt = nextQuotaReset(now);
      throw new BillingAccessError(
        'AI_QUOTA_EXCEEDED',
        `Quota mensuel atteint (${AI_UNIT_LABELS[unit].toLowerCase()} : ${limit}). Il sera renouvelé le ${resetsAt.toLocaleDateString('fr-FR', { timeZone: 'Africa/Brazzaville', day: 'numeric', month: 'long' })}.`,
        { unit, limit, resetsAt },
      );
    }

    return async () => {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "ai_usage" SET "used" = GREATEST("used" - 1, 0), "updatedAt" = NOW()
        WHERE "id" = ${row.id}
      `);
    };
  }

  async usage(organizationId: string): Promise<AiUsageLine[]> {
    const state = await this.subscriptions.getAccess(organizationId);
    const now = clock.now();
    const periodStart = quotaPeriodStart(now);
    const rows = await this.prisma.aiUsage.findMany({
      where: { organizationId, periodStart },
      select: { unit: true, used: true },
    });
    const used = new Map(rows.map((r) => [r.unit, r.used]));
    return AI_UNITS.map((unit) => ({
      unit,
      label: AI_UNIT_LABELS[unit],
      used: used.get(unit) ?? 0,
      limit: quotaLimit(state.plan, unit),
      resetsAt: nextQuotaReset(now),
    }));
  }
}
