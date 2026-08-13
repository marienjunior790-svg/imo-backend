/**
 * Phase G — Compréhension documentaire (métadonnées ITC / Prisma).
 *
 * Réel : listage, résumé & faits depuis Document + bail + paiement (URLs Cloudinary).
 * NOT_SUPPORTED : OCR PDF complet, RAG / recherche sémantique, comparaison générique.
 * Comparaison : uniquement si deux leaseId fournis (faits structurés).
 */

import { inject, injectable } from 'tsyringe';
import { DocumentType, LeaseStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { decimalToNumber } from '../../shared/utils/response.util.js';
import { extractCuidPreferLabeled } from './ai.ids.js';

export type DocIntelSourceType =
  | 'LEASE_PDF'
  | 'PAYMENT_RECEIPT'
  | 'PAYMENT_NOTICE'
  | 'UPLOADED'
  | 'OTHER';

export type AnalyzableDocumentRef = {
  id: string;
  sourceType: DocIntelSourceType;
  title: string;
  sourceUrl: string | null;
  documentId: string | null;
  leaseId: string | null;
  paymentId: string | null;
  mimeType: string | null;
  createdAt: string | null;
  textExtraction: 'NOT_SUPPORTED' | 'METADATA_ONLY' | 'BUFFER_EXCERPT';
};

export type DocumentRefInput = {
  documentId?: string;
  leaseId?: string;
  paymentId?: string;
  kind?: string;
};

export type DocumentFacts = {
  sourceType: DocIntelSourceType;
  documentId: string | null;
  leaseId: string | null;
  paymentId: string | null;
  sourceUrl: string | null;
  title: string;
  parties: {
    tenantId: string | null;
    tenantName: string | null;
    tenantPhone: string | null;
    apartmentId: string | null;
    apartmentLabel: string | null;
    buildingName: string | null;
  };
  rent: {
    monthlyRentXaf: number | null;
    apartmentRentAmountXaf: number | null;
    currency: string | null;
    depositXaf: number | null;
  };
  dates: {
    startDate: string | null;
    endDate: string | null;
    signedAt: string | null;
    dueDate: string | null;
    paidAt: string | null;
    periodMonth: number | null;
    periodYear: number | null;
  };
  status: {
    leaseStatus: string | null;
    paymentStatus: string | null;
    apartmentStatus: string | null;
  };
  amounts: {
    amountDueXaf: number | null;
    amountPaidXaf: number | null;
  };
  textExtraction: 'NOT_SUPPORTED' | 'METADATA_ONLY' | 'BUFFER_EXCERPT';
  excerpt: string | null;
  dataSources: string[];
};

export type DocumentInconsistency = {
  code: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  fields: Record<string, string | number | null>;
};

function asMoney(value: unknown): number {
  return decimalToNumber(value as Parameters<typeof decimalToNumber>[0]);
}

export function extractCuidFromText(text: string): string | undefined {
  return extractCuidPreferLabeled(text);
}

function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function mapDocumentType(type: DocumentType, fileName: string): DocIntelSourceType {
  if (type === DocumentType.LEASE_CONTRACT) return 'LEASE_PDF';
  if (type === DocumentType.PAYMENT_RECEIPT) return 'PAYMENT_RECEIPT';
  const lower = fileName.toLowerCase();
  if (lower.startsWith('avis-') || lower.includes('avis')) return 'PAYMENT_NOTICE';
  if (type === DocumentType.OTHER || type === DocumentType.ID_DOCUMENT) return 'UPLOADED';
  return 'OTHER';
}

@injectable()
export class AiDocumentsIntelService {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  async listAnalyzableDocuments(organizationId: string): Promise<{
    count: number;
    items: AnalyzableDocumentRef[];
    textExtraction: 'NOT_SUPPORTED';
    note: string;
  }> {
    const [docs, leases, payments] = await Promise.all([
      this.prisma.document.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          type: true,
          fileName: true,
          mimeType: true,
          cloudinaryUrl: true,
          leaseId: true,
          paymentId: true,
          createdAt: true,
        },
      }),
      this.prisma.lease.findMany({
        where: { organizationId, contractPdfUrl: { not: null } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          contractPdfUrl: true,
          updatedAt: true,
          tenant: { select: { firstName: true, lastName: true } },
          apartment: { select: { label: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: { organizationId, receiptPdfUrl: { not: null } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          receiptPdfUrl: true,
          periodMonth: true,
          periodYear: true,
          leaseId: true,
          updatedAt: true,
          lease: {
            select: {
              tenant: { select: { firstName: true, lastName: true } },
              apartment: { select: { label: true } },
            },
          },
        },
      }),
    ]);

    const seenUrls = new Set<string>();
    const items: AnalyzableDocumentRef[] = [];

    for (const d of docs) {
      if (d.cloudinaryUrl) seenUrls.add(d.cloudinaryUrl);
      items.push({
        id: d.id,
        sourceType: mapDocumentType(d.type, d.fileName),
        title: d.fileName,
        sourceUrl: d.cloudinaryUrl,
        documentId: d.id,
        leaseId: d.leaseId,
        paymentId: d.paymentId,
        mimeType: d.mimeType,
        createdAt: d.createdAt.toISOString(),
        textExtraction: 'NOT_SUPPORTED',
      });
    }

    for (const l of leases) {
      const url = l.contractPdfUrl;
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      const tenantName = `${l.tenant.firstName} ${l.tenant.lastName}`.trim();
      items.push({
        id: `lease:${l.id}`,
        sourceType: 'LEASE_PDF',
        title: `Contrat — ${tenantName} / ${l.apartment.label}`,
        sourceUrl: url,
        documentId: null,
        leaseId: l.id,
        paymentId: null,
        mimeType: 'application/pdf',
        createdAt: l.updatedAt.toISOString(),
        textExtraction: 'NOT_SUPPORTED',
      });
    }

    for (const p of payments) {
      const url = p.receiptPdfUrl;
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      const tenantName = `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}`.trim();
      items.push({
        id: `payment:${p.id}`,
        sourceType: 'PAYMENT_RECEIPT',
        title: `Reçu ${p.periodMonth}/${p.periodYear} — ${tenantName} / ${p.lease.apartment.label}`,
        sourceUrl: url,
        documentId: null,
        leaseId: p.leaseId,
        paymentId: p.id,
        mimeType: 'application/pdf',
        createdAt: p.updatedAt.toISOString(),
        textExtraction: 'NOT_SUPPORTED',
      });
    }

    return {
      count: items.length,
      items,
      textExtraction: 'NOT_SUPPORTED',
      note:
        'Analyse basée sur les métadonnées ITC (Document / bail / paiement). Extraction OCR du PDF : NOT_SUPPORTED. RAG / recherche sémantique : NOT_SUPPORTED.',
    };
  }

  async summarizeDocument(
    organizationId: string,
    ref: DocumentRefInput,
  ): Promise<
    | { found: true; summary: string; facts: DocumentFacts; textExtraction: DocumentFacts['textExtraction'] }
    | { found: false; error: string; textExtraction: 'NOT_SUPPORTED' }
  > {
    const facts = await this.extractDocumentFacts(organizationId, ref);
    if (!facts.found) return facts;

    const f = facts.facts;
    const lines: string[] = [`Résumé documentaire (métadonnées ITC) — ${f.title}`];
    if (f.parties.tenantName) {
      lines.push(
        `• Locataire : ${f.parties.tenantName}${f.parties.tenantPhone ? ` (${f.parties.tenantPhone})` : ''}`,
      );
    }
    if (f.parties.apartmentLabel) {
      lines.push(
        `• Logement : ${f.parties.apartmentLabel}${
          f.parties.buildingName ? ` — ${f.parties.buildingName}` : ''
        }`,
      );
    }
    if (f.rent.monthlyRentXaf != null) {
      lines.push(
        `• Loyer bail : ${f.rent.monthlyRentXaf.toLocaleString('fr-FR')} ${f.rent.currency ?? 'XAF'}/mois`,
      );
    }
    if (f.dates.startDate || f.dates.endDate) {
      lines.push(`• Période bail : ${f.dates.startDate ?? '—'} → ${f.dates.endDate ?? '—'}`);
    }
    if (f.status.leaseStatus) lines.push(`• Statut bail : ${f.status.leaseStatus}`);
    if (f.dates.periodMonth && f.dates.periodYear) {
      lines.push(`• Période paiement : ${f.dates.periodMonth}/${f.dates.periodYear}`);
    }
    if (f.amounts.amountDueXaf != null) {
      lines.push(
        `• Montant dû : ${f.amounts.amountDueXaf.toLocaleString('fr-FR')} XAF` +
          (f.amounts.amountPaidXaf != null
            ? ` · payé ${f.amounts.amountPaidXaf.toLocaleString('fr-FR')} XAF`
            : ''),
      );
    }
    if (f.status.paymentStatus) lines.push(`• Statut paiement : ${f.status.paymentStatus}`);
    if (f.sourceUrl) lines.push(`• URL : ${f.sourceUrl}`);
    if (f.leaseId) lines.push(`• leaseId : ${f.leaseId}`);
    if (f.paymentId) lines.push(`• paymentId : ${f.paymentId}`);
    if (f.documentId) lines.push(`• documentId : ${f.documentId}`);
    lines.push(
      `• Extraction texte PDF : ${f.textExtraction === 'BUFFER_EXCERPT' ? 'extrait disponible' : 'NOT_SUPPORTED (métadonnées uniquement)'}`,
    );
    if (f.excerpt) lines.push(`• Extrait : ${f.excerpt.slice(0, 400)}`);

    return {
      found: true,
      summary: lines.join('\n'),
      facts: f,
      textExtraction: f.textExtraction,
    };
  }

  async extractDocumentFacts(
    organizationId: string,
    ref: DocumentRefInput,
  ): Promise<
    | { found: true; facts: DocumentFacts }
    | { found: false; error: string; textExtraction: 'NOT_SUPPORTED' }
  > {
    const documentId = typeof ref.documentId === 'string' ? ref.documentId.trim() : '';
    const leaseId = typeof ref.leaseId === 'string' ? ref.leaseId.trim() : '';
    const paymentId = typeof ref.paymentId === 'string' ? ref.paymentId.trim() : '';
    const kind = typeof ref.kind === 'string' ? ref.kind.trim().toUpperCase() : '';

    if (documentId) {
      const doc = await this.prisma.document.findFirst({
        where: { id: documentId, organizationId },
        include: {
          lease: {
            include: {
              tenant: true,
              apartment: { include: { building: true } },
            },
          },
          payment: {
            include: {
              lease: {
                include: {
                  tenant: true,
                  apartment: { include: { building: true } },
                },
              },
            },
          },
        },
      });
      if (!doc) {
        return {
          found: false,
          error: 'Document introuvable dans votre organisation.',
          textExtraction: 'NOT_SUPPORTED',
        };
      }
      return {
        found: true,
        facts: this.factsFromDocumentRow(doc),
      };
    }

    const wantsPayment =
      Boolean(paymentId) ||
      kind === 'PAYMENT_RECEIPT' ||
      kind === 'PAYMENT_NOTICE' ||
      kind === 'RECEIPT' ||
      kind === 'NOTICE';

    if (wantsPayment) {
      let pid = paymentId || '';
      if (!pid) {
        const recent = await this.prisma.payment.findFirst({
          where: {
            organizationId,
            OR: [{ receiptPdfUrl: { not: null } }, { documents: { some: {} } }],
          },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        });
        if (!recent) {
          return {
            found: false,
            error: 'Aucun paiement avec reçu / document analysable.',
            textExtraction: 'NOT_SUPPORTED',
          };
        }
        pid = recent.id;
      }
      const payment = await this.prisma.payment.findFirst({
        where: { id: pid, organizationId },
        include: {
          lease: {
            include: {
              tenant: true,
              apartment: { include: { building: true } },
            },
          },
          documents: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
      if (!payment) {
        return {
          found: false,
          error: 'Paiement introuvable dans votre organisation.',
          textExtraction: 'NOT_SUPPORTED',
        };
      }
      return { found: true, facts: this.factsFromPayment(payment) };
    }

    let resolvedLeaseId = leaseId;
    if (!resolvedLeaseId) {
      resolvedLeaseId =
        (
          await this.prisma.lease.findFirst({
            where: {
              organizationId,
              OR: [{ contractPdfUrl: { not: null } }, { documents: { some: {} } }],
            },
            orderBy: { updatedAt: 'desc' },
            select: { id: true },
          })
        )?.id ?? '';
    }

    if (!resolvedLeaseId) {
      // Fallback : dernier bail org (même sans PDF) pour faits dossier ITC
      resolvedLeaseId =
        (
          await this.prisma.lease.findFirst({
            where: { organizationId },
            orderBy: { updatedAt: 'desc' },
            select: { id: true },
          })
        )?.id ?? '';
    }

    if (!resolvedLeaseId) {
      return {
        found: false,
        error: 'Aucun contrat / document analysable. Indiquez documentId, leaseId ou paymentId.',
        textExtraction: 'NOT_SUPPORTED',
      };
    }

    const lease = await this.prisma.lease.findFirst({
      where: { id: resolvedLeaseId, organizationId },
      include: {
        tenant: true,
        apartment: { include: { building: true } },
        documents: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!lease) {
      return {
        found: false,
        error: 'Bail introuvable dans votre organisation.',
        textExtraction: 'NOT_SUPPORTED',
      };
    }
    return { found: true, facts: this.factsFromLease(lease) };
  }

  async answerDocumentQuestion(
    organizationId: string,
    question: string,
    ref: DocumentRefInput,
  ): Promise<{
    answered: boolean;
    answer: string;
    factsUsed: string[];
    textExtraction: DocumentFacts['textExtraction'] | 'NOT_SUPPORTED';
  }> {
    const extracted = await this.extractDocumentFacts(organizationId, ref);
    if (!extracted.found) {
      return {
        answered: false,
        answer: 'Je ne dispose pas de cette information dans le document / dossier ITC.',
        factsUsed: [],
        textExtraction: 'NOT_SUPPORTED',
      };
    }
    const f = extracted.facts;
    const q = question
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');

    const used: string[] = [];
    const reply = (text: string, keys: string[]) => ({
      answered: true,
      answer: text,
      factsUsed: keys,
      textExtraction: f.textExtraction,
    });

    if (q.includes('loyer') || q.includes('montant') || q.includes('rent')) {
      if (f.rent.monthlyRentXaf != null) {
        used.push('rent.monthlyRentXaf');
        return reply(
          `Loyer du bail : ${f.rent.monthlyRentXaf.toLocaleString('fr-FR')} ${f.rent.currency ?? 'XAF'}/mois.`,
          used,
        );
      }
      if (f.amounts.amountDueXaf != null) {
        used.push('amounts.amountDueXaf');
        return reply(
          `Montant dû (paiement) : ${f.amounts.amountDueXaf.toLocaleString('fr-FR')} XAF.`,
          used,
        );
      }
    }
    if (q.includes('locataire') || q.includes('tenant') || q.includes('qui')) {
      if (f.parties.tenantName) {
        used.push('parties.tenantName');
        return reply(`Locataire : ${f.parties.tenantName}.`, used);
      }
    }
    if (q.includes('logement') || q.includes('appart') || q.includes('adresse')) {
      if (f.parties.apartmentLabel) {
        used.push('parties.apartmentLabel');
        return reply(
          `Logement : ${f.parties.apartmentLabel}${
            f.parties.buildingName ? ` (${f.parties.buildingName})` : ''
          }.`,
          used,
        );
      }
    }
    if (q.includes('debut') || q.includes('commence') || q.includes('start')) {
      if (f.dates.startDate) {
        used.push('dates.startDate');
        return reply(`Date de début du bail : ${f.dates.startDate}.`, used);
      }
    }
    if (q.includes('fin') || q.includes('expire') || q.includes('echeance') || q.includes('end')) {
      if (f.dates.endDate) {
        used.push('dates.endDate');
        return reply(`Date de fin du bail : ${f.dates.endDate}.`, used);
      }
      if (f.dates.dueDate) {
        used.push('dates.dueDate');
        return reply(`Échéance paiement : ${f.dates.dueDate}.`, used);
      }
    }
    if (q.includes('statut') || q.includes('status') || q.includes('etat')) {
      if (f.status.leaseStatus) {
        used.push('status.leaseStatus');
        return reply(`Statut du bail : ${f.status.leaseStatus}.`, used);
      }
      if (f.status.paymentStatus) {
        used.push('status.paymentStatus');
        return reply(`Statut du paiement : ${f.status.paymentStatus}.`, used);
      }
    }
    if (q.includes('url') || q.includes('lien') || q.includes('pdf')) {
      if (f.sourceUrl) {
        used.push('sourceUrl');
        return reply(`URL du document : ${f.sourceUrl}.`, used);
      }
    }
    if (q.includes('depot') || q.includes('caution')) {
      if (f.rent.depositXaf != null) {
        used.push('rent.depositXaf');
        return reply(
          `Dépôt / caution : ${f.rent.depositXaf.toLocaleString('fr-FR')} ${f.rent.currency ?? 'XAF'}.`,
          used,
        );
      }
    }
    if (q.includes('periode') && f.dates.periodMonth && f.dates.periodYear) {
      used.push('dates.periodMonth', 'dates.periodYear');
      return reply(`Période : ${f.dates.periodMonth}/${f.dates.periodYear}.`, used);
    }
    if (q.includes('paye') || q.includes('verse')) {
      if (f.amounts.amountPaidXaf != null) {
        used.push('amounts.amountPaidXaf');
        return reply(
          `Montant payé : ${f.amounts.amountPaidXaf.toLocaleString('fr-FR')} XAF.`,
          used,
        );
      }
    }

    return {
      answered: false,
      answer: 'Je ne dispose pas de cette information dans le document / dossier ITC.',
      factsUsed: [],
      textExtraction: f.textExtraction,
    };
  }

  /**
   * Comparaison documentaire : réelle uniquement si deux leaseId ;
   * sinon NOT_SUPPORTED clairement.
   */
  async compareDocuments(
    organizationId: string,
    refs: { leaseIdA?: string; leaseIdB?: string; documentIdA?: string; documentIdB?: string },
  ): Promise<
    | {
        supported: true;
        leaseIdA: string;
        leaseIdB: string;
        differences: Array<{ field: string; a: string | number | null; b: string | number | null }>;
        identical: boolean;
      }
    | { supported: false; message: string; code: 'NOT_SUPPORTED' }
  > {
    const a = typeof refs.leaseIdA === 'string' ? refs.leaseIdA.trim() : '';
    const b = typeof refs.leaseIdB === 'string' ? refs.leaseIdB.trim() : '';
    if (!a || !b || a === b) {
      return {
        supported: false,
        code: 'NOT_SUPPORTED',
        message: 'Comparaison documentaire non encore disponible.',
      };
    }

    const [fa, fb] = await Promise.all([
      this.extractDocumentFacts(organizationId, { leaseId: a }),
      this.extractDocumentFacts(organizationId, { leaseId: b }),
    ]);
    if (!fa.found || !fb.found) {
      return {
        supported: false,
        code: 'NOT_SUPPORTED',
        message: 'Comparaison documentaire non encore disponible.',
      };
    }

    const pairs: Array<[string, string | number | null, string | number | null]> = [
      ['tenantName', fa.facts.parties.tenantName, fb.facts.parties.tenantName],
      ['apartmentLabel', fa.facts.parties.apartmentLabel, fb.facts.parties.apartmentLabel],
      ['monthlyRentXaf', fa.facts.rent.monthlyRentXaf, fb.facts.rent.monthlyRentXaf],
      ['startDate', fa.facts.dates.startDate, fb.facts.dates.startDate],
      ['endDate', fa.facts.dates.endDate, fb.facts.dates.endDate],
      ['leaseStatus', fa.facts.status.leaseStatus, fb.facts.status.leaseStatus],
    ];
    const differences = pairs
      .filter(([, va, vb]) => String(va ?? '') !== String(vb ?? ''))
      .map(([field, va, vb]) => ({ field, a: va, b: vb }));

    return {
      supported: true,
      leaseIdA: a,
      leaseIdB: b,
      differences,
      identical: differences.length === 0,
    };
  }

  async detectInconsistencies(
    organizationId: string,
    leaseId: string,
  ): Promise<
    | {
        found: true;
        leaseId: string;
        inconsistencies: DocumentInconsistency[];
        count: number;
      }
    | { found: false; error: string }
  > {
    const lease = await this.prisma.lease.findFirst({
      where: { id: leaseId, organizationId },
      include: {
        tenant: true,
        apartment: true,
      },
    });
    if (!lease) return { found: false, error: 'Bail introuvable dans votre organisation.' };

    const inconsistencies: DocumentInconsistency[] = [];
    const leaseRent = asMoney(lease.monthlyRent);
    const aptRent = asMoney(lease.apartment.rentAmount);

    if (leaseRent !== aptRent) {
      inconsistencies.push({
        code: 'RENT_MISMATCH',
        severity: 'high',
        message: `Loyer du bail (${leaseRent.toLocaleString('fr-FR')} XAF) différent du loyer logement (${aptRent.toLocaleString('fr-FR')} XAF).`,
        fields: { leaseMonthlyRentXaf: leaseRent, apartmentRentAmountXaf: aptRent },
      });
    }

    const otherActive = await this.prisma.lease.findFirst({
      where: {
        organizationId,
        apartmentId: lease.apartmentId,
        status: LeaseStatus.ACTIVE,
        id: { not: lease.id },
      },
      include: { tenant: true },
    });
    if (otherActive && otherActive.tenantId !== lease.tenantId) {
      inconsistencies.push({
        code: 'TENANT_MISMATCH',
        severity: 'high',
        message: `Autre bail ACTIVE sur le même logement avec un locataire différent (${otherActive.tenant.firstName} ${otherActive.tenant.lastName}).`,
        fields: {
          leaseTenantId: lease.tenantId,
          otherLeaseId: otherActive.id,
          otherTenantId: otherActive.tenantId,
        },
      });
    }

    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const endUtc = Date.UTC(
      lease.endDate.getUTCFullYear(),
      lease.endDate.getUTCMonth(),
      lease.endDate.getUTCDate(),
    );
    const startUtc = Date.UTC(
      lease.startDate.getUTCFullYear(),
      lease.startDate.getUTCMonth(),
      lease.startDate.getUTCDate(),
    );

    if (lease.status === LeaseStatus.ACTIVE && endUtc < todayUtc) {
      inconsistencies.push({
        code: 'STATUS_VS_END_DATE',
        severity: 'medium',
        message: `Bail ACTIVE alors que la date de fin (${isoDate(lease.endDate)}) est passée.`,
        fields: { status: lease.status, endDate: isoDate(lease.endDate) },
      });
    }
    if (lease.status === LeaseStatus.EXPIRED && endUtc >= todayUtc) {
      inconsistencies.push({
        code: 'STATUS_VS_END_DATE',
        severity: 'low',
        message: `Bail EXPIRED alors que la date de fin (${isoDate(lease.endDate)}) n’est pas encore atteinte.`,
        fields: { status: lease.status, endDate: isoDate(lease.endDate) },
      });
    }
    if (lease.status === LeaseStatus.DRAFT && lease.signedAt) {
      inconsistencies.push({
        code: 'STATUS_VS_SIGNED',
        severity: 'medium',
        message: 'Bail DRAFT alors qu’une date de signature est enregistrée.',
        fields: { status: lease.status, signedAt: lease.signedAt.toISOString() },
      });
    }
    if (endUtc < startUtc) {
      inconsistencies.push({
        code: 'DATE_RANGE_INVALID',
        severity: 'high',
        message: 'Date de fin antérieure à la date de début.',
        fields: { startDate: isoDate(lease.startDate), endDate: isoDate(lease.endDate) },
      });
    }

    if (
      lease.status === LeaseStatus.ACTIVE &&
      lease.apartment.status === 'AVAILABLE'
    ) {
      inconsistencies.push({
        code: 'APARTMENT_STATUS_VS_LEASE',
        severity: 'medium',
        message: 'Bail ACTIVE alors que le logement est marqué AVAILABLE (vacant).',
        fields: {
          leaseStatus: lease.status,
          apartmentStatus: lease.apartment.status,
        },
      });
    }

    return {
      found: true,
      leaseId: lease.id,
      inconsistencies,
      count: inconsistencies.length,
    };
  }

  private factsFromLease(lease: {
    id: string;
    contractPdfUrl: string | null;
    monthlyRent: unknown;
    depositAmount: unknown;
    currency: string;
    status: LeaseStatus;
    startDate: Date;
    endDate: Date;
    signedAt: Date | null;
    terms: string | null;
    tenantId: string;
    apartmentId: string;
    tenant: { firstName: string; lastName: string; phone: string | null };
    apartment: {
      label: string;
      rentAmount: unknown;
      status: string;
      building: { name: string } | null;
    };
    documents?: Array<{ id: string; cloudinaryUrl: string; fileName: string }>;
  }): DocumentFacts {
    const doc = lease.documents?.[0];
    const excerpt =
      typeof lease.terms === 'string' && lease.terms.trim()
        ? lease.terms.trim().slice(0, 500)
        : null;
    return {
      sourceType: 'LEASE_PDF',
      documentId: doc?.id ?? null,
      leaseId: lease.id,
      paymentId: null,
      sourceUrl: lease.contractPdfUrl ?? doc?.cloudinaryUrl ?? null,
      title: doc?.fileName ?? `Contrat — ${lease.tenant.firstName} ${lease.tenant.lastName}`,
      parties: {
        tenantId: lease.tenantId,
        tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim(),
        tenantPhone: lease.tenant.phone,
        apartmentId: lease.apartmentId,
        apartmentLabel: lease.apartment.label,
        buildingName: lease.apartment.building?.name ?? null,
      },
      rent: {
        monthlyRentXaf: asMoney(lease.monthlyRent),
        apartmentRentAmountXaf: asMoney(lease.apartment.rentAmount),
        currency: lease.currency,
        depositXaf: lease.depositAmount != null ? asMoney(lease.depositAmount) : null,
      },
      dates: {
        startDate: isoDate(lease.startDate),
        endDate: isoDate(lease.endDate),
        signedAt: lease.signedAt ? lease.signedAt.toISOString() : null,
        dueDate: null,
        paidAt: null,
        periodMonth: null,
        periodYear: null,
      },
      status: {
        leaseStatus: lease.status,
        paymentStatus: null,
        apartmentStatus: lease.apartment.status,
      },
      amounts: { amountDueXaf: null, amountPaidXaf: null },
      textExtraction: excerpt ? 'BUFFER_EXCERPT' : 'METADATA_ONLY',
      excerpt,
      dataSources: ['leases', ...(doc ? ['documents'] : [])],
    };
  }

  private factsFromPayment(payment: {
    id: string;
    leaseId: string;
    receiptPdfUrl: string | null;
    amount: unknown;
    amountPaid: unknown;
    status: string;
    dueDate: Date;
    paidAt: Date | null;
    periodMonth: number;
    periodYear: number;
    currency: string;
    lease: {
      id: string;
      monthlyRent: unknown;
      depositAmount: unknown;
      currency: string;
      status: LeaseStatus;
      startDate: Date;
      endDate: Date;
      signedAt: Date | null;
      tenantId: string;
      apartmentId: string;
      contractPdfUrl: string | null;
      tenant: { firstName: string; lastName: string; phone: string | null };
      apartment: {
        label: string;
        rentAmount: unknown;
        status: string;
        building: { name: string } | null;
      };
    };
    documents?: Array<{ id: string; cloudinaryUrl: string; fileName: string; type: DocumentType }>;
  }): DocumentFacts {
    const doc = payment.documents?.[0];
    const sourceType = doc
      ? mapDocumentType(doc.type, doc.fileName)
      : ('PAYMENT_RECEIPT' as const);
    return {
      sourceType,
      documentId: doc?.id ?? null,
      leaseId: payment.leaseId,
      paymentId: payment.id,
      sourceUrl: payment.receiptPdfUrl ?? doc?.cloudinaryUrl ?? null,
      title:
        doc?.fileName ??
        `Reçu ${payment.periodMonth}/${payment.periodYear} — ${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`,
      parties: {
        tenantId: payment.lease.tenantId,
        tenantName: `${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`.trim(),
        tenantPhone: payment.lease.tenant.phone,
        apartmentId: payment.lease.apartmentId,
        apartmentLabel: payment.lease.apartment.label,
        buildingName: payment.lease.apartment.building?.name ?? null,
      },
      rent: {
        monthlyRentXaf: asMoney(payment.lease.monthlyRent),
        apartmentRentAmountXaf: asMoney(payment.lease.apartment.rentAmount),
        currency: payment.currency || payment.lease.currency,
        depositXaf:
          payment.lease.depositAmount != null
            ? asMoney(payment.lease.depositAmount)
            : null,
      },
      dates: {
        startDate: isoDate(payment.lease.startDate),
        endDate: isoDate(payment.lease.endDate),
        signedAt: payment.lease.signedAt ? payment.lease.signedAt.toISOString() : null,
        dueDate: isoDate(payment.dueDate),
        paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
        periodMonth: payment.periodMonth,
        periodYear: payment.periodYear,
      },
      status: {
        leaseStatus: payment.lease.status,
        paymentStatus: payment.status,
        apartmentStatus: payment.lease.apartment.status,
      },
      amounts: {
        amountDueXaf: asMoney(payment.amount),
        amountPaidXaf: asMoney(payment.amountPaid),
      },
      textExtraction: 'METADATA_ONLY',
      excerpt: null,
      dataSources: ['payments', 'leases', ...(doc ? ['documents'] : [])],
    };
  }

  private factsFromDocumentRow(doc: {
    id: string;
    type: DocumentType;
    fileName: string;
    cloudinaryUrl: string;
    leaseId: string | null;
    paymentId: string | null;
    lease: {
      id: string;
      monthlyRent: unknown;
      depositAmount: unknown;
      currency: string;
      status: LeaseStatus;
      startDate: Date;
      endDate: Date;
      signedAt: Date | null;
      terms: string | null;
      tenantId: string;
      apartmentId: string;
      contractPdfUrl: string | null;
      tenant: { firstName: string; lastName: string; phone: string | null };
      apartment: {
        label: string;
        rentAmount: unknown;
        status: string;
        building: { name: string } | null;
      };
    } | null;
    payment: {
      id: string;
      leaseId: string;
      receiptPdfUrl: string | null;
      amount: unknown;
      amountPaid: unknown;
      status: string;
      dueDate: Date;
      paidAt: Date | null;
      periodMonth: number;
      periodYear: number;
      currency: string;
      lease: {
        id: string;
        monthlyRent: unknown;
        depositAmount: unknown;
        currency: string;
        status: LeaseStatus;
        startDate: Date;
        endDate: Date;
        signedAt: Date | null;
        tenantId: string;
        apartmentId: string;
        contractPdfUrl: string | null;
        tenant: { firstName: string; lastName: string; phone: string | null };
        apartment: {
          label: string;
          rentAmount: unknown;
          status: string;
          building: { name: string } | null;
        };
      };
    } | null;
  }): DocumentFacts {
    if (doc.payment) {
      const base = this.factsFromPayment({
        ...doc.payment,
        documents: [
          {
            id: doc.id,
            cloudinaryUrl: doc.cloudinaryUrl,
            fileName: doc.fileName,
            type: doc.type,
          },
        ],
      });
      return { ...base, documentId: doc.id, sourceUrl: doc.cloudinaryUrl };
    }
    if (doc.lease) {
      const base = this.factsFromLease({
        ...doc.lease,
        documents: [{ id: doc.id, cloudinaryUrl: doc.cloudinaryUrl, fileName: doc.fileName }],
      });
      return {
        ...base,
        documentId: doc.id,
        sourceUrl: doc.cloudinaryUrl,
        sourceType: mapDocumentType(doc.type, doc.fileName),
        title: doc.fileName,
      };
    }
    return {
      sourceType: mapDocumentType(doc.type, doc.fileName),
      documentId: doc.id,
      leaseId: doc.leaseId,
      paymentId: doc.paymentId,
      sourceUrl: doc.cloudinaryUrl,
      title: doc.fileName,
      parties: {
        tenantId: null,
        tenantName: null,
        tenantPhone: null,
        apartmentId: null,
        apartmentLabel: null,
        buildingName: null,
      },
      rent: {
        monthlyRentXaf: null,
        apartmentRentAmountXaf: null,
        currency: null,
        depositXaf: null,
      },
      dates: {
        startDate: null,
        endDate: null,
        signedAt: null,
        dueDate: null,
        paidAt: null,
        periodMonth: null,
        periodYear: null,
      },
      status: { leaseStatus: null, paymentStatus: null, apartmentStatus: null },
      amounts: { amountDueXaf: null, amountPaidXaf: null },
      textExtraction: 'METADATA_ONLY',
      excerpt: null,
      dataSources: ['documents'],
    };
  }
}
