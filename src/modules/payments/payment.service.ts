import { inject, injectable } from 'tsyringe';
import { PaymentStatus, PaymentMethod, Prisma, NotificationType } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { decimalToNumber } from '../../shared/utils/response.util.js';
import { PdfService } from '../../infrastructure/pdf/pdf.service.js';
import { CloudinaryService } from '../../infrastructure/storage/cloudinary.service.js';
import { SubscriptionService } from '../subscriptions/subscription.service.js';
import { AutomationEmitter } from '../automation/automation.emitter.js';
import { NotificationService } from '../notifications/notification.service.js';
import { NotFoundError, ValidationError } from '../../shared/errors/app.error.js';
import { isCloudinaryConfigured } from '../../config/env.js';

export interface CreatePaymentInput {
  leaseId: string;
  periodMonth: number;
  periodYear: number;
  amount?: number;
  dueDate?: string;
}

export interface RecordPaymentInput {
  amountPaid: number;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  paidAt?: string;
}

type CreatePaymentRepoInput = {
  leaseId: string;
  periodMonth: number;
  periodYear: number;
  amount: number;
  dueDate: Date;
};

@injectable()
export class PaymentRepository {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  findMany(organizationId: string, skip: number, limit: number, filters: {
    status?: PaymentStatus;
    leaseId?: string;
    buildingId?: string;
    apartmentId?: string;
  }) {
    const where: Prisma.PaymentWhereInput = {
      organizationId,
      ...(filters.status && { status: filters.status }),
      ...(filters.leaseId && { leaseId: filters.leaseId }),
      ...((filters.buildingId || filters.apartmentId) && {
        lease: {
          ...(filters.apartmentId && { apartmentId: filters.apartmentId }),
          ...(filters.buildingId && { apartment: { buildingId: filters.buildingId } }),
        },
      }),
    };

    return Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
        include: {
          lease: {
            include: {
              tenant: true,
              apartment: { include: { building: true } },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);
  }

  findById(organizationId: string, id: string) {
    return this.prisma.payment.findFirst({
      where: { id, organizationId },
      include: {
        lease: { include: { tenant: true, apartment: true, organization: true } },
        documents: true,
      },
    });
  }

  create(organizationId: string, data: CreatePaymentRepoInput) {
    return this.prisma.payment.create({
      data: {
        organizationId,
        leaseId: data.leaseId,
        amount: data.amount,
        dueDate: data.dueDate,
        periodMonth: data.periodMonth,
        periodYear: data.periodYear,
        status: PaymentStatus.PENDING,
      },
      include: { lease: { include: { tenant: true, apartment: true } } },
    });
  }

  recordPayment(organizationId: string, id: string, input: RecordPaymentInput) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id, organizationId } });
      if (!payment) throw new NotFoundError('Paiement introuvable');

      const newAmountPaid = Number(payment.amountPaid) + input.amountPaid;
      const totalAmount = Number(payment.amount);

      let status: PaymentStatus = PaymentStatus.PARTIAL;
      if (newAmountPaid >= totalAmount) status = PaymentStatus.PAID;
      else if (newAmountPaid > 0) status = PaymentStatus.PARTIAL;
      else status = PaymentStatus.PENDING;

      return tx.payment.update({
        where: { id },
        data: {
          amountPaid: newAmountPaid,
          status,
          method: input.method,
          reference: input.reference,
          notes: input.notes,
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        },
        include: { lease: { include: { tenant: true, apartment: true, organization: true } } },
      });
    });
  }

  markLatePayments() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.prisma.payment.updateMany({
      where: {
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] },
        dueDate: { lt: today },
      },
      data: { status: PaymentStatus.LATE },
    });
  }

  setReceiptPdfUrl(id: string, url: string) {
    return this.prisma.payment.update({ where: { id }, data: { receiptPdfUrl: url } });
  }
}

