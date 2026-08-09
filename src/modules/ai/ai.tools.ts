import { inject, injectable } from 'tsyringe';
import { ApartmentStatus, LeaseStatus, PaymentStatus } from '@prisma/client';
import type OpenAI from 'openai';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { decimalToNumber } from '../../shared/utils/response.util.js';
import { AiContextService } from './ai.context.service.js';

export type AiToolName =
  | 'getDashboardSummary'
  | 'getOutstandingPayments'
  | 'getVacantUnits'
  | 'getContracts'
  | 'getTenants'
  | 'getFinancialSummary'
  | 'getExpiringContracts'
  | 'proposeGenerateLeasePdf'
  | 'proposeGeneratePaymentReceipt'
  | 'proposeGeneratePaymentNotice';

export const OPENAI_TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'getDashboardSummary',
      description: 'Résumé du patrimoine : biens, occupation, locataires, impayés, encaissements du mois.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getOutstandingPayments',
      description: 'Liste les loyers en retard (impayés) de l’organisation.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getVacantUnits',
      description: 'Logements vacants / disponibles.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getContracts',
      description: 'Contrats de location récents (actifs, brouillon, expirés).',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'ACTIVE | DRAFT | EXPIRED | TERMINATED (optionnel)' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getTenants',
      description: 'Liste des locataires de l’organisation.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getFinancialSummary',
      description: 'Synthèse financière : encaissé ce mois, potentiel, impayés, en attente.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getExpiringContracts',
      description: 'Contrats arrivant à échéance sous 30 jours.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proposeGenerateLeasePdf',
      description:
        'Propose la génération d’un contrat PDF professionnel. Ne génère PAS immédiatement — l’utilisateur doit confirmer.',
      parameters: {
        type: 'object',
        properties: {
          leaseId: { type: 'string', description: 'ID du bail (cuid). Optionnel pour lister les baux.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proposeGeneratePaymentReceipt',
      description:
        'Propose un reçu/quittance PDF pour un paiement déjà enregistré (PAID/PARTIAL). Confirmation utilisateur obligatoire.',
      parameters: {
        type: 'object',
        properties: {
          paymentId: { type: 'string', description: 'ID du paiement (cuid). Optionnel pour lister les paiements payés.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proposeGeneratePaymentNotice',
      description:
        'Propose un avis de paiement PDF (rappel de loyer) pour PENDING/LATE/PARTIAL. Confirmation utilisateur obligatoire.',
      parameters: {
        type: 'object',
        properties: {
          paymentId: { type: 'string', description: 'ID du paiement (cuid). Optionnel pour lister les impayés / en attente.' },
        },
        additionalProperties: false,
      },
    },
  },
];

@injectable()
export class AiToolsService {
  constructor(
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(AiContextService) private readonly contextService: AiContextService,
  ) {}

  async execute(
    organizationId: string,
    toolName: string,
    rawArgs: string | Record<string, unknown> | undefined,
  ): Promise<unknown> {
    const args =
      typeof rawArgs === 'string'
        ? (JSON.parse(rawArgs || '{}') as Record<string, unknown>)
        : (rawArgs ?? {});

    switch (toolName as AiToolName) {
      case 'getDashboardSummary':
        return this.getDashboardSummary(organizationId);
      case 'getOutstandingPayments':
        return this.getOutstandingPayments(organizationId);
      case 'getVacantUnits':
        return this.getVacantUnits(organizationId);
      case 'getContracts':
        return this.getContracts(organizationId, typeof args.status === 'string' ? args.status : undefined);
      case 'getTenants':
        return this.getTenants(organizationId);
      case 'getFinancialSummary':
        return this.getFinancialSummary(organizationId);
      case 'getExpiringContracts':
        return this.getExpiringContracts(organizationId);
      case 'proposeGenerateLeasePdf':
        return this.listLeasesForPdf(organizationId, typeof args.leaseId === 'string' ? args.leaseId : undefined);
      case 'proposeGeneratePaymentReceipt':
        return this.listPaymentsForReceipt(
          organizationId,
          typeof args.paymentId === 'string' ? args.paymentId : undefined,
        );
      case 'proposeGeneratePaymentNotice':
        return this.listPaymentsForNotice(
          organizationId,
          typeof args.paymentId === 'string' ? args.paymentId : undefined,
        );
      default:
        return { error: `Outil inconnu: ${toolName}` };
    }
  }

  /** Intent routing sans LLM — données réelles uniquement. */
  resolveLocalToolIntents(message: string): AiToolName[] {
    const q = message
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');

    const tools: AiToolName[] = [];
    if (
      q.includes('impay') ||
      q.includes('retard') ||
      (q.includes('pas encore pay') && q.includes('locataire'))
    ) {
      tools.push('getOutstandingPayments');
    }
    if (q.includes('vacant') || q.includes('disponib') || q.includes('libre')) {
      tools.push('getVacantUnits');
    }
    if (q.includes('expir') || q.includes('echeanc')) {
      tools.push('getExpiringContracts');
    }
    if (
      (q.includes('contrat') || q.includes('bail')) &&
      (q.includes('gener') || q.includes('cree') || q.includes('pdf') || q.includes('prepar'))
    ) {
      tools.push('proposeGenerateLeasePdf');
    } else if (q.includes('contrat') || q.includes('bail')) {
      tools.push('getContracts');
    }
    if (
      (q.includes('recu') || q.includes('quittance')) &&
      (q.includes('gener') || q.includes('cree') || q.includes('pdf') || q.includes('prepar') || q.includes('fais'))
    ) {
      tools.push('proposeGeneratePaymentReceipt');
    }
    if (
      (q.includes('avis de paiement') || (q.includes('avis') && q.includes('loyer')) || q.includes('rappel de loyer')) &&
      (q.includes('gener') || q.includes('cree') || q.includes('pdf') || q.includes('prepar') || q.includes('envoie') || q.includes('fais'))
    ) {
      tools.push('proposeGeneratePaymentNotice');
    }
    if (q.includes('locataire') && !q.includes('retirer') && !q.includes('ajout')) {
      tools.push('getTenants');
    }
    if (q.includes('revenu') || q.includes('financ') || q.includes('encaiss')) {
      tools.push('getFinancialSummary');
    }
    if (
      q.includes('patrimoine') ||
      q.includes('resume') ||
      q.includes('situation') ||
      q.includes('dashboard') ||
      q.includes('parc')
    ) {
      tools.push('getDashboardSummary');
    }
    return [...new Set(tools)];
  }

  private async getDashboardSummary(organizationId: string) {
    const ctx = await this.contextService.buildContext(organizationId);
    return { organization: ctx.organization, summary: ctx.summary };
  }

  private async getOutstandingPayments(organizationId: string) {
    const rows = await this.prisma.payment.findMany({
      where: { organizationId, status: PaymentStatus.LATE },
      take: 20,
      orderBy: { dueDate: 'asc' },
      include: {
        lease: { include: { tenant: true, apartment: true } },
      },
    });
    return {
      count: rows.length,
      items: rows.map((p) => ({
        id: p.id,
        amountXaf: decimalToNumber(p.amount),
        dueDate: p.dueDate.toISOString().slice(0, 10),
        period: `${p.periodMonth}/${p.periodYear}`,
        tenantName: `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}`,
        apartmentLabel: p.lease.apartment.label,
      })),
    };
  }

  private async getVacantUnits(organizationId: string) {
    const rows = await this.prisma.apartment.findMany({
      where: { organizationId, status: ApartmentStatus.AVAILABLE },
      take: 30,
      select: {
        id: true,
        label: true,
        rentAmount: true,
        building: { select: { id: true, name: true } },
      },
    });
    return {
      count: rows.length,
      items: rows.map((a) => ({
        id: a.id,
        label: a.label,
        rentXaf: decimalToNumber(a.rentAmount),
        buildingId: a.building?.id,
        buildingName: a.building?.name,
      })),
    };
  }

  private async getContracts(organizationId: string, status?: string) {
    const whereStatus =
      status && Object.values(LeaseStatus).includes(status as LeaseStatus)
        ? { status: status as LeaseStatus }
        : { status: { in: [LeaseStatus.ACTIVE, LeaseStatus.DRAFT, LeaseStatus.EXPIRED] } };

    const rows = await this.prisma.lease.findMany({
      where: { organizationId, ...whereStatus },
      take: 20,
      orderBy: { updatedAt: 'desc' },
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true } },
        apartment: { select: { id: true, label: true } },
      },
    });
    return {
      count: rows.length,
      items: rows.map((l) => ({
        id: l.id,
        status: l.status,
        monthlyRentXaf: decimalToNumber(l.monthlyRent),
        startDate: l.startDate.toISOString().slice(0, 10),
        endDate: l.endDate.toISOString().slice(0, 10),
        tenantName: `${l.tenant.firstName} ${l.tenant.lastName}`,
        tenantId: l.tenant.id,
        apartmentLabel: l.apartment.label,
        apartmentId: l.apartment.id,
        hasPdf: Boolean(l.contractPdfUrl),
      })),
    };
  }

  private async getTenants(organizationId: string) {
    const rows = await this.prisma.tenant.findMany({
      where: { organizationId },
      take: 40,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        _count: { select: { leases: true } },
      },
    });
    return {
      count: rows.length,
      items: rows.map((t) => ({
        id: t.id,
        name: `${t.firstName} ${t.lastName}`,
        phone: t.phone,
        email: t.email,
        leasesCount: t._count.leases,
      })),
    };
  }

  private async getFinancialSummary(organizationId: string) {
    const ctx = await this.contextService.buildContext(organizationId);
    const s = ctx.summary;
    return {
      collectedThisMonthXaf: s.collectedThisMonthXaf,
      potentialMonthlyRentXaf: s.potentialMonthlyRentXaf,
      latePayments: s.latePayments,
      pendingPayments: s.pendingPayments,
      occupancyRate: s.occupancyRate,
    };
  }

  private async getExpiringContracts(organizationId: string) {
    const ctx = await this.contextService.buildContext(organizationId);
    return { count: ctx.expiringLeases.length, items: ctx.expiringLeases };
  }

  private async listLeasesForPdf(organizationId: string, leaseId?: string) {
    if (leaseId) {
      const lease = await this.prisma.lease.findFirst({
        where: { id: leaseId, organizationId },
        include: {
          tenant: { select: { firstName: true, lastName: true } },
          apartment: { select: { label: true } },
        },
      });
      if (!lease) return { found: false, leaseId };
      return {
        found: true,
        lease: {
          id: lease.id,
          status: lease.status,
          tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
          apartmentLabel: lease.apartment.label,
          monthlyRentXaf: decimalToNumber(lease.monthlyRent),
        },
        requiresUserConfirmation: true,
      };
    }
    const listed = await this.getContracts(organizationId);
    return { ...listed, requiresUserConfirmation: true };
  }

  private async listPaymentsForReceipt(organizationId: string, paymentId?: string) {
    if (paymentId) {
      const payment = await this.prisma.payment.findFirst({
        where: {
          id: paymentId,
          organizationId,
          status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIAL] },
        },
        include: {
          lease: {
            include: {
              tenant: { select: { firstName: true, lastName: true } },
              apartment: { select: { label: true } },
            },
          },
        },
      });
      if (!payment) {
        return { found: false, paymentId, requiresUserConfirmation: true };
      }
      return {
        found: true,
        payment: {
          id: payment.id,
          status: payment.status,
          amountPaidXaf: decimalToNumber(payment.amountPaid),
          period: `${payment.periodMonth}/${payment.periodYear}`,
          tenantName: `${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`,
          apartmentLabel: payment.lease.apartment.label,
          hasReceipt: Boolean(payment.receiptPdfUrl),
        },
        requiresUserConfirmation: true,
      };
    }

    const rows = await this.prisma.payment.findMany({
      where: { organizationId, status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIAL] } },
      take: 15,
      orderBy: [{ paidAt: 'desc' }, { updatedAt: 'desc' }],
      include: {
        lease: {
          include: {
            tenant: { select: { firstName: true, lastName: true } },
            apartment: { select: { label: true } },
          },
        },
      },
    });
    return {
      count: rows.length,
      items: rows.map((p) => ({
        id: p.id,
        status: p.status,
        amountPaidXaf: decimalToNumber(p.amountPaid),
        period: `${p.periodMonth}/${p.periodYear}`,
        tenantName: `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}`,
        apartmentLabel: p.lease.apartment.label,
        hasReceipt: Boolean(p.receiptPdfUrl),
      })),
      requiresUserConfirmation: true,
    };
  }

  private async listPaymentsForNotice(organizationId: string, paymentId?: string) {
    if (paymentId) {
      const payment = await this.prisma.payment.findFirst({
        where: {
          id: paymentId,
          organizationId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.LATE, PaymentStatus.PARTIAL] },
        },
        include: {
          lease: {
            include: {
              tenant: { select: { firstName: true, lastName: true } },
              apartment: { select: { label: true } },
            },
          },
        },
      });
      if (!payment) {
        return { found: false, paymentId, requiresUserConfirmation: true };
      }
      const due = Math.max(0, decimalToNumber(payment.amount) - decimalToNumber(payment.amountPaid));
      return {
        found: true,
        payment: {
          id: payment.id,
          status: payment.status,
          amountDueXaf: due,
          period: `${payment.periodMonth}/${payment.periodYear}`,
          dueDate: payment.dueDate.toISOString().slice(0, 10),
          tenantName: `${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`,
          apartmentLabel: payment.lease.apartment.label,
        },
        requiresUserConfirmation: true,
      };
    }

    const rows = await this.prisma.payment.findMany({
      where: {
        organizationId,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.LATE, PaymentStatus.PARTIAL] },
      },
      take: 15,
      orderBy: { dueDate: 'asc' },
      include: {
        lease: {
          include: {
            tenant: { select: { firstName: true, lastName: true } },
            apartment: { select: { label: true } },
          },
        },
      },
    });
    return {
      count: rows.length,
      items: rows.map((p) => ({
        id: p.id,
        status: p.status,
        amountDueXaf: Math.max(0, decimalToNumber(p.amount) - decimalToNumber(p.amountPaid)),
        period: `${p.periodMonth}/${p.periodYear}`,
        dueDate: p.dueDate.toISOString().slice(0, 10),
        tenantName: `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}`,
        apartmentLabel: p.lease.apartment.label,
      })),
      requiresUserConfirmation: true,
    };
  }
}

