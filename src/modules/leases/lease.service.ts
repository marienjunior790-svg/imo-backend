import { inject, injectable } from 'tsyringe';
import { LeaseStatus, ApartmentStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app.error.js';
import { decimalToNumber } from '../../shared/utils/response.util.js';
import { PdfService } from '../../infrastructure/pdf/pdf.service.js';
import { CloudinaryService } from '../../infrastructure/storage/cloudinary.service.js';
import { ApartmentRepository } from '../apartments/apartment.service.js';
import { SubscriptionService } from '../subscriptions/subscription.service.js';
import { AutomationEmitter } from '../automation/automation.emitter.js';
import { PortalAccessService } from '../tenants/portal-access.service.js';

export interface LeaseInput {
  apartmentId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  monthlyRent?: number;
  depositAmount?: number;
  terms?: string;
}

@injectable()
export class LeaseRepository {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  findMany(organizationId: string, skip: number, limit: number, status?: LeaseStatus) {
    const where: Prisma.LeaseWhereInput = {
      organizationId,
      ...(status && { status }),
    };

    return Promise.all([
      this.prisma.lease.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          apartment: { include: { building: true } },
          tenant: true,
          _count: { select: { payments: true } },
        },
      }),
      this.prisma.lease.count({ where }),
    ]);
  }

  findById(organizationId: string, id: string) {
    return this.prisma.lease.findFirst({
      where: { id, organizationId },
      include: {
        organization: true,
        apartment: { include: { building: true } },
        tenant: true,
        payments: { orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }] },
        documents: true,
      },
    });
  }

  create(organizationId: string, data: LeaseInput & { monthlyRent: number }) {
    return this.prisma.lease.create({
      data: {
        organizationId,
        apartmentId: data.apartmentId,
        tenantId: data.tenantId,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        monthlyRent: data.monthlyRent,
        depositAmount: data.depositAmount,
        terms: data.terms,
        status: LeaseStatus.DRAFT,
      },
      include: { apartment: true, tenant: true },
    });
  }

  update(organizationId: string, id: string, data: Partial<LeaseInput>) {
    return this.prisma.lease.updateMany({
      where: { id, organizationId },
      data: {
        ...(data.startDate && { startDate: new Date(data.startDate) }),
        ...(data.endDate && { endDate: new Date(data.endDate) }),
        ...(data.monthlyRent !== undefined && { monthlyRent: data.monthlyRent }),
        ...(data.depositAmount !== undefined && { depositAmount: data.depositAmount }),
        ...(data.terms !== undefined && { terms: data.terms }),
      },
    });
  }

  activate(organizationId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const lease = await tx.lease.findFirst({ where: { id, organizationId } });
      if (!lease) throw new NotFoundError('Contrat introuvable');

      const activeLease = await tx.lease.findFirst({
        where: { apartmentId: lease.apartmentId, status: LeaseStatus.ACTIVE, id: { not: id } },
      });
      if (activeLease) throw new ConflictError('Cet appartement a déjà un contrat actif');

      const updated = await tx.lease.update({
        where: { id },
        data: { status: LeaseStatus.ACTIVE, signedAt: new Date() },
        include: { apartment: { include: { building: true } }, tenant: true, organization: true },
      });

      await tx.apartment.update({
        where: { id: lease.apartmentId },
        data: { status: ApartmentStatus.OCCUPIED },
      });

      const now = new Date();
      const periodMonth = now.getMonth() + 1;
      const periodYear = now.getFullYear();
      const existingPayment = await tx.payment.findUnique({
        where: {
          leaseId_periodMonth_periodYear: {
            leaseId: lease.id,
            periodMonth,
            periodYear,
          },
        },
      });
      if (!existingPayment) {
        await tx.payment.create({
          data: {
            organizationId,
            leaseId: lease.id,
            amount: lease.monthlyRent,
            dueDate: new Date(periodYear, periodMonth - 1, 5),
            periodMonth,
            periodYear,
            status: PaymentStatus.PENDING,
          },
        });
      }

      return updated;
    });
  }

  terminate(organizationId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const lease = await tx.lease.findFirst({ where: { id, organizationId } });
      if (!lease) throw new NotFoundError('Contrat introuvable');

      const updated = await tx.lease.update({
        where: { id },
        data: { status: LeaseStatus.TERMINATED },
        include: { apartment: true, tenant: true },
      });

      await tx.apartment.update({
        where: { id: lease.apartmentId },
        data: { status: ApartmentStatus.AVAILABLE },
      });

      return updated;
    });
  }

  setContractPdfUrl(id: string, url: string) {
    return this.prisma.lease.update({ where: { id }, data: { contractPdfUrl: url } });
  }
}

@injectable()
export class LeaseService {
  constructor(
    @inject(LeaseRepository) private readonly repo: LeaseRepository,
    @inject(ApartmentRepository) private readonly apartmentRepo: ApartmentRepository,
    @inject(PdfService) private readonly pdfService: PdfService,
    @inject(CloudinaryService) private readonly cloudinary: CloudinaryService,
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(SubscriptionService) private readonly subscriptionService: SubscriptionService,
    @inject(AutomationEmitter) private readonly automation: AutomationEmitter,
    @inject(PortalAccessService) private readonly portalAccess: PortalAccessService,
  ) {}

