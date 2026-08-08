import { inject, injectable } from 'tsyringe';
import { ApartmentStatus, LeaseStatus, PortalAccessStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { NotFoundError } from '../../shared/errors/app.error.js';
import type { ReleaseTenantInput } from './tenant.schema.js';
import { Prisma } from '@prisma/client';

export interface TenantInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  idNumber?: string;
  address?: string;
  notes?: string;
}

const RELEASE_REASON_LABELS: Record<ReleaseTenantInput['reason'], string> = {
  TENANT_LEFT_COUNTRY: 'Départ du locataire (ex. quitte le pays)',
  OWNER_DECISION: 'Décision du propriétaire',
  END_OF_LEASE: 'Fin de bail',
  NON_PAYMENT: 'Impayés / résiliation pour non-paiement',
  OTHER: 'Autre motif',
};

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
        include: {
          _count: { select: { leases: true } },
          user: {
            select: {
              id: true,
              email: true,
              loginId: true,
              portalStatus: true,
              lastLoginAt: true,
              mustChangePassword: true,
              isActive: true,
            },
          },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);
  }

  findById(organizationId: string, id: string) {
    return this.prisma.tenant.findFirst({
      where: { id, organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            loginId: true,
            portalStatus: true,
            lastLoginAt: true,
            mustChangePassword: true,
            isActive: true,
          },
        },
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
  constructor(
    @inject(TenantRepository) private readonly repo: TenantRepository,
    @inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

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

  /**
   * Inverse de l’onboarding : résilie les baux actifs/brouillon,
   * libère les logements, archive l’accès portail, historise le motif.
   * Le dossier locataire est conservé (historique baux / paiements).
   */
  async release(
    organizationId: string,
    tenantId: string,
    input: ReleaseTenantInput,
    actor: { userId: string; role: UserRole },
  ) {
    const tenant = await this.get(organizationId, tenantId);
    const reasonLabel = RELEASE_REASON_LABELS[input.reason];
    const stampDate = new Date().toISOString().slice(0, 10);
    const stamp = `[Retrait ${stampDate}] ${reasonLabel}${input.note?.trim() ? ` — ${input.note.trim()}` : ''}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const openLeases = await tx.lease.findMany({
        where: {
          organizationId,
          tenantId,
          status: { in: [LeaseStatus.ACTIVE, LeaseStatus.DRAFT] },
        },
        select: { id: true, apartmentId: true, status: true },
      });

      const terminatedLeaseIds: string[] = [];
      const freedApartmentIds: string[] = [];

      for (const lease of openLeases) {
        await tx.lease.update({
          where: { id: lease.id },
          data: { status: LeaseStatus.TERMINATED },
        });
        terminatedLeaseIds.push(lease.id);

        await tx.apartment.update({
          where: { id: lease.apartmentId },
          data: { status: ApartmentStatus.AVAILABLE },
        });
        freedApartmentIds.push(lease.apartmentId);
      }

      let portalArchived = false;
      if (tenant.userId) {
        await tx.user.update({
          where: { id: tenant.userId },
          data: { isActive: false, portalStatus: PortalAccessStatus.ARCHIVED },
        });
        await tx.membership.updateMany({
          where: { userId: tenant.userId, organizationId },
          data: { isActive: false },
        });
        await tx.refreshToken.updateMany({
          where: { userId: tenant.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        portalArchived = true;
      }

      const prevNotes = tenant.notes?.trim();
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          notes: prevNotes ? `${prevNotes}\n${stamp}` : stamp,
        },
      });

      return {
        tenantId,
        reason: input.reason,
        reasonLabel,
        terminatedLeaseIds,
        freedApartmentIds,
        portalArchived,
        releasedBy: actor.userId,
      };
    });

    return result;
  }
}
