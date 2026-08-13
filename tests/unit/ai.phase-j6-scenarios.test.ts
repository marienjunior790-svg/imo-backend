/**
 * Phase J6 — chemins automatisés (pas device). Verrouille les attentes des scénarios A/B.
 */
import { resolveCapabilityRoute } from '../../src/modules/ai/ai.capability-router.js';
import { detectDocumentAskIntent } from '../../src/modules/ai/ai.document-pipeline.js';
import { resolveKnowledgeClarification } from '../../src/modules/ai/ai.knowledge.js';
import {
  classifyVisionReading,
  buildVisionMetierActions,
  buildVisionMetierAppendix,
} from '../../src/modules/ai/ai.vision.js';
import {
  formatWhatsAppSendSuccess,
  formatWhatsAppUserError,
  WhatsAppProviderError,
} from '../../src/infrastructure/messaging/whatsapp-errors.js';

describe('Phase J6 — scénario A (photo fuite → maintenance)', () => {
  it('A1 vision classifie fuite + actions Maintenance', () => {
    const c = classifyVisionReading('Fuite d’eau sous l’évier, humidité au sol.', 'Appt 3B');
    expect(c.kind).toBe('DAMAGE');
    const appendix = buildVisionMetierAppendix(c, {
      apartmentLabel: 'Appt 3B',
      source: 'prompt_match',
    });
    expect(appendix).toMatch(/Maintenance|Plan d’action/i);
    expect(buildVisionMetierActions(c).some((a) => a.route === '/maintenance')).toBe(true);
  });

  it('A2 confirm PDF ne dump pas le parc', () => {
    const r = resolveCapabilityRoute('oui crée le PDF', {
      hasPending: true,
      pendingType: 'GENERATE_LEASE_PDF',
    });
    expect(r.blockPortfolioFallback).toBe(true);
    expect(r.capability).toBe('CONFIRM_PENDING');
  });
});

describe('Phase J6 — scénario B (contrat → faits → WhatsApp)', () => {
  it('B2 loyer du bail = intent structuré, pas OCR block', () => {
    expect(resolveKnowledgeClarification('quel est le loyer du bail de Fortune')).toBeNull();
    expect(detectDocumentAskIntent('quel est le loyer du bail de Fortune').kind).toBe('RENT');
  });

  it('B4 clause OCR reste NOT_SUPPORTED', () => {
    const reply = resolveKnowledgeClarification(
      'Trouve la clause concernant le préavis dans ce contrat PDF',
    );
    expect(reply).toMatch(/NOT_SUPPORTED/i);
  });

  it('B5 WhatsApp capability bloque le dump', () => {
    const r = resolveCapabilityRoute('prépare une relance WhatsApp pour l’impayé', {});
    expect(r.capability).toBe('MSG_WHATSAPP');
    expect(r.blockPortfolioFallback).toBe(true);
  });

  it('B6 Meta 401 → token invalide ; succès → SENT + provider id', () => {
    expect(formatWhatsAppUserError(new WhatsAppProviderError(401, 'Invalid OAuth'))).toMatch(
      /Token Meta invalide/i,
    );
    expect(
      formatWhatsAppSendSuccess({
        toPhone: '+242061234567',
        providerMessageId: 'wamid.TEST',
        tenantName: 'Fortune',
      }),
    ).toMatch(/SENT/);
  });
});
