import { inject, injectable } from 'tsyringe';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { extendedPrisma } from '../../shared/utils/extended-prisma.js';
import { NotFoundError, ValidationError } from '../../shared/errors/app.error.js';

export interface CreateInspectionInput {
  apartmentId: string;
  leaseId?: string;
  tenantId?: string;
  type: 'ENTRY' | 'EXIT';
  notes?: string;
  checklist?: Record<string, unknown>;
}

@injectable()
export class InspectionService {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  private db() {
    return extendedPrisma(this.prisma);
  }

  async list(organizationId: string, skip: number, limit: number, filters: { apartmentId?: string; leaseId?: string; type?: string }) {
    const where: Record<string, unknown> = { organizationId };
    if (filters.apartmentId) where.apartmentId = filters.apartmentId;
    if (filters.leaseId) where.leaseId = filters.leaseId;
    if (filters.type) where.type = filters.type;

    const [items, total] = await Promise.all([
      this.db().propertyInspection.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          apartment: { select: { id: true, label: true } },
          tenant: { select: { id: true, firstName: true, lastName: true } },
          lease: { select: { id: true, status: true } },
        },
      }),
      this.db().propertyInspection.count({ where }),
    ]);
    return { items, total };
  }

  async get(organizationId: string, id: string) {
    const item = await this.db().propertyInspection.findFirst({
      where: { id, organizationId },
      include: {
        apartment: { include: { building: true } },
        tenant: true,
        lease: true,
        conductedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!item) throw new NotFoundError('État des lieux introuvable');
    return item;
  }

  async create(organizationId: string, userId: string, data: CreateInspectionInput) {
    const apartment = await this.prisma.apartment.findFirst({ where: { id: data.apartmentId, organizationId } });
    if (!apartment) throw new NotFoundError('Appartement introuvable');

    return this.db().propertyInspection.create({
      data: {
        organizationId,
        apartmentId: data.apartmentId,
        leaseId: data.leaseId,
        tenantId: data.tenantId,
        type: data.type,
        notes: data.notes,
        checklist: data.checklist as any,
        conductedById: userId,
        photos: [],
      },
      include: { apartment: true, tenant: true },
    });
  }

  async update(organizationId: string, id: string, data: Record<string, unknown>) {
    await this.get(organizationId, id);
    return this.db().propertyInspection.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
  }

  async sign(organizationId: string, id: string, signatures: { tenantSignatureUrl?: string; agentSignatureUrl?: string }) {
    const current = await this.get(organizationId, id);
    if (!signatures.tenantSignatureUrl && !signatures.agentSignatureUrl) {
      throw new ValidationError('Au moins une signature est requise');
    }
    return this.db().propertyInspection.update({
      where: { id },
      data: {
        tenantSignatureUrl: signatures.tenantSignatureUrl ?? (current as { tenantSignatureUrl?: string }).tenantSignatureUrl,
        agentSignatureUrl: signatures.agentSignatureUrl ?? (current as { agentSignatureUrl?: string }).agentSignatureUrl,
        status: 'SIGNED',
        signedAt: new Date(),
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.get(organizationId, id);
    await this.db().propertyInspection.delete({ where: { id } });
  }
}
