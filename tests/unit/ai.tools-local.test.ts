import {
  formatToolResultForLocalReply,
  AiToolsService,
} from '../../src/modules/ai/ai.tools.js';
import {
  _resetPendingActionsForTests,
  cancelPendingAction,
  createPendingAction,
  consumePendingAction,
  getPendingAction,
} from '../../src/modules/ai/ai.pending-actions.js';
import { listDocumentCapabilities } from '../../src/modules/ai/ai.documents.js';

jest.mock('../../src/config/env.js', () => {
  const actual = jest.requireActual('../../src/config/env.js') as Record<string, unknown>;
  return {
    ...actual,
    isWhatsAppConfigured: true,
    env: {
      ...(actual.env as Record<string, unknown>),
      WHATSAPP_DEFAULT_COUNTRY_CODE: '242',
    },
  };
});

describe('AiToolsService.resolveLocalToolIntents', () => {
  const tools = Object.create(AiToolsService.prototype) as AiToolsService;

  it('détecte les impayés', () => {
    const intents = tools.resolveLocalToolIntents('Quels locataires n’ont pas encore payé ?');
    expect(intents.map((i) => i.name)).toContain('getOutstandingPayments');
  });

  it('détecte le patrimoine', () => {
    const intents = tools.resolveLocalToolIntents('Résumer mon patrimoine');
    expect(intents.map((i) => i.name)).toContain('getDashboardSummary');
  });

  it('détecte la génération de contrat', () => {
    const intents = tools.resolveLocalToolIntents('Génère un contrat de location');
    expect(intents.map((i) => i.name)).toContain('proposeGenerateLeasePdf');
  });

  it('détecte la création de bail (sans PDF)', () => {
    const intents = tools.resolveLocalToolIntents('Crée un bail pour ce locataire');
    expect(intents.map((i) => i.name)).toContain('proposeCreateLease');
    expect(intents.map((i) => i.name)).not.toContain('proposeGenerateLeasePdf');
  });

  it('détecte envoi de message locataire (pas avis PDF)', () => {
    const intents = tools.resolveLocalToolIntents('Envoie un message au locataire');
    expect(intents.map((i) => i.name)).toContain('proposeSendTenantMessage');
    expect(intents.map((i) => i.name)).not.toContain('proposeGeneratePaymentNotice');
    expect(intents.map((i) => i.name)).not.toContain('proposeSendWhatsAppMessage');
  });

  it('détecte rappel message sans avis de loyer', () => {
    const intents = tools.resolveLocalToolIntents('Envoie un rappel à Jean');
    expect(intents.map((i) => i.name)).toContain('proposeSendTenantMessage');
  });

  it('préfère WhatsApp pour « envoie un rappel de loyer » si configuré', () => {
    const intents = tools.resolveLocalToolIntents('Envoie un rappel de loyer au locataire');
    expect(intents.map((i) => i.name)).toContain('proposeSendWhatsAppMessage');
    expect(intents.map((i) => i.name)).not.toContain('proposeGeneratePaymentNotice');
    expect(intents.map((i) => i.name)).not.toContain('proposeSendTenantMessage');
  });

  it('détecte WhatsApp explicite', () => {
    const intents = tools.resolveLocalToolIntents('Envoie un whatsapp au locataire Marie : Bonjour');
    expect(intents.map((i) => i.name)).toContain('proposeSendWhatsAppMessage');
  });

  it('détecte média WhatsApp comme non supporté', () => {
    const intents = tools.resolveLocalToolIntents('Envoie une image whatsapp au locataire');
    expect(intents.map((i) => i.name)).toContain('proposeSendWhatsAppMedia');
  });

  it('détecte la génération de reçu', () => {
    const intents = tools.resolveLocalToolIntents('Génère un reçu de paiement');
    expect(intents.map((i) => i.name)).toContain('proposeGeneratePaymentReceipt');
  });

  it('détecte la génération d’avis de paiement', () => {
    const intents = tools.resolveLocalToolIntents('Génère un avis de paiement');
    expect(intents.map((i) => i.name)).toContain('proposeGeneratePaymentNotice');
  });

  it('détecte les vacants', () => {
    const intents = tools.resolveLocalToolIntents('Quels logements sont vacants ?');
    expect(intents.map((i) => i.name)).toContain('getVacantUnits');
  });

  it('détecte « mes logements » via getUnits', () => {
    const intents = tools.resolveLocalToolIntents('mes logements');
    expect(intents.map((i) => i.name)).toContain('getUnits');
  });

  it('détecte « qui doit encore payer » via outstanding', () => {
    const intents = tools.resolveLocalToolIntents('quels locataires doivent encore payer ?');
    expect(intents.map((i) => i.name)).toContain('getOutstandingPayments');
  });

  it('détecte les immeubles', () => {
    const intents = tools.resolveLocalToolIntents('donne-moi mes immeubles');
    expect(intents.map((i) => i.name)).toContain('getBuildings');
  });
});

