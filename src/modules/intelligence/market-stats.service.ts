import { ApartmentStatus } from '@prisma/client';
import { inject, injectable } from 'tsyringe';
import { env } from '../../config/env.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AppError, NotFoundError } from '../../shared/errors/app.error.js';
import { toListingView, type ApartmentListingSource } from './listing-view.js';
import { computeMarketStats, MARKET_STATS_VERSION, type MarketStatsResult } from './market-stats.js';

@injectable()
export class MarketStatsService {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  getMeta() {
    return {
      version: MARKET_STATS_VERSION,
      minSample: env.INTELLIGENCE_MARKET_STATS_MIN_SAMPLE,
      enabled: env.INTELLIGENCE_MATCHING_ENABLED,
    };
  }

  async getStats(filters: { city?: string; district?: string; currency?: string }): Promise<MarketStatsResult> {
    if (!env.INTELLIGENCE_MATCHING_ENABLED) {
      throw new AppError(503, 'Moteur intelligence désactivé', 'INTELLIGENCE_DISABLED');
    }

    const rows = await this.prisma.apartment.findMany({
      where: {
        isPublished: true,
        status: ApartmentStatus.AVAILABLE,
        organization: {
          isActive: true,
          isValidated: true,
          contributeMarketStats: true,
        },
      },
      take: 2000,
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
          take: 1,
          select: { cloudinaryUrl: true, type: true },
        },
      },
    });

    const listings = rows.map((apt) => toListingView(apt as unknown as ApartmentListingSource));

    return computeMarketStats(listings, {
      city: filters.city,
      district: filters.district,
      currency: filters.currency ?? env.DEFAULT_CURRENCY,
      minSample: env.INTELLIGENCE_MARKET_STATS_MIN_SAMPLE,
    });
  }

  async setOptIn(organizationId: string, enabled: boolean) {
    const org = await this.prisma.organization.findFirst({ where: { id: organizationId } });
    if (!org) throw new NotFoundError('Organisation introuvable');

    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { contributeMarketStats: enabled },
      select: {
        id: true,
        name: true,
        contributeMarketStats: true,
      },
    });
  }

  async getOptIn(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { id: true, name: true, contributeMarketStats: true },
    });
    if (!org) throw new NotFoundError('Organisation introuvable');
    return org;
  }
}
