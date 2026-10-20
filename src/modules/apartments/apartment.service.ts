import { inject, injectable } from 'tsyringe';
import { ApartmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { NotFoundError } from '../../shared/errors/app.error.js';
import { assertRemainsPublishableIfPublished } from '../listings/publish-guards.js';
import { SubscriptionService } from '../subscriptions/subscription.service.js';

export interface ApartmentInput {
  buildingId?: string;
  label: string;
  floor?: number;
  surface?: number;
  rooms?: number;
  rentAmount: number;
  currency?: string;
  status?: ApartmentStatus;
  description?: string;
}

export interface ApartmentFilters {
  status?: ApartmentStatus;
  buildingId?: string;
  search?: string;
}

@injectable()
export class ApartmentRepository {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  findMany(organizationId: string, skip: number, limit: number, filters: ApartmentFilters) {
    const where: Prisma.ApartmentWhereInput = {
      organizationId,
      ...(filters.status && { status: filters.status }),
      ...(filters.buildingId && { buildingId: filters.buildingId }),
      ...(filters.search && {
        OR: [
          { label: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
    };

    return Promise.all([
      this.prisma.apartment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          building: { select: { id: true, name: true, address: true } },
          documents: { where: { type: 'APARTMENT_PHOTO' }, take: 5 },
          _count: { select: { leases: true } },
        },
      }),
      this.prisma.apartment.count({ where }),
    ]);
  }

  findById(organizationId: string, id: string) {
    return this.prisma.apartment.findFirst({
      where: { id, organizationId },
      include: {
        building: true,
        documents: true,
        leases: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { tenant: true },
        },
      },
    });
  }

  create(organizationId: string, data: ApartmentInput) {
    return this.prisma.apartment.create({
      data: {
        organizationId,
        buildingId: data.buildingId,
        label: data.label,
        floor: data.floor,
        surface: data.surface,
        rooms: data.rooms,
        rentAmount: data.rentAmount,
        currency: data.currency ?? 'XAF',
        status: data.status ?? ApartmentStatus.AVAILABLE,
        description: data.description,
      },
      include: { building: true },
    });
  }

  update(organizationId: string, id: string, data: Partial<ApartmentInput>) {
    return this.prisma.apartment.updateMany({
      where: { id, organizationId },
      data: {
        ...data,
        ...(data.rentAmount !== undefined && { rentAmount: data.rentAmount }),
      },
    });
  }

  delete(organizationId: string, id: string) {
    return this.prisma.apartment.deleteMany({ where: { id, organizationId } });
  }

  updateStatus(id: string, status: ApartmentStatus) {
    return this.prisma.apartment.update({ where: { id }, data: { status } });
  }
}

@injectable()
export class ApartmentService {
  constructor(
    @inject(ApartmentRepository) private readonly repo: ApartmentRepository,
    @inject(SubscriptionService) private readonly subscriptionService: SubscriptionService,
  ) {}

  async list(organizationId: string, page: number, limit: number, skip: number, filters: ApartmentFilters) {
    const [items, total] = await this.repo.findMany(organizationId, skip, limit, filters);
    return { items, total };
  }

  async get(organizationId: string, id: string) {
    const apt = await this.repo.findById(organizationId, id);
    if (!apt) throw new NotFoundError('Appartement introuvable');
    return apt;
  }

  async create(organizationId: string, data: ApartmentInput) {
    await this.subscriptionService.assertCanCreateApartment(organizationId);
    return this.repo.create(organizationId, data);
  }

  async update(organizationId: string, id: string, data: Partial<ApartmentInput>) {
    const current = await this.get(organizationId, id);
    assertRemainsPublishableIfPublished(
      {
        isPublished: current.isPublished,
        status: current.status,
        rooms: current.rooms,
      },
      {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.rooms !== undefined ? { rooms: data.rooms } : {}),
      },
    );
    await this.repo.update(organizationId, id, data);
    return this.get(organizationId, id);
  }

  async delete(organizationId: string, id: string) {
    await this.get(organizationId, id);
    await this.repo.delete(organizationId, id);
  }
}