describe('formatToolResultForLocalReply', () => {
  it('formate un résumé dashboard sans inventer', () => {
    const text = formatToolResultForLocalReply('getDashboardSummary', {
      organization: { name: 'Test Org' },
      summary: {
        totalApartments: 2,
        occupancyRate: 50,
        collectedThisMonthXaf: 20000,
        latePayments: 0,
        availableApartments: 1,
        activeLeases: 1,
        totalTenants: 1,
      },
    });
    expect(text).toContain('Test Org');
    expect(text).toContain('2 biens');
    expect(text).toContain('20');
  });

  it('indique aucun impayé', () => {
    const text = formatToolResultForLocalReply('getOutstandingPayments', { count: 0, items: [] });
    expect(text.toLowerCase()).toContain('aucun');
  });

  it('formate getUnits par immeuble', () => {
    const text = formatToolResultForLocalReply('getUnits', {
      count: 2,
      occupied: 1,
      vacant: 1,
      maintenance: 0,
      buildings: [
        {
          buildingName: 'Résidence X',
          units: [
            { label: 'Appartement 01', status: 'OCCUPIED' },
            { label: 'Appartement 02', status: 'AVAILABLE' },
          ],
        },
      ],
    });
    expect(text).toContain('Résidence X');
    expect(text).toContain('Occupé');
    expect(text).toContain('Vacant');
    expect(text).toContain('2 logement');
  });

  it('formate proposeCreateLease prêt', () => {
    const text = formatToolResultForLocalReply('proposeCreateLease', {
      ready: true,
      missing: [],
      preview: {
        tenantId: 't1',
        tenantName: 'Jean Dupont',
        apartmentId: 'a1',
        apartmentLabel: 'A01',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        monthlyRent: 100000,
        activate: false,
      },
    });
    expect(text).toContain('Jean Dupont');
    expect(text).toContain('Confirmez');
  });

  it('formate proposeSendTenantMessage prêt', () => {
    const text = formatToolResultForLocalReply('proposeSendTenantMessage', {
      ready: true,
      missing: [],
      preview: {
        recipientUserId: 'u1',
        tenantName: 'Marie',
        subject: 'Rappel',
        body: 'Merci de régulariser',
      },
    });
    expect(text).toContain('Marie');
    expect(text).toContain('Confirmez');
  });

  it('formate proposeSendWhatsAppMessage prêt', () => {
    const text = formatToolResultForLocalReply('proposeSendWhatsAppMessage', {
      ready: true,
      missing: [],
      preview: {
        tenantId: 't1',
        tenantName: 'Marie Koumba',
        toPhone: '+242061234567',
        body: 'Rappel de loyer',
      },
    });
    expect(text).toContain('Marie Koumba');
    expect(text).toContain('+242061234567');
    expect(text).toContain('WhatsApp');
    expect(text).toContain('Confirmer');
  });

  it('formate proposeSendWhatsAppMedia unsupported', () => {
    const text = formatToolResultForLocalReply('proposeSendWhatsAppMedia', {
      ready: false,
      unsupported: true,
      error: 'Envoi WhatsApp audio/image non encore disponible.',
    });
    expect(text.toLowerCase()).toContain('non encore disponible');
  });
});

