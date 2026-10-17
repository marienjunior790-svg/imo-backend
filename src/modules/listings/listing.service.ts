import { inject, injectable } from 'tsyringe';
import { ApartmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AppError, NotFoundError, ValidationError } from '../../shared/errors/app.error.js';
import {
  assertNoPrivateLeak,
  toListingView,
  type ApartmentListingSource,
} from '../intelligence/listing-view.js';
import type { ListingView } from '../intelligence/types.js';

export interface ListingSearchFilters {
  city?: string;
  district?: string;
  minRent?: number;
  maxRent?: number;
  minRooms?: number;
  search?: string;
}

/** Select org catalogue public — jamais phone / email. */
const PUBLIC_ORG_SELECT = {
  id: true,
  name: true,
  type: true,
  isActive: true,
  isValidated: true,
} as const;

@injectable()
export class ListingService {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  async search(skip: number, limit: number, filters: ListingSearchFilters) {
    const where: Prisma.ApartmentWhereInput = {
      isPublished: true,
      status: ApartmentStatus.AVAILABLE,
      organization: { isActive: true, isValidated: true },
      ...(filters.city && { building: { city: { contains: filters.city, mode: 'insensitive' } } }),
      ...(filters.district && { building: { district: { contains: filters.district, mode: 'insensitive' } } }),
      ...(filters.minRent !== undefined && { rentAmount: { gte: filters.minRent } }),
      ...(filters.maxRent !== undefined && { rentAmount: { lte: filters.maxRent } }),
      ...(filters.minRooms !== undefined && { rooms: { gte: filters.minRooms } }),
      ...(filters.search && {
        OR: [
          { label: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
          { building: { name: { contains: filters.search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.apartment.findMany({
        where,
        skip,
        take: limit,
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
          organization: { select: PUBLIC_ORG_SELECT },
          documents: {
            where: { type: 'APARTMENT_PHOTO' },
            take: 3,
            select: { cloudinaryUrl: true, type: true },
          },
        },
      }),
      this.prisma.apartment.count({ where }),
    ]);

    const items = rows.map((apt) => this.toSafeListingView(apt));
    return { items, total };
  }

  async getPublicListing(apartmentId: string): Promise<ListingView> {
    const apt = await this.prisma.apartment.findFirst({
      where: {
        id: apartmentId,
        isPublished: true,
        status: ApartmentStatus.AVAILABLE,
        organization: { isActive: true, isValidated: true },
      },
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
        organization: { select: PUBLIC_ORG_SELECT },
        documents: {
          where: { type: 'APARTMENT_PHOTO' },
          select: { cloudinaryUrl: true, type: true },
        },
      },
    });
    if (!apt) throw new NotFoundError('Annonce introuvable ou non disponible');

    const view = this.toSafeListingView(apt);
    const leaks = assertNoPrivateLeak(view);
    if (leaks.length) {
      throw new AppError(500, 'Annonce publique invalide', 'PRIVATE_LEAK_GUARD');
    }
    return view;
  }

  async publish(organizationId: string, apartmentId: string, amenities?: string) {
    const apt = await this.prisma.apartment.findFirst({
      where: { id: apartmentId, organizationId },
    });
    if (!apt) throw new NotFoundError('Appartement introuvable');
    if (apt.status !== ApartmentStatus.AVAILABLE) {
      throw new ValidationError('Seuls les biens disponibles peuvent être publiés');
    }

    return this.prisma.apartment.update({
      where: { id: apartmentId },
      data: {
        isPublished: true,
        publishedAt: new Date(),
        ...(amenities !== undefined && { amenities }),
      },
      include: { building: true },
    });
  }

  async unpublish(organizationId: string, apartmentId: string) {
    const apt = await this.prisma.apartment.findFirst({
      where: { id: apartmentId, organizationId },
    });
    if (!apt) throw new NotFoundError('Appartement introuvable');

    return this.prisma.apartment.update({
      where: { id: apartmentId },
      data: { isPublished: false, publishedAt: null },
      include: { building: true },
    });
  }

  private toSafeListingView(apt: {
    id: string;
    label: string;
    description: string | null;
    rooms: number | null;
    surface: unknown;
    floor: number | null;
    rentAmount: unknown;
    currency: string;
    status: string;
    isPublished: boolean;
    publishedAt: Date | null;
    amenities: string | null;
    building: ApartmentListingSource['building'];
    organization: ApartmentListingSource['organization'];
    documents?: { cloudinaryUrl: string; type: string }[];
  }): ListingView {
    return toListingView(apt as unknown as ApartmentListingSource, 'INTERNAL_GESTION');
  }
}
