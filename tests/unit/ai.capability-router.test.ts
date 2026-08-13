import {
  resolveCapabilityRoute,
  shouldBlockPortfolioFallback,
} from '../../src/modules/ai/ai.capability-router.js';
import type { AiSessionEntities } from '../../src/modules/ai/ai.memory.service.js';

describe('ai.capability-router (Phase J1)', () => {
  it('bloque le dump patrimoine pour « oui crée le PDF »', () => {
    const r = resolveCapabilityRoute('oui crée le PDF', { hasPending: true, pendingType: 'GENERATE_LEASE_PDF' });
    expect(r.capability).toBe('CONFIRM_PENDING');
    expect(r.blockPortfolioFallback).toBe(true);
  });

  it('bloque le dump pour message court avec pending ouvert', () => {
    const r = resolveCapabilityRoute('ok', {
      hasPending: true,
      pendingType: 'GENERATE_LEASE_PDF',
    });
    expect(r.blockPortfolioFallback).toBe(true);
    expect(r.capability).toBe('CONFIRM_PENDING');
  });

  it('bloque le dump si lastIntent propose* + message flou court', () => {
    const session: AiSessionEntities = {
      lastIntent: 'proposeGenerateLeasePdf',
      lastToolsUsed: ['proposeGenerateLeasePdf'],
    };
    expect(
      shouldBlockPortfolioFallback('vas-y alors', { session, hasPending: false }),
    ).toBe(true);
    const r = resolveCapabilityRoute('euh', { session });
    expect(r.blockPortfolioFallback).toBe(true);
    expect(r.clarification).toBeTruthy();
  });

  it('ne bloque pas un vrai intent patrimoine', () => {
    const r = resolveCapabilityRoute('mes impayés', {});
    expect(r.capability).toBe('PORTFOLIO_READ');
    expect(r.blockPortfolioFallback).toBe(false);
  });

  it('détecte PDF contrat comme capacité PDF_LEASE (pas une confirm)', () => {
    expect(
      resolveCapabilityRoute('crée moi le contrat en PDF de fortune libolo', {}).capability,
    ).toBe('PDF_LEASE');
    const r = resolveCapabilityRoute('crée moi le contrat en PDF de fortune libolo', {});
    expect(r.blockPortfolioFallback).toBe(true);
    expect(r.suggestedTools).toContain('proposeGenerateLeasePdf');
  });

  it('détecte WhatsApp comme MSG_WHATSAPP', () => {
    const r = resolveCapabilityRoute('envoie un message WhatsApp de relance', {});
    expect(r.capability).toBe('MSG_WHATSAPP');
    expect(r.blockPortfolioFallback).toBe(true);
  });

  it('« oui » seul sans pending → CONFIRM bloqué mais clarification', () => {
    const r = resolveCapabilityRoute('oui', { hasPending: false });
    expect(r.capability).toBe('CONFIRM_PENDING');
    expect(r.blockPortfolioFallback).toBe(true);
  });
});