@injectable()
export class PaymentService {
  constructor(
    @inject(PaymentRepository) private readonly repo: PaymentRepository,
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(PdfService) private readonly pdfService: PdfService,
    @inject(CloudinaryService) private readonly cloudinary: CloudinaryService,
    @inject(SubscriptionService) private readonly subscriptionService: SubscriptionService,
    @inject(AutomationEmitter) private readonly automation: AutomationEmitter,
    @inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  async list(organizationId: string, page: number, limit: number, skip: number, filters: {
    status?: PaymentStatus;
    leaseId?: string;
    buildingId?: string;
    apartmentId?: string;
  }) {
    await this.repo.markLatePayments();
    const [items, total] = await this.repo.findMany(organizationId, skip, limit, filters);
    return { items, total };
  }

  async get(organizationId: string, id: string) {
    const payment = await this.repo.findById(organizationId, id);
    if (!payment) throw new NotFoundError('Paiement introuvable');
    return payment;
  }

  async create(organizationId: string, data: CreatePaymentInput) {
    const lease = await this.prisma.lease.findFirst({
      where: { id: data.leaseId, organizationId },
    });
    if (!lease) throw new NotFoundError('Contrat introuvable');

    if (data.periodMonth < 1 || data.periodMonth > 12) {
      throw new ValidationError('Mois invalide (1-12)');
    }

    const amount = data.amount ?? Number(lease.monthlyRent);
    const dueDate = data.dueDate
      ? new Date(data.dueDate)
      : new Date(data.periodYear, data.periodMonth - 1, 5);

    return this.repo.create(organizationId, {
      leaseId: data.leaseId,
      periodMonth: data.periodMonth,
      periodYear: data.periodYear,
      amount,
      dueDate,
    });
  }

  async recordPayment(organizationId: string, id: string, input: RecordPaymentInput) {
    if (input.amountPaid <= 0) throw new ValidationError('Montant invalide');
    const payment = await this.repo.recordPayment(organizationId, id, input);

    if (payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.PARTIAL) {
      const tenantName = `${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`;
      const amount = decimalToNumber(payment.amountPaid);

      this.automation.paymentReceived({
        organizationId,
        organizationName: payment.lease.organization?.name,
        paymentId: payment.id,
        amount,
        tenantName,
        tenantPhone: payment.lease.tenant.phone,
        apartmentLabel: payment.lease.apartment.label,
        receiptUrl: payment.receiptPdfUrl,
      });

      await this.notifications.notifyOrganizationStaff({
        organizationId,
        type: NotificationType.PAYMENT_RECEIVED,
        title: 'Paiement reçu',
        message: `${tenantName} — ${amount.toLocaleString('fr-FR')} XAF`,
        data: { paymentId: payment.id, amount },
      });

      if (payment.status === PaymentStatus.PAID && !payment.receiptPdfUrl && isCloudinaryConfigured) {
        this.generateReceiptPdf(organizationId, payment.id).catch((err) => {
          console.warn('[payment] Reçu auto échoué:', err instanceof Error ? err.message : err);
        });
      }
    }

    return payment;
  }

  async initiateMobileMoney(organizationId: string, id: string) {
    const payment = await this.get(organizationId, id);
    if (payment.status === PaymentStatus.PAID) {
      throw new ValidationError('Ce loyer est déjà payé');
    }

    const remaining = decimalToNumber(payment.amount) - decimalToNumber(payment.amountPaid);
    const reference = payment.reference
      ?? `IMO-${payment.id.slice(-8).toUpperCase()}-${Date.now().toString(36).slice(-6).toUpperCase()}`;

    if (!payment.reference) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { reference } });
    }

    return {
      paymentId: payment.id,
      reference,
      amount: remaining,
      currency: payment.currency,
      tenantName: `${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`,
      apartmentLabel: payment.lease.apartment.label,
      instructions: `Payez ${remaining.toLocaleString('fr-FR')} XAF via Mobile Money avec la référence : ${reference}`,
      providers: ['MTN MoMo', 'Airtel Money'],
    };
  }

  async processMobileMoneyWebhook(data: { reference: string; amountPaid: number; provider?: string }) {
    const payment = await this.prisma.payment.findFirst({
      where: { reference: data.reference },
    });
    if (!payment) throw new NotFoundError('Référence de paiement introuvable');

    return this.recordPayment(payment.organizationId, payment.id, {
      amountPaid: data.amountPaid,
      method: PaymentMethod.MOBILE_MONEY,
      reference: data.reference,
      notes: data.provider ? `Mobile Money — ${data.provider}` : 'Mobile Money',
    });
  }

  async generateReceiptPdf(organizationId: string, id: string) {
    await this.subscriptionService.assertPdfReceiptAllowed(organizationId);
    const payment = await this.get(organizationId, id);
    if (payment.status !== PaymentStatus.PAID && payment.status !== PaymentStatus.PARTIAL) {
      throw new ValidationError('Le paiement doit être enregistré avant de générer un reçu');
    }

    const pdfBuffer = await this.pdfService.generatePaymentReceipt(payment);
    const fileName = `recu-${payment.periodYear}-${payment.periodMonth}-${payment.id}.pdf`;

    const upload = await this.cloudinary.uploadBuffer(pdfBuffer, {
      folder: `immo-tec/${organizationId}/receipts`,
      fileName,
      resourceType: 'raw',
    });

    await this.repo.setReceiptPdfUrl(id, upload.url);

    await this.prisma.document.create({
      data: {
        organizationId,
        type: 'PAYMENT_RECEIPT',
        fileName,
        mimeType: 'application/pdf',
        fileSize: pdfBuffer.length,
        cloudinaryUrl: upload.url,
        cloudinaryPublicId: upload.publicId,
        paymentId: id,
        leaseId: payment.leaseId,
      },
    });

    return { url: upload.url, fileName };
  }

  async exportExcel(organizationId: string): Promise<string> {
    const { items } = await this.list(organizationId, 1, 10000, 0, {});
    const header = 'id,leaseId,periodMonth,periodYear,amount,amountPaid,status,dueDate,paidAt';
    const lines = items.map((p) => {
      const amount = decimalToNumber(p.amount);
      const amountPaid = decimalToNumber(p.amountPaid);
      return [
        p.id,
        p.leaseId,
        p.periodMonth,
        p.periodYear,
        amount,
        amountPaid,
        p.status,
        p.dueDate?.toISOString() ?? '',
        p.paidAt?.toISOString() ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });
    return [header, ...lines].join('\n');
  }
}
