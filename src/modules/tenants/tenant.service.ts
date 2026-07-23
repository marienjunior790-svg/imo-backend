import { inject, injectable } from 'tsyringe';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { NotFoundError } from '../../shared/errors/app.error.js';

export interface TenantInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  idNumber?: string;
  address?: string;
  notes?: string;
}

@injectable()
export class TenantRepository {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  findMany(organizationId: string, skip: number, limit: number, search?: string) {
    const where: Prisma.TenantWhereInput = {
      organizationId,
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    return Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { leases: true } } },
      }),
      this.prisma.tenant.count({ where }),
    ]);
  }

  findById(organizationId: string, id: string) {
    return this.prisma.tenant.findFirst({
      where: { id, organizationId },
      include: {
        leases: {
          orderBy: { createdAt: 'desc' },
          include: {
            apartment: { include: { building: { select: { id: true, name: true } } } },
            payments: { take: 3, orderBy: { dueDate: 'desc' } },
          },
        },
      },
    });
  }

  create(organizationId: string, data: TenantInput) {
    return this.prisma.tenant.create({ data: { ...data, organizationId } });
  }

  update(organizationId: string, id: string, data: Partial<TenantInput>) {
    return this.prisma.tenant.updateMany({ where: { id, organizationId }, data });
  }

  delete(organizationId: string, id: string) {
    return this.prisma.tenant.deleteMany({ where: { id, organizationId } });
  }
}

@injectable()
export class TenantService {
  constructor(@inject(TenantRepository) private readonly repo: TenantRepository) {}

  async list(organizationId: string, page: number, limit: number, skip: number, search?: string) {
    const [items, total] = await this.repo.findMany(organizationId, skip, limit, search);
    return { items, total };
  }

  async get(organizationId: string, id: string) {
    const tenant = await this.repo.findById(organizationId, id);
    if (!tenant) throw new NotFoundError('Locataire introuvable');
    return tenant;
  }

  create(organizationId: string, data: TenantInput) {
    return this.repo.create(organizationId, data);
  }

  async update(organizationId: string, id: string, data: Partial<TenantInput>) {
    await this.get(organizationId, id);
    await this.repo.update(organizationId, id, data);
    return this.get(organizationId, id);
  }

  async delete(organizationId: string, id: string) {
    await this.get(organizationId, id);
    await this.repo.delete(organizationId, id);
  }
}
