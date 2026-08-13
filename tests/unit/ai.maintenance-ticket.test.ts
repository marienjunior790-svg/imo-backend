import {
  buildMaintenanceProposeAppendix,
  buildMaintenanceTicketTitle,
  wantsCreateMaintenanceTicket,
} from '../../src/modules/ai/ai.maintenance-ticket.js';
import { resolveCapabilityRoute } from '../../src/modules/ai/ai.capability-router.js';

describe('ai.maintenance-ticket (Phase K1)', () => {
  it('détecte « crée le ticket maintenance » et ignore l’automation', () => {
    expect(wantsCreateMaintenanceTicket('crée le ticket maintenance')).toBe(true);
    expect(wantsCreateMaintenanceTicket('ouvre un ticket pour la fuite')).toBe(true);
    expect(wantsCreateMaintenanceTicket('signale un ticket Appt 3B')).toBe(true);
    expect(wantsCreateMaintenanceTicket('automatise les tâches maintenance')).toBe(false);
    expect(wantsCreateMaintenanceTicket('génère le contrat PDF')).toBe(false);
  });

  it('build title avec logement', () => {
    const title = buildMaintenanceTicketTitle({
      classification: {
        kind: 'DAMAGE',
        priorityHint: 'HIGH',
        damageSignals: ['fuite', 'humidité'],
        looksLikeDocument: false,
      },
      unit: {
        apartmentId: 'apt1',
        apartmentLabel: 'Appt 3B',
        source: 'session',
      },
    });
    expect(title).toContain('fuite');
    expect(title).toContain('Appt 3B');
  });

  it('appendix propose vs clarification logement', () => {
    expect(buildMaintenanceProposeAppendix({ pending: true, apartmentLabel: 'Appt 3B', priority: 'HIGH' })).toMatch(
      /oui/i,
    );
    expect(buildMaintenanceProposeAppendix({ pending: false })).toMatch(/libellé/i);
  });

  it('capability router : crée ticket → MAINTENANCE, bloque dump si pending', () => {
    const routed = resolveCapabilityRoute('crée le ticket maintenance pour Appt 3B');
    expect(routed.capability).toBe('MAINTENANCE');
    expect(routed.score).toBeGreaterThanOrEqual(9);

    const pending = resolveCapabilityRoute('euh ok', {
      hasPending: true,
      pendingType: 'CREATE_MAINTENANCE_TICKET',
    });
    expect(pending.blockPortfolioFallback).toBe(true);
    expect(pending.clarification).toMatch(/ticket maintenance/i);
  });
});
