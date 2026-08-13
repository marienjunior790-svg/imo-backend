import {
  buildPdfUploadPipelineReply,
  computeLeaseDurationMonths,
  detectDocumentAskIntent,
  extractNameTokens,
  formatDocumentFactsDigest,
  pickBestLeaseMatch,
  questionForDocumentAsk,
  scoreLeasesByTenantName,
} from '../../src/modules/ai/ai.document-pipeline.js';
import type { DocumentFacts } from '../../src/modules/ai/ai.documents-intel.service.js';
import { resolveKnowledgeClarification } from '../../src/modules/ai/ai.knowledge.js';

const sampleFacts = (over: Partial<DocumentFacts> = {}): DocumentFacts => ({
  sourceType: 'LEASE_PDF',
  documentId: null,
  leaseId: 'cleasetest000000000001',
  paymentId: null,
  sourceUrl: 'https://res.cloudinary.com/demo/contrat.pdf',
  title: 'Contrat',
  parties: {
    tenantId: 't1',
    tenantName: 'Fortune Libolo',
    tenantPhone: null,
    apartmentId: 'a1',
    apartmentLabel: 'Appt 3B',
    buildingName: 'Nord',
  },
  rent: {
    monthlyRentXaf: 120_000,
    apartmentRentAmountXaf: 120_000,
    currency: 'XAF',
    depositXaf: 240_000,
  },
  dates: {
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    signedAt: null,
    dueDate: null,
    paidAt: null,
    periodMonth: null,
    periodYear: null,
  },
  status: { leaseStatus: 'ACTIVE', paymentStatus: null, apartmentStatus: 'OCCUPIED' },
  amounts: { amountDueXaf: null, amountPaidXaf: null },
  textExtraction: 'METADATA_ONLY',
  excerpt: null,
  dataSources: ['lease'],
  ...over,
});

describe('ai.document-pipeline (Phase J4)', () => {
  it('détecte loyer / durée / anomalies comme faits structurés', () => {
    expect(detectDocumentAskIntent('quel est le loyer du bail de Fortune').kind).toBe('RENT');
    expect(detectDocumentAskIntent('durée du contrat de Jean').kind).toBe('DURATION');
    expect(detectDocumentAskIntent('vérifie les anomalies du bail').kind).toBe('ANOMALIES');
    expect(detectDocumentAskIntent('résumé du contrat PDF').kind).toBe('SUMMARY');
  });

  it('marque OCR pur sans faits comme wantsOcrOnly', () => {
    const r = detectDocumentAskIntent('lis le texte OCR de ce PDF contrat');
    expect(r.wantsOcrOnly).toBe(true);
    expect(r.wantsStructuredFacts).toBe(false);
  });

  it('knowledge laisse passer une question loyer malgré PDF', () => {
    expect(resolveKnowledgeClarification('quel est le loyer dans le PDF du contrat de Fortune')).toBeNull();
  });

  it('knowledge garde NOT_SUPPORTED pour clause OCR pure', () => {
    const reply = resolveKnowledgeClarification(
      'Trouve la clause concernant le préavis dans ce contrat PDF',
    );
    expect(reply).toBeTruthy();
    expect(reply!).toMatch(/NOT_SUPPORTED|OCR/i);
  });

  it('score un locataire unique par nom', () => {
    const scored = scoreLeasesByTenantName(
      [
        {
          id: 'l1',
          status: 'ACTIVE',
          tenantFirstName: 'Fortune',
          tenantLastName: 'Libolo',
          apartmentLabel: '3B',
        },
        {
          id: 'l2',
          status: 'ACTIVE',
          tenantFirstName: 'Jean',
          tenantLastName: 'Mbemba',
          apartmentLabel: '1A',
        },
      ],
      'loyer du bail de fortune libolo',
    );
    const pick = pickBestLeaseMatch(scored);
    expect(pick?.lease.id).toBe('l1');
    expect(pick?.ambiguous).toHaveLength(0);
  });

  it('extrait des tokens de nom hors stop-words', () => {
    const tokens = extractNameTokens('quel est le loyer du bail de fortune');
    expect(tokens).toContain('fortune');
    expect(tokens).not.toContain('loyer');
  });

  it('calcule la durée en mois', () => {
    expect(computeLeaseDurationMonths('2025-01-01', '2025-12-31')).toBe(11);
    expect(computeLeaseDurationMonths(null, '2025-12-31')).toBeNull();
  });

  it('formate un digest faits sans inventer', () => {
    const digest = formatDocumentFactsDigest(sampleFacts());
    expect(digest).toMatch(/Fortune Libolo/);
    expect(digest).toMatch(/120/);
    expect(digest).toMatch(/NOT_SUPPORTED|métadonnées/i);
  });

  it('bridge PDF rappelle OCR NOT_SUPPORTED + faits', () => {
    const reply = buildPdfUploadPipelineReply({ facts: sampleFacts(), userPrompt: 'contrat fortune' });
    expect(reply).toMatch(/NOT_SUPPORTED/);
    expect(reply).toMatch(/Fortune Libolo/);
    expect(reply).toMatch(/Faits ITC/i);
  });

  it('questionForDocumentAsk mappe durée', () => {
    expect(questionForDocumentAsk('DURATION', 'durée ?')).toMatch(/durée/i);
  });
});
