/**
 * Phase K3 — chemins automatisés (pas device).
 * Verrouille les attentes du scénario C (ticket → assign).
 */
import {
  wantsAssignMaintenanceTicket,
  wantsCreateMaintenanceTicket,
  extractAssigneeNameHint,
  matchMaintenanceAgentByName,
  buildMaintenanceProposeAppendix,
} from '../../src/modules/ai/ai.maintenance-ticket.js';
import { resolveCapabilityRoute } from '../../src/modules/ai/ai.capability-router.js';

describe('Phase K3 — scénario C (photo → ticket → assign)', () => {
  it('C1/C2 : intent crée ticket + pending bloque dump', () => {
    expect(wantsCreateMaintenanceTicket('crée le ticket pour Appt 3B')).toBe(true);
    const pending = resolveCapabilityRoute('euh', {
      hasPending: true,
      pendingType: 'CREATE_MAINTENANCE_TICKET',
    });
    expect(pending.blockPortfolioFallback).toBe(true);
    expect(pending.clarification).toMatch(/ticket maintenance/i);
    expect(buildMaintenanceProposeAppendix({ pending: true, apartmentLabel: 'Appt 3B' })).toMatch(/oui/i);
  });

  it('C3/C4 : intent assign + pending assignation', () => {
    expect(wantsAssignMaintenanceTicket('assigne le ticket à Jean Mbemba')).toBe(true);
    expect(extractAssigneeNameHint('assigne le ticket à Jean Mbemba')).toMatch(/Jean Mbemba/i);
    const pending = resolveCapabilityRoute('ok vas-y', {
      hasPending: true,
      pendingType: 'ASSIGN_MAINTENANCE_TICKET',
    });
    expect(pending.blockPortfolioFallback).toBe(true);
    expect(pending.clarification).toMatch(/assignation/i);
  });

  it('C5 : sans logement → appendix clarification (pas pending inventé côté helper)', () => {
    expect(buildMaintenanceProposeAppendix({ pending: false })).toMatch(/libellé/i);
    expect(buildMaintenanceProposeAppendix({ pending: false })).not.toMatch(/confirme.*OPEN/i);
  });

  it('C6 : agents ambigus → pas de match unique', () => {
    const agents = [
      { id: '1', firstName: 'Jean', lastName: 'A' },
      { id: '2', firstName: 'Jean', lastName: 'B' },
    ];
    const r = matchMaintenanceAgentByName(agents, 'Jean');
    expect(r.match).toBeUndefined();
    expect(r.ambiguous.length).toBe(2);
  });

  it('ne confond pas automation StaffTask avec K1/K2', () => {
    expect(wantsCreateMaintenanceTicket('automatise les tâches maintenance')).toBe(false);
    expect(wantsAssignMaintenanceTicket('automatise les tâches maintenance')).toBe(false);
  });
});
