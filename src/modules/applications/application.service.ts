import { inject, injectable } from 'tsyringe';
import {
  ApartmentStatus,
  LeaseStatus,
  NotificationType,
  Prisma,
  RentalApplicationStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors/app.error.js';
import { ORG_NOTIFY_ROLES, isPlatformAdmin, isTenant } from '../../shared/auth/roles.js';
import { NotificationService } from '../notifications/notification.service.js';
import { ApplicationScoringService } from './application-scoring.service.js';

export interface CreateApplicationInput {
  apartmentId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  profession?: string;
  monthlyIncome?: number;
  idNumber?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorEmail?: string;
  documentsNotes?: string;
  address?: string;
  employer?: string;
  formData?: Prisma.InputJsonValue;
  currentStep?: number;
}

export interface SaveDraftInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  profession?: string;
  monthlyIncome?: number | null;
  idNumber?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorEmail?: string;
  documentsNotes?: string;
  address?: string;
  employer?: string;
  formData?: Prisma.InputJsonValue;
  currentStep?: number;
}

const detailInclude = {
  apartment: { include: { building: true } },
  applicant: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
  documents: { orderBy: { createdAt: 'desc' as const } },
};

@injectable()
export class ApplicationService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(NotificationService) private readonly notifications: NotificationService,
    @inject(ApplicationScoringService) private readonly scoring: ApplicationScoringService,
  ) {}

  private async resolveApartment(apartmentId: string) {
    const apt = await this.prisma.apartment.findFirst({
      where: {
        id: apartmentId,
        isPublished: true,
        status: ApartmentStatus.AVAILABLE,
        organization: { isActive: true, isValidated: true },
      },
      include: { organization: true },
    });
    if (!apt) throw new NotFoundError('Logement non disponible à la location');
    return apt;
  }

  private async assertApplicantDraft(appId: string, applicantUserId: string) {
    const app = await this.prisma.rentalApplication.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundError('Candidature introuvable');
    if (app.applicantUserId !== applicantUserId) throw new ForbiddenError('Accès refusé');
    if (app.status !== RentalApplicationStatus.DRAFT) {
      throw new ValidationError('Seuls les brouillons peuvent être modifiés');
    }
    return app;
  }

  async getOrCreateDraft(applicantUserId: string, apartmentId: string) {
    const apt = await this.resolveApartment(apartmentId);

    const active = await this.prisma.rentalApplication.findFirst({
      where: {
        apartmentId,
        applicantUserId,
        status: { in: [RentalApplicationStatus.PENDING, RentalApplicationStatus.UNDER_REVIEW, RentalApplicationStatus.AI_SCORED] },
      },
    });
    if (active) throw new ValidationError('Vous avez déjà une candidature en cours pour ce logement');

    const draft = await this.prisma.rentalApplication.findFirst({
      where: { apartmentId, applicantUserId, status: RentalApplicationStatus.DRAFT },
      include: detailInclude,
    });
    if (draft) return draft;

    const user = await this.prisma.user.findUnique({ where: { id: applicantUserId } });
    if (!user) throw new NotFoundError('Utilisateur introuvable');

    return this.prisma.rentalApplication.create({
      data: {
        organizationId: apt.organizationId,
        apartmentId: apt.id,
        applicantUserId,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone ?? '',
        email: user.email,
        status: RentalApplicationStatus.DRAFT,
        currentStep: 0,
      },
      include: detailInclude,
    });
  }

  async saveDraft(applicantUserId: string, id: string, input: SaveDraftInput) {
    await this.assertApplicantDraft(id, applicantUserId);

    return this.prisma.rentalApplication.update({
      where: { id },
      data: {
        ...(input.firstName !== undefined && { firstName: input.firstName }),
        ...(input.lastName !== undefined && { lastName: input.lastName }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email || null }),
        ...(input.profession !== undefined && { profession: input.profession || null }),
        ...(input.monthlyIncome !== undefined && {
          monthlyIncome: input.monthlyIncome == null ? null : input.monthlyIncome,
        }),
        ...(input.idNumber !== undefined && { idNumber: input.idNumber || null }),
        ...(input.guarantorName !== undefined && { guarantorName: input.guarantorName || null }),
        ...(input.guarantorPhone !== undefined && { guarantorPhone: input.guarantorPhone || null }),
        ...(input.guarantorEmail !== undefined && { guarantorEmail: input.guarantorEmail || null }),
        ...(input.documentsNotes !== undefined && { documentsNotes: input.documentsNotes || null }),
        ...(input.address !== undefined && { address: input.address || null }),
        ...(input.employer !== undefined && { employer: input.employer || null }),
        ...(input.formData !== undefined && { formData: input.formData }),
        ...(input.currentStep !== undefined && { currentStep: input.currentStep }),
      },
      include: detailInclude,
    });
  }

  private validateForSubmit(app: {
    firstName: string;
    lastName: string;
    phone: string;
    idNumber: string | null;
    monthlyIncome: Prisma.Decimal | null;
    documents: { category: string }[];
  }) {
    const errors: string[] = [];
    if (!app.firstName || app.firstName.length < 2) errors.push('Prénom requis');
    if (!app.lastName || app.lastName.length < 2) errors.push('Nom requis');
    if (!app.phone || app.phone.length < 8) errors.push('Téléphone requis');
    if (!app.idNumber) errors.push('Numéro de pièce d\'identité requis');
    if (!app.monthlyIncome) errors.push('Revenus mensuels requis');
    const hasId = app.documents.some((d) => d.category === 'ID_CARD');
    if (!hasId) errors.push('Carte d\'identité requise');
    if (errors.length) throw new ValidationError(errors.join(' · '));
  }

  async submit(applicantUserId: string, id: string) {
    const app = await this.prisma.rentalApplication.findUnique({
      where: { id },
      include: { apartment: true, documents: true },
    });
    if (!app) throw new NotFoundError('Candidature introuvable');
    if (app.applicantUserId !== applicantUserId) throw new ForbiddenError('Accès refusé');
    if (app.status !== RentalApplicationStatus.DRAFT) {
      throw new ValidationError('Cette candidature a déjà été envoyée');
    }

    this.validateForSubmit(app);

    const submitted = await this.prisma.rentalApplication.update({
      where: { id },
      data: {
        status: RentalApplicationStatus.PENDING,
        submittedAt: new Date(),
      },
      include: detailInclude,
    });

    const admins = await this.prisma.user.findMany({
      where: {
        organizationId: app.organizationId,
        role: { in: ORG_NOTIFY_ROLES },
        isActive: true,
      },
      select: { id: true },
    });
    for (const admin of admins) {
      await this.notifications.create({
        userId: admin.id,
        organizationId: app.organizationId,
        type: NotificationType.SYSTEM,
        title: 'Nouvelle candidature',
        message: `${app.firstName} ${app.lastName} a postulé pour ${app.apartment.label}`,
        data: { applicationId: id, apartmentId: app.apartmentId },
      });
    }

    await this.prisma.rentalApplication.update({
      where: { id },
      data: { status: RentalApplicationStatus.UNDER_REVIEW },
    });

    const scored = await this.runAiScoring(app.organizationId, id);

    if (app.applicantUserId) {
      await this.notifications.create({
        userId: app.applicantUserId,
        organizationId: app.organizationId,
        type: NotificationType.SYSTEM,
        title: 'Candidature en analyse',
        message: `Votre dossier pour ${app.apartment.label} est en cours d'analyse IA.`,
        data: { applicationId: id },
      });
    }

    return scored;
  }

  /** Compatibilité API legacy — crée et soumet directement */
  async create(applicantUserId: string, input: CreateApplicationInput) {
    const draft = await this.getOrCreateDraft(applicantUserId, input.apartmentId);
    await this.saveDraft(applicantUserId, draft.id, {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email,
      profession: input.profession,
      monthlyIncome: input.monthlyIncome,
      idNumber: input.idNumber,
      guarantorName: input.guarantorName,
      guarantorPhone: input.guarantorPhone,
      guarantorEmail: input.guarantorEmail,
      documentsNotes: input.documentsNotes,
      address: input.address,
      employer: input.employer,
      formData: input.formData,
      currentStep: input.currentStep,
    });
    return this.submit(applicantUserId, draft.id);
  }

  async listForOrg(
    organizationId: string,
    skip: number,
    limit: number,
    filters: { status?: RentalApplicationStatus; apartmentId?: string },
  ) {
    const where = {
      organizationId,
      ...(filters.apartmentId && { apartmentId: filters.apartmentId }),
      ...(filters.status
        ? { status: filters.status }
        : { status: { not: RentalApplicationStatus.DRAFT } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.rentalApplication.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          apartment: { include: { building: true } },
          applicant: { select: { id: true, email: true, firstName: true, lastName: true } },
          documents: { select: { id: true, category: true } },
        },
      }),
      this.prisma.rentalApplication.count({ where }),
    ]);

    return { items, total };
  }

  async listMine(applicantUserId: string, skip: number, limit: number) {
    const where = { applicantUserId };
    const [items, total] = await Promise.all([
      this.prisma.rentalApplication.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          apartment: { include: { building: true, organization: { select: { name: true } } } },
          documents: { select: { id: true, category: true } },
        },
      }),
      this.prisma.rentalApplication.count({ where }),
    ]);
    return { items, total };
  }

  async get(organizationId: string | null, id: string, userId: string, role: UserRole) {
    const app = await this.prisma.rentalApplication.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!app) throw new NotFoundError('Demande introuvable');

    if (isTenant(role) && app.applicantUserId !== userId) {
      throw new ForbiddenError('Accès refusé');
    }
    if (!isPlatformAdmin(role) && !isTenant(role) && app.organizationId !== organizationId) {
      throw new ForbiddenError('Accès refusé');
    }

    return app;
  }

  async runAiScoring(organizationId: string, id: string) {
    const app = await this.prisma.rentalApplication.findFirst({
      where: { id, organizationId },
      include: { apartment: true, documents: true },
    });
    if (!app) throw new NotFoundError('Demande introuvable');

    const result = await this.scoring.scoreApplication(app);

    return this.prisma.rentalApplication.update({
      where: { id },
      data: {
        aiScore: result.score,
        aiSummary: result.summary,
        status: RentalApplicationStatus.AI_SCORED,
      },
      include: detailInclude,
    });
  }

  async review(
    organizationId: string,
    id: string,
    reviewerId: string,
    decision: 'accept' | 'reject',
    rejectionReason?: string,
  ) {
    const app = await this.prisma.rentalApplication.findFirst({
      where: { id, organizationId },
      include: { apartment: true },
    });
    if (!app) throw new NotFoundError('Demande introuvable');
    if (app.status === RentalApplicationStatus.ACCEPTED || app.status === RentalApplicationStatus.REJECTED) {
      throw new ValidationError('Cette demande a déjà été traitée');
    }

    if (decision === 'reject') {
      const updated = await this.prisma.rentalApplication.update({
        where: { id },
        data: {
          status: RentalApplicationStatus.REJECTED,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          rejectionReason: rejectionReason ?? 'Demande refusée',
        },
        include: detailInclude,
      });
      if (app.applicantUserId) {
        await this.notifications.create({
          userId: app.applicantUserId,
          organizationId,
          type: NotificationType.SYSTEM,
          title: 'Candidature refusée',
          message: rejectionReason ?? 'Votre candidature n\'a pas été retenue.',
          data: { applicationId: id },
        });
      }
      return updated;
    }

    return this.prisma.$transaction(async (tx) => {
      let tenant = await tx.tenant.findFirst({
        where: { organizationId, phone: app.phone },
      });
      if (!tenant) {
        tenant = await tx.tenant.create({
          data: {
            organizationId,
            userId: app.applicantUserId,
            firstName: app.firstName,
            lastName: app.lastName,
            phone: app.phone,
            email: app.email,
            idNumber: app.idNumber,
          },
        });
      }

      const lease = await tx.lease.create({
        data: {
          organizationId,
          apartmentId: app.apartmentId,
          tenantId: tenant.id,
          startDate: new Date(),
          endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
          monthlyRent: app.apartment.rentAmount,
          status: LeaseStatus.DRAFT,
        },
      });

      await tx.apartment.update({
        where: { id: app.apartmentId },
        data: { status: ApartmentStatus.OCCUPIED, isPublished: false, publishedAt: null },
      });

      const updated = await tx.rentalApplication.update({
        where: { id },
        data: {
          status: RentalApplicationStatus.ACCEPTED,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
        },
        include: detailInclude,
      });

      if (app.applicantUserId) {
        await this.notifications.create({
          userId: app.applicantUserId,
          organizationId,
          type: NotificationType.SYSTEM,
          title: 'Candidature acceptée',
          message: `Votre demande pour ${app.apartment.label} a été acceptée. Contrat en préparation.`,
          data: { applicationId: id, leaseId: lease.id },
        });
      }

      return { application: updated, lease };
    });
  }

  async withdraw(userId: string, applicationId: string) {
    const app = await this.prisma.rentalApplication.findFirst({
      where: { id: applicationId, applicantUserId: userId },
    });
    if (!app) throw new NotFoundError('Demande introuvable');

    const terminal: RentalApplicationStatus[] = [
      RentalApplicationStatus.ACCEPTED,
      RentalApplicationStatus.REJECTED,
      RentalApplicationStatus.WITHDRAWN,
    ];
    if (terminal.includes(app.status)) {
      throw new ValidationError('Cette candidature ne peut plus être annulée');
    }

    return this.prisma.rentalApplication.update({
      where: { id: applicationId },
      data: { status: RentalApplicationStatus.WITHDRAWN },
      include: detailInclude,
    });
  }
}
