import {
  AiDocumentsIntelService,
  extractCuidFromText,
} from '../../src/modules/ai/ai.documents-intel.service.js';
import { AiToolsService, formatToolResultForLocalReply } from '../../src/modules/ai/ai.tools.js';

function mockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    document: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      ...(overrides.document as object),
    },
    lease: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      ...(overrides.lease as object),
    },
    payment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      ...(overrides.payment as object),
    },
  };
}

const baseLease = {
  id: 'cleasetest000000000001',
  organizationId: 'org-1',
  tenantId: 'ctenant00000000000001',
  apartmentId: 'capt00000000000000001',
  monthlyRent: 150_000,
  depositAmount: 300_000,
  currency: 'XAF',
  status: 'ACTIVE',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2026-12-31'),
  signedAt: null,
  terms: 'Clause test : paiement avant le 5.',
  contractPdfUrl: 'https://res.cloudinary.com/demo/contrat.pdf',
  tenant: { firstName: 'Jean', lastName: 'Mbemba', phone: '+242061234567' },
  apartment: {
    label: 'Appt 2A',
    rentAmount: 150_000,
    status: 'OCCUPIED',
    building: { name: 'Résidence Soleil' },
  },
  documents: [],
};

describe('extractCuidFromText', () => {
  it('extrait un cuid', () => {
    expect(extractCuidFromText('voir leaseId cleasetest000000000001 svp')).toBe(
      'cleasetest000000000001',
    );
  });
});

describe('AiDocumentsIntelService (mocked Prisma)', () => {
  it('extractDocumentFacts depuis bail — jamais inventé', async () => {
    const prisma = mockPrisma({
      lease: {
        findFirst: jest.fn().mockResolvedValue(baseLease),
      },
    });
    const svc = new AiDocumentsIntelService(prisma as never);
    const res = await svc.extractDocumentFacts('org-1', { leaseId: baseLease.id });
    expect(res.found).toBe(true);
    if (!res.found) return;
    expect(res.facts.parties.tenantName).toBe('Jean Mbemba');
    expect(res.facts.rent.monthlyRentXaf).toBe(150_000);
    expect(res.facts.sourceUrl).toContain('cloudinary');
    expect(res.facts.excerpt).toMatch(/Clause test/);
    expect(res.facts.textExtraction).toBe('BUFFER_EXCERPT');
  });

  it('detectInconsistencies — RENT_MISMATCH réel', async () => {
    const prisma = mockPrisma({
      lease: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            ...baseLease,
            monthlyRent: 200_000,
            apartment: { ...baseLease.apartment, rentAmount: 150_000 },
          })
          .mockResolvedValueOnce(null), // otherActive
      },
    });
    const svc = new AiDocumentsIntelService(prisma as never);
    const res = await svc.detectInconsistencies('org-1', baseLease.id);
    expect(res.found).toBe(true);
    if (!res.found) return;
    expect(res.inconsistencies.some((i) => i.code === 'RENT_MISMATCH')).toBe(true);
  });

  it('detectInconsistencies — STATUS_VS_END_DATE si ACTIVE expiré', async () => {
    const prisma = mockPrisma({
      lease: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            ...baseLease,
            endDate: new Date('2020-01-01'),
            status: 'ACTIVE',
          })
          .mockResolvedValueOnce(null),
      },
    });
    const svc = new AiDocumentsIntelService(prisma as never);
    const res = await svc.detectInconsistencies('org-1', baseLease.id);
    expect(res.found).toBe(true);
    if (!res.found) return;
    expect(res.inconsistencies.some((i) => i.code === 'STATUS_VS_END_DATE')).toBe(true);
  });

  it('compareDocuments sans deux leaseId → NOT_SUPPORTED', async () => {
    const svc = new AiDocumentsIntelService(mockPrisma() as never);
    const res = await svc.compareDocuments('org-1', {});
    expect(res.supported).toBe(false);
    if (res.supported) return;
    expect(res.code).toBe('NOT_SUPPORTED');
    expect(res.message).toMatch(/non encore disponible/i);
  });

  it('compareDocuments avec deux baux → diffs structurés', async () => {
    const leaseB = {
      ...baseLease,
      id: 'cleasetest000000000002',
      monthlyRent: 180_000,
      tenant: { firstName: 'Marie', lastName: 'Okoko', phone: null },
      apartment: {
        label: 'Appt 3B',
        rentAmount: 180_000,
        status: 'OCCUPIED',
        building: null,
      },
    };
    const prisma = mockPrisma({
      lease: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(baseLease)
          .mockResolvedValueOnce(leaseB),
      },
    });
    const svc = new AiDocumentsIntelService(prisma as never);
    const res = await svc.compareDocuments('org-1', {
      leaseIdA: baseLease.id,
      leaseIdB: leaseB.id,
    });
    expect(res.supported).toBe(true);
    if (!res.supported) return;
    expect(res.differences.some((d) => d.field === 'monthlyRentXaf')).toBe(true);
    expect(res.identical).toBe(false);
  });

  it('answerDocumentQuestion refuse si hors faits', async () => {
    const prisma = mockPrisma({
      lease: { findFirst: jest.fn().mockResolvedValue(baseLease) },
    });
    const svc = new AiDocumentsIntelService(prisma as never);
    const res = await svc.answerDocumentQuestion('org-1', 'Quelle est la couleur des murs ?', {
      leaseId: baseLease.id,
    });
    expect(res.answered).toBe(false);
    expect(res.answer).toMatch(/Je ne dispose pas de cette information/);
  });

  it('answerDocumentQuestion répond loyer depuis faits', async () => {
    const prisma = mockPrisma({
      lease: { findFirst: jest.fn().mockResolvedValue(baseLease) },
    });
    const svc = new AiDocumentsIntelService(prisma as never);
    const res = await svc.answerDocumentQuestion('org-1', 'Quel est le loyer dans le contrat ?', {
      leaseId: baseLease.id,
    });
    expect(res.answered).toBe(true);
    expect(res.answer).toMatch(/150/);
  });

  it('listAnalyzableDocuments marque textExtraction NOT_SUPPORTED', async () => {
    const prisma = mockPrisma({
      document: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cdoc000000000000000001',
            type: 'LEASE_CONTRACT',
            fileName: 'contrat-x.pdf',
            mimeType: 'application/pdf',
            cloudinaryUrl: 'https://res.cloudinary.com/demo/x.pdf',
            leaseId: baseLease.id,
            paymentId: null,
            createdAt: new Date(),
          },
        ]),
      },
    });
    const svc = new AiDocumentsIntelService(prisma as never);
    const res = await svc.listAnalyzableDocuments('org-1');
    expect(res.textExtraction).toBe('NOT_SUPPORTED');
    expect(res.count).toBe(1);
    expect(res.items[0].textExtraction).toBe('NOT_SUPPORTED');
  });
});