describe('pending actions', () => {
  beforeEach(() => _resetPendingActionsForTests());

  it('crée, lit, consomme une action org-scopée', () => {
    const action = createPendingAction({
      organizationId: 'org1',
      userId: 'user1',
      type: 'GENERATE_LEASE_PDF',
      payload: { leaseId: 'lease1', summary: 'test' },
    });
    expect(action.id).toBeTruthy();
    const loaded = getPendingAction(action.id, 'org1', 'user1');
    expect(loaded.payload.leaseId).toBe('lease1');
    const consumed = consumePendingAction(action.id, 'org1', 'user1');
    expect(consumed.id).toBe(action.id);
    expect(() => getPendingAction(action.id, 'org1', 'user1')).toThrow();
  });

  it('supporte CREATE_LEASE, SEND_TENANT_MESSAGE et SEND_WHATSAPP_MESSAGE', () => {
    const lease = createPendingAction({
      organizationId: 'org1',
      userId: 'user1',
      type: 'CREATE_LEASE',
      payload: {
        tenantId: 't1',
        apartmentId: 'a1',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        monthlyRent: 150000,
      },
    });
    expect(lease.type).toBe('CREATE_LEASE');
    expect(getPendingAction(lease.id, 'org1', 'user1').payload.apartmentId).toBe('a1');

    const msg = createPendingAction({
      organizationId: 'org1',
      userId: 'user1',
      type: 'SEND_TENANT_MESSAGE',
      payload: {
        recipientUserId: 'u2',
        tenantName: 'Jean Test',
        subject: 'Rappel',
        body: 'Bonjour',
      },
    });
    expect(msg.type).toBe('SEND_TENANT_MESSAGE');
    expect(getPendingAction(msg.id, 'org1', 'user1').payload.body).toBe('Bonjour');

    const wa = createPendingAction({
      organizationId: 'org1',
      userId: 'user1',
      type: 'SEND_WHATSAPP_MESSAGE',
      payload: {
        tenantId: 't1',
        toPhone: '+242061234567',
        tenantName: 'Jean Test',
        body: 'Rappel WA',
        providerChannel: 'WHATSAPP',
      },
    });
    expect(wa.type).toBe('SEND_WHATSAPP_MESSAGE');
    expect(getPendingAction(wa.id, 'org1', 'user1').payload.toPhone).toBe('+242061234567');
  });

  it('refuse une autre organisation', () => {
    const action = createPendingAction({
      organizationId: 'org1',
      userId: 'user1',
      type: 'GENERATE_LEASE_PDF',
      payload: { leaseId: 'lease1' },
    });
    expect(() => getPendingAction(action.id, 'org2', 'user1')).toThrow();
  });

  it('annule une action', () => {
    const action = createPendingAction({
      organizationId: 'org1',
      userId: 'user1',
      type: 'GENERATE_LEASE_PDF',
      payload: {},
    });
    cancelPendingAction(action.id, 'org1', 'user1');
    expect(() => getPendingAction(action.id, 'org1', 'user1')).toThrow();
  });
});

describe('document capabilities wave1+2', () => {
  it('expose contrat + reçu + avis, stubs le reste', () => {
    const caps = listDocumentCapabilities();
    expect(caps.find((c) => c.kind === 'LEASE_CONTRACT')?.available).toBe(true);
    expect(caps.find((c) => c.kind === 'PAYMENT_RECEIPT')?.available).toBe(true);
    expect(caps.find((c) => c.kind === 'PAYMENT_NOTICE')?.available).toBe(true);
    const inspection = caps.find((c) => c.kind === 'PROPERTY_INSPECTION');
    expect(inspection?.available).toBe(false);
    expect(inspection?.wave).toBe(2);
  });
});
