import {
  detectReferentialIntent,
  enrichToolArgs,
  relativePeriod,
  resolveEntitiesFromMessage,
  enrichLocalIntents,
} from '../../src/modules/ai/ai.context-manager.js';
import type { AiSessionEntities } from '../../src/modules/ai/ai.memory.service.js';
import { AiToolsService } from '../../src/modules/ai/ai.tools.js';

describe('ai.context-manager — detectReferentialIntent', () => {
  it('détecte celui-là', () => {
    const f = detectReferentialIntent('Et celui-là ?');
    expect(f.wantsPreviousEntity).toBe(true);
  });

  it('détecte mois dernier', () => {
    const f = detectReferentialIntent('et celui du mois dernier');
    expect(f.wantsPreviousEntity).toBe(true);
    expect(f.wantsLastMonth).toBe(true);
  });

  it('détecte fais pareil', () => {
    expect(detectReferentialIntent('fais pareil pour Marie').wantsSameAction).toBe(true);
  });

  it('détecte pourquoi', () => {
    expect(detectReferentialIntent('pourquoi ?').wantsWhy).toBe(true);
  });

  it('détecte explique autrement', () => {
    expect(detectReferentialIntent('explique autrement').wantsExplainOtherwise).toBe(true);
  });

  it('détecte annuler dernière action', () => {
    expect(detectReferentialIntent('annule ce que tu viens de faire').wantsCancelLast).toBe(true);
  });
});

describe('ai.context-manager — relativePeriod', () => {
  it('calcule mois dernier (UTC)', () => {
    const now = new Date(Date.UTC(2026, 7, 12)); // août 2026
    const p = relativePeriod('et celui du mois dernier', now);
    expect(p.period).toBe('last_month');
    expect(p.from?.getUTCFullYear()).toBe(2026);
    expect(p.from?.getUTCMonth()).toBe(6); // juillet
    expect(p.to?.getUTCMonth()).toBe(6);
  });

  it('calcule ce mois', () => {
    const now = new Date(Date.UTC(2026, 7, 12));
    const p = relativePeriod('impayés de ce mois', now);
    expect(p.period).toBe('this_month');
    expect(p.from?.getUTCMonth()).toBe(7);
  });
});

describe('ai.context-manager — resolveEntitiesFromMessage', () => {
  it('celui-là → uses lastTenantId', () => {
    const session: AiSessionEntities = {
      lastTenantId: 'clasttenant000000000001',
      lastTenantName: 'Jean Test',
    };
    const r = resolveEntitiesFromMessage('celui-là', session);
    expect(r.tenantId).toBe('clasttenant000000000001');
    expect(r.usedSessionFallback).toBe(true);
    expect(r.needsClarification).toBeUndefined();
  });

  it('ambiguous without session → needsClarification', () => {
    const r = resolveEntitiesFromMessage('celui-là', {});
    expect(r.needsClarification).toBeTruthy();
    expect(r.tenantId).toBeUndefined();
  });
});

describe('ai.context-manager — enrichToolArgs', () => {
  it('injecte tenantId depuis session', () => {
    const session: AiSessionEntities = { lastTenantId: 'ctenant0000000000000001' };
    const args = enrichToolArgs(
      'proposeSendTenantMessage',
      { body: 'Bonjour' },
      session,
      'envoie un message à celui-là',
    );
    expect(args.tenantId).toBe('ctenant0000000000000001');
    expect(args.body).toBe('Bonjour');
  });

  it('ajoute period last_month pour getOutstandingPayments', () => {
    const session: AiSessionEntities = { lastIntent: 'getOutstandingPayments' };
    const args = enrichToolArgs('getOutstandingPayments', {}, session, 'et celui du mois dernier');
    expect(args.period).toBe('last_month');
  });

  it('n’écrase pas un tenantId déjà fourni', () => {
    const session: AiSessionEntities = { lastTenantId: 'cfromsession00000000001' };
    const args = enrichToolArgs(
      'proposeSendWhatsAppMessage',
      { tenantId: 'cexplicit00000000000001' },
      session,
      'celui-là',
    );
    expect(args.tenantId).toBe('cexplicit00000000000001');
  });
});

describe('ai.context-manager — enrichLocalIntents + resolveLocalToolIntents', () => {
  it('mois dernier après outstanding → getOutstandingPayments + period', () => {
    const { intents } = enrichLocalIntents({
      message: 'et celui du mois dernier',
      intents: [],
      session: {
        lastIntent: 'getOutstandingPayments',
        lastToolsUsed: ['getOutstandingPayments'],
      },
    });
    expect(intents.map((i) => i.name)).toContain('getOutstandingPayments');
    const outstanding = intents.find((i) => i.name === 'getOutstandingPayments');
    expect(outstanding?.args?.period).toBe('last_month');
  });

  it('AiToolsService.resolveLocalToolIntents accepte session', () => {
    const tools = Object.create(AiToolsService.prototype) as AiToolsService;
    const intents = tools.resolveLocalToolIntents('et celui du mois dernier', {
      lastIntent: 'getOutstandingPayments',
      lastToolsUsed: ['getOutstandingPayments'],
    });
    expect(intents.map((i) => i.name)).toContain('getOutstandingPayments');
    expect(intents.find((i) => i.name === 'getOutstandingPayments')?.args?.period).toBe('last_month');
  });

  it('celui-là sans session → pas d’intent inventé', () => {
    const tools = Object.create(AiToolsService.prototype) as AiToolsService;
    const intents = tools.resolveLocalToolIntents('celui-là', {});
    expect(intents).toEqual([]);
    const clarification = tools.resolveReferentialClarification('celui-là', {});
    expect(clarification).toBeTruthy();
  });
});