export function formatToolResultForLocalReply(toolName: string, result: unknown): string {
  const data = result as Record<string, unknown>;
  if (toolName === 'getDashboardSummary' && data.summary) {
    const s = data.summary as Record<string, number>;
    const org = data.organization as { name?: string };
    return `Résumé « ${org?.name ?? 'Organisation'} » :
• ${s.totalApartments} biens · occupation ${s.occupancyRate} %
• ${Number(s.collectedThisMonthXaf).toLocaleString('fr-FR')} XAF encaissés ce mois
• ${s.latePayments} impayé(s) · ${s.availableApartments} vacant(s)
• ${s.activeLeases} contrats · ${s.totalTenants} locataires`;
  }
  if (toolName === 'getOutstandingPayments') {
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucun loyer en retard sur les données actuelles.';
    const list = items
      .slice(0, 10)
      .map(
        (p) =>
          `• ${p.tenantName} (${p.apartmentLabel}) : ${Number(p.amountXaf).toLocaleString('fr-FR')} XAF — échéance ${p.dueDate}`,
      )
      .join('\n');
    return `${data.count} impayé(s) :\n${list}`;
  }
  if (toolName === 'getVacantUnits') {
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucun logement vacant.';
    const list = items
      .map(
        (a) =>
          `• ${a.label}${a.buildingName ? ` — ${a.buildingName}` : ''} — ${Number(a.rentXaf).toLocaleString('fr-FR')} XAF/mois`,
      )
      .join('\n');
    return `${data.count} logement(s) vacant(s) :\n${list}`;
  }
  if (toolName === 'getFinancialSummary') {
    return `Synthèse financière :
• Encaissé ce mois : ${Number(data.collectedThisMonthXaf).toLocaleString('fr-FR')} XAF
• Potentiel mensuel : ${Number(data.potentialMonthlyRentXaf).toLocaleString('fr-FR')} XAF
• Impayés : ${data.latePayments} · En attente : ${data.pendingPayments}
• Occupation : ${data.occupancyRate} %`;
  }
  if (toolName === 'getExpiringContracts') {
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucun contrat n’expire dans les 30 prochains jours.';
    const list = items
      .map((l) => `• ${l.tenantName} — ${l.apartmentLabel} (fin : ${l.endDate})`)
      .join('\n');
    return `Contrats à échéance ≤ 30 j :\n${list}`;
  }
  if (toolName === 'getContracts' || toolName === 'proposeGenerateLeasePdf') {
    if (data.found && data.lease) {
      const l = data.lease as Record<string, unknown>;
      return `Bail trouvé : ${l.tenantName} — ${l.apartmentLabel} (${l.status}).
Confirmez la génération du PDF professionnel pour créer le document.`;
    }
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucun contrat trouvé.';
    const list = items
      .slice(0, 8)
      .map((l) => `• ${l.tenantName} — ${l.apartmentLabel} (${l.status}) · id ${l.id}`)
      .join('\n');
    return `Contrats (${data.count}) :\n${list}`;
  }
  if (toolName === 'proposeGeneratePaymentReceipt') {
    if (data.found && data.payment) {
      const p = data.payment as Record<string, unknown>;
      return `Paiement trouvé : ${p.tenantName} — ${p.apartmentLabel} (${p.period}, ${p.status}).
Confirmez pour générer le reçu PDF.`;
    }
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucun paiement enregistré pouvant recevoir un reçu.';
    const list = items
      .slice(0, 8)
      .map(
        (p) =>
          `• ${p.tenantName} — ${p.apartmentLabel} (${p.period}) · ${Number(p.amountPaidXaf).toLocaleString('fr-FR')} XAF · id ${p.id}`,
      )
      .join('\n');
    return `Paiements payés (${data.count}) — indiquez un id ou confirmez le plus récent :\n${list}`;
  }
  if (toolName === 'proposeGeneratePaymentNotice') {
    if (data.found && data.payment) {
      const p = data.payment as Record<string, unknown>;
      return `Loyer à rappeler : ${p.tenantName} — ${p.apartmentLabel} (${p.period}, ${p.status}).
Confirmez pour générer l’avis de paiement PDF.`;
    }
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucun loyer en attente ou en retard pour un avis.';
    const list = items
      .slice(0, 8)
      .map(
        (p) =>
          `• ${p.tenantName} — ${p.apartmentLabel} (${p.period}) · dû ${Number(p.amountDueXaf).toLocaleString('fr-FR')} XAF · id ${p.id}`,
      )
      .join('\n');
    return `Loyers à rappeler (${data.count}) :\n${list}`;
  }
  if (toolName === 'getTenants') {
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    if (!items.length) return 'Aucun locataire enregistré.';
    const list = items
      .slice(0, 12)
      .map((t) => `• ${t.name} — ${t.phone}${t.leasesCount ? ` · ${t.leasesCount} bail(s)` : ''}`)
      .join('\n');
    return `Locataires (${data.count}) :\n${list}`;
  }
  return JSON.stringify(result).slice(0, 1200);
}
