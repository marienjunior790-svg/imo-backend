import {
  buildMaintenanceProposeAppendix,
  buildMaintenanceTicketTitle,
  extractAssigneeNameHint,
  matchMaintenanceAgentByName,
  wantsAssignMaintenanceTicket,
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

describe('ai.maintenance-ticket (Phase K2)', () => {
  it('détecte assignation et ignore automation', () => {
    expect(wantsAssignMaintenanceTicket('assigne le ticket à Jean Mbemba')).toBe(true);
    expect(wantsAssignMaintenanceTicket('attribue à l’agent Marie')).toBe(true);
    expect(wantsAssignMaintenanceTicket('automatise les tâches maintenance')).toBe(false);
    expect(wantsCreateMaintenanceTicket('crée le ticket maintenance')).toBe(true);
    expect(wantsAssignMaintenanceTicket('crée le ticket maintenance')).toBe(false);
  });

  it('match agent par nom', () => {
    const agents = [
      { id: '1', firstName: 'Jean', lastName: 'Mbemba' },
      { id: '2', firstName: 'Marie', lastName: 'Kouassi' },
    ];
    expect(matchMaintenanceAgentByName(agents, 'Jean Mbemba').match?.id).toBe('1');
    expect(matchMaintenanceAgentByName(agents, 'Marie').match?.id).toBe('2');
    expect(extractAssigneeNameHint('assigne le ticket à Jean Mbemba')).toMatch(/Jean/i);
  });

  it('capability router : assigne ticket → MAINTENANCE', () => {
    const routed = resolveCapabilityRoute('assigne le ticket à Jean');
    expect(routed.capability).toBe('MAINTENANCE');
    const pending = resolveCapabilityRoute('euh ok', {
      hasPending: true,
      pendingType: 'ASSIGN_MAINTENANCE_TICKET',
    });
    expect(pending.blockPortfolioFallback).toBe(true);
    expect(pending.clarification).toMatch(/assignation/i);
  });
});
