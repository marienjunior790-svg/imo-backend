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

describe('AiToolsService.resolveLocalToolIntents', () => {
  const tools = Object.create(AiToolsService.prototype) as AiToolsService;

  it('détecte les impayés', () => {
    const intents = tools.resolveLocalToolIntents('Quels locataires n’ont pas encore payé ?');
    expect(intents).toContain('getOutstandingPayments');
  });

  it('détecte le patrimoine', () => {
    const intents = tools.resolveLocalToolIntents('Résumer mon patrimoine');
    expect(intents).toContain('getDashboardSummary');
  });

  it('détecte la génération de contrat', () => {
    const intents = tools.resolveLocalToolIntents('Génère un contrat de location');
    expect(intents).toContain('proposeGenerateLeasePdf');
  });

  it('détecte la génération de reçu', () => {
    const intents = tools.resolveLocalToolIntents('Génère un reçu de paiement');
    expect(intents).toContain('proposeGeneratePaymentReceipt');
  });

  it('détecte la génération d’avis de paiement', () => {
    const intents = tools.resolveLocalToolIntents('Génère un avis de paiement');
    expect(intents).toContain('proposeGeneratePaymentNotice');
  });

  it('détecte les vacants', () => {
    const intents = tools.resolveLocalToolIntents('Quels logements sont vacants ?');
    expect(intents).toContain('getVacantUnits');
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