describe('Phase G intents + formatters', () => {
  const tools = Object.create(AiToolsService.prototype) as AiToolsService;

  it('résume mon contrat → summarizeDocument', () => {
    const intents = tools.resolveLocalToolIntents('résume mon contrat');
    expect(intents.map((i) => i.name)).toContain('summarizeDocument');
    expect(intents.map((i) => i.name)).not.toContain('getDashboardSummary');
    expect(intents.map((i) => i.name)).not.toContain('analyzePortfolio');
  });

  it('extraire le document → extractDocumentFacts', () => {
    const intents = tools.resolveLocalToolIntents('extraire les infos du contrat');
    expect(intents.map((i) => i.name)).toContain('extractDocumentFacts');
  });

  it('Extrais (impératif) + bail → extractDocumentFacts', () => {
    const intents = tools.resolveLocalToolIntents(
      'Extrais les faits cles du document / bail leaseId=cmsova6ru00ubwh6klids1jw7',
    );
    expect(intents.map((i) => i.name)).toContain('extractDocumentFacts');
  });

  it('incohérence / vérifie le contrat → checkLeaseDocumentConsistency', () => {
    expect(
      tools.resolveLocalToolIntents('y a-t-il une incohérence sur le contrat ?').map((i) => i.name),
    ).toContain('checkLeaseDocumentConsistency');
    expect(
      tools.resolveLocalToolIntents('vérifie le contrat').map((i) => i.name),
    ).toContain('checkLeaseDocumentConsistency');
  });

  it('compare contrats → compareDocuments', () => {
    const intents = tools.resolveLocalToolIntents('compare ces deux contrats');
    expect(intents.map((i) => i.name)).toContain('compareDocuments');
  });

  it('question dans le contrat → askAboutDocument + cuid', () => {
    const intents = tools.resolveLocalToolIntents(
      'Quel est le loyer dans le contrat cleasetest000000000001 ?',
    );
    const ask = intents.find((i) => i.name === 'askAboutDocument');
    expect(ask).toBeDefined();
    expect(ask?.args?.leaseId).toBe('cleasetest000000000001');
  });

  it('liste des documents → listDocumentsForAi', () => {
    expect(tools.resolveLocalToolIntents('liste des documents').map((i) => i.name)).toContain(
      'listDocumentsForAi',
    );
  });

  it('formatter compareDocuments NOT_SUPPORTED', () => {
    const text = formatToolResultForLocalReply('compareDocuments', {
      supported: false,
      code: 'NOT_SUPPORTED',
      message: 'Comparaison documentaire non encore disponible.',
    });
    expect(text).toMatch(/NOT_SUPPORTED/);
    expect(text).not.toMatch(/OCR réussi|RAG/i);
  });

  it('formatter summarizeDocument cite NOT_SUPPORTED extraction', () => {
    const text = formatToolResultForLocalReply('summarizeDocument', {
      found: true,
      summary:
        'Résumé…\n• Extraction texte PDF : NOT_SUPPORTED (métadonnées uniquement)',
      textExtraction: 'METADATA_ONLY',
    });
    expect(text).toMatch(/NOT_SUPPORTED/);
  });
});