  async list(organizationId: string, page: number, limit: number, skip: number, status?: LeaseStatus) {
    const [items, total] = await this.repo.findMany(organizationId, skip, limit, status);
    return { items, total };
  }

  async get(organizationId: string, id: string) {
    const lease = await this.repo.findById(organizationId, id);
    if (!lease) throw new NotFoundError('Contrat introuvable');
    return lease;
  }

  async create(organizationId: string, data: LeaseInput) {
    const apartment = await this.apartmentRepo.findById(organizationId, data.apartmentId);
    if (!apartment) throw new NotFoundError('Appartement introuvable');

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: data.tenantId, organizationId },
    });
    if (!tenant) throw new NotFoundError('Locataire introuvable');

    if (new Date(data.endDate) <= new Date(data.startDate)) {
      throw new ValidationError('La date de fin doit être après la date de début');
    }

    return this.repo.create(organizationId, {
      ...data,
      monthlyRent: data.monthlyRent ?? Number(apartment.rentAmount),
    });
  }

  async update(organizationId: string, id: string, data: Partial<LeaseInput>) {
    await this.get(organizationId, id);
    await this.repo.update(organizationId, id, data);
    return this.get(organizationId, id);
  }

  async activate(organizationId: string, id: string, actorUserId?: string) {
    const lease = await this.repo.activate(organizationId, id);
    this.automation.leaseActivated({
      organizationId,
      organizationName: lease.organization?.name,
      leaseId: lease.id,
      tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
      tenantPhone: lease.tenant.phone,
      apartmentLabel: lease.apartment.label,
      monthlyRent: decimalToNumber(lease.monthlyRent),
      startDate: lease.startDate,
      endDate: lease.endDate,
    });
    let portalAccess: unknown = null;
    if (actorUserId) {
      try {
        portalAccess = await this.portalAccess.maybeAutoProvisionOnLeaseActive(
          organizationId,
          lease.tenantId,
          actorUserId,
        );
      } catch (err) {
        console.error('[lease] auto portal provision failed (non-blocking)', err);
        const message = err instanceof Error ? err.message : 'Échec de la création du compte locataire';
        portalAccess = {
          provisioned: false,
          error: true,
          message,
        };
      }
    }
    return {
      ...lease,
      portalAccess,
      /** Raccourcis utiles à l'UI propriétaire (association contrat / bien / org). */
      portalContext: {
        leaseId: lease.id,
        apartmentId: lease.apartmentId,
        apartmentLabel: lease.apartment?.label ?? null,
        tenantId: lease.tenantId,
        tenantName: lease.tenant
          ? `${lease.tenant.firstName} ${lease.tenant.lastName}`
          : null,
        organizationId,
      },
    };
  }

  terminate(organizationId: string, id: string) {
    return this.repo.terminate(organizationId, id);
  }

  async renew(organizationId: string, id: string, data: { endDate?: string; monthlyRent?: number; extensionMonths?: number }) {
    const lease = await this.get(organizationId, id);
    if (lease.status !== LeaseStatus.ACTIVE && lease.status !== LeaseStatus.EXPIRED) {
      throw new ValidationError('Seuls les baux actifs ou expirés peuvent être renouvelés');
    }

    const currentEnd = new Date(lease.endDate);
    let newEnd: Date;
    if (data.endDate) {
      newEnd = new Date(data.endDate);
    } else {
      const months = data.extensionMonths ?? 12;
      newEnd = new Date(currentEnd);
      newEnd.setMonth(newEnd.getMonth() + months);
    }

    if (newEnd <= currentEnd) throw new ValidationError('La nouvelle date de fin doit être postérieure à la date actuelle');

    await this.repo.update(organizationId, id, {
      endDate: newEnd.toISOString().slice(0, 10),
      ...(data.monthlyRent !== undefined ? { monthlyRent: data.monthlyRent } : {}),
    });

    const updated = await this.prisma.lease.update({
      where: { id },
      data: { status: LeaseStatus.ACTIVE },
      include: { apartment: true, tenant: true },
    });

    return updated;
  }

  async generateContractPdf(organizationId: string, id: string) {
    await this.subscriptionService.assertPdfLeaseAllowed(organizationId);
    const lease = await this.get(organizationId, id);
    const pdfBuffer = await this.pdfService.generateLeaseContract(lease);

    const fileName = `contrat-${lease.id}.pdf`;
    const upload = await this.cloudinary.uploadBuffer(pdfBuffer, {
      folder: `immo-tec/${organizationId}/contracts`,
      fileName,
      resourceType: 'raw',
    });

    await this.repo.setContractPdfUrl(id, upload.url);

    await this.prisma.document.create({
      data: {
        organizationId,
        type: 'LEASE_CONTRACT',
        fileName,
        mimeType: 'application/pdf',
        fileSize: pdfBuffer.length,
        cloudinaryUrl: upload.url,
        cloudinaryPublicId: upload.publicId,
        leaseId: id,
      },
    });

    return { url: upload.url, fileName };
  }
}
