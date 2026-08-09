import { inject, injectable } from 'tsyringe';
import { ApartmentStatus, LeaseStatus, PaymentStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/app.error.js';
import { PortalAccessService, type PortalActor } from './portal-access.service.js';
import type { TenantInput } from './tenant.service.js';

export interface OnboardLeaseInput {
  apartmentId: string;
  startDate: string;
  endDate: string;
  monthlyRent?: number;
  depositAmount?: number;
  terms?: string;
  /** Active le bail (logement OCCUPIED + 1er paiement). Défaut: true si lease fourni. */
  activate?: boolean;
}

export interface OnboardTenantInput extends TenantInput {
  lease?: OnboardLeaseInput;
  /** Crée le compte User TENANT + Membership. Défaut: true */
  provisionPortal?: boolean;
}

@injectable()
export class TenantOnboardService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(PortalAccessService) private readonly portalAccess: PortalAccessService,
  ) {}

  /**
   * Chaîne métier atomique :
   * Tenant CRM (+ Lease optionnel + activation) puis provision portail.
   * Si la provision échoue après création CRM → rollback compensatoire.
   */
  async onboard(organizationId: string, actor: PortalActor, input: OnboardTenantInput) {
    if (actor.organizationId !== organizationId) {
      throw new ForbiddenError('Organisation invalide');
    }

    const provisionPortal = true; // Toujours provisionner Identity + Membership (jamais CRM orphelin)
    const leaseInput = input.lease;
    const activateLease = leaseInput ? leaseInput.activate !== false : false;

    if (leaseInput && new Date(leaseInput.endDate) <= new Date(leaseInput.startDate)) {
      throw new ValidationError('La date de fin doit être après la date de début');
    }

    // Pré-check e-mail avant écritures (évite rollback fréquent)
    const email = input.email?.trim().toLowerCase() || undefined;
    if (provisionPortal && email) {
      const clash = await this.prisma.user.findFirst({ where: { email } });
      if (clash) throw new ConflictError('Cet e-mail est déjà utilisé par un autre compte');
    }

    let apartmentRent: number | undefined;
    if (leaseInput) {
      const apartment = await this.prisma.apartment.findFirst({
        where: { id: leaseInput.apartmentId, organizationId },
      });
      if (!apartment) throw new NotFoundError('Logement introuvable');
      if (apartment.status !== ApartmentStatus.AVAILABLE && activateLease) {
        throw new ConflictError('Ce logement n’est pas disponible');
      }
      const activeLease = await this.prisma.lease.findFirst({
        where: { apartmentId: apartment.id, status: LeaseStatus.ACTIVE },
      });
      if (activeLease && activateLease) {
        throw new ConflictError('Ce logement a déjà un contrat actif');
      }
      apartmentRent = Number(apartment.rentAmount);
    }

    const crm = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          organizationId,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          phone: input.phone.trim(),
          email,
          idNumber: input.idNumber,
          address: input.address,
          notes: input.notes,
        },
      });

      let lease: Prisma.LeaseGetPayload<{
        include: { apartment: { include: { building: true } }; tenant: true };
      }> | null = null;

      if (leaseInput) {
        const monthlyRent = leaseInput.monthlyRent ?? apartmentRent!;
        const status = activateLease ? LeaseStatus.ACTIVE : LeaseStatus.DRAFT;
        lease = await tx.lease.create({
          data: {
            organizationId,
            apartmentId: leaseInput.apartmentId,
            tenantId: tenant.id,
            startDate: new Date(leaseInput.startDate),
            endDate: new Date(leaseInput.endDate),
            monthlyRent,
            depositAmount: leaseInput.depositAmount,
            terms: leaseInput.terms,
            status,
            ...(activateLease ? { signedAt: new Date() } : {}),
          },
          include: {
            apartment: { include: { building: true } },
            tenant: true,
          },
        });

        if (activateLease) {
          await tx.apartment.update({
            where: { id: leaseInput.apartmentId },
            data: { status: ApartmentStatus.OCCUPIED },
          });

          const now = new Date();
          const periodMonth = now.getMonth() + 1;
          const periodYear = now.getFullYear();
          await tx.payment.create({
            data: {
              organizationId,
              leaseId: lease.id,
              amount: monthlyRent,
              dueDate: new Date(periodYear, periodMonth - 1, 5),
              periodMonth,
              periodYear,
              status: PaymentStatus.PENDING,
            },
          });
        }
      }

      return { tenant, lease };
    });

    let portalAccess: Awaited<ReturnType<PortalAccessService['provision']>> | null = null;

    if (provisionPortal) {
      try {
        portalAccess = await this.portalAccess.provision(actor, crm.tenant.id, {
          revealTemporaryPassword: true,
        });
      } catch (err) {
        await this.rollbackCrm(organizationId, crm.tenant.id, crm.lease?.id ?? null, leaseInput?.apartmentId);
        throw err;
      }
    }

    return {
      tenant: crm.tenant,
      lease: crm.lease,
      portalAccess,
      message: provisionPortal
        ? 'Locataire créé avec accès portail'
        : crm.lease
          ? 'Locataire et contrat créés'
          : 'Locataire créé',
    };
  }

  private async rollbackCrm(
    organizationId: string,
    tenantId: string,
    leaseId: string | null,
    apartmentId?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      if (leaseId) {
        await tx.payment.deleteMany({ where: { leaseId, organizationId } });
        await tx.lease.deleteMany({ where: { id: leaseId, organizationId } });
      }
      if (apartmentId) {
        await tx.apartment.updateMany({
          where: { id: apartmentId, organizationId },
          data: { status: ApartmentStatus.AVAILABLE },
        });
      }
      await tx.tenant.deleteMany({ where: { id: tenantId, organizationId } });
    });
  }
}
