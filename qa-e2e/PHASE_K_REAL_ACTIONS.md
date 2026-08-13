# PHASE K — Real actions close the loop

**Objectif :** fermer les boucles métier propose→confirm sans nouveaux tools OpenAI.  
**Règle d’or :** Prisma / services = vérité. Zéro création silencieuse.

## K1 — Ticket maintenance depuis vision / NL — **IN PROGRESS**

| Avant (J3) | Après (K1) |
|------------|------------|
| Photo dégât → plan + route `/maintenance` | Photo dégât + logement connu → **pending `CREATE_MAINTENANCE_TICKET`** |
| « crée le ticket » | Propose depuis session / libellé → « oui » crée ticket **OPEN** via `MaintenanceService` |
| Automation StaffTask | Inchangée (`proposeMaintenanceTasksFromTickets`) |

### Fichiers

- `ai.maintenance-ticket.ts` — intent NL + titres / appendix
- `ai.pending-actions.ts` — type `CREATE_MAINTENANCE_TICKET`
- `ai.service.ts` — propose (vision + chat) + `executeCreateMaintenanceTicket`
- `ai.capability-router.ts` — score MAINTENANCE + clarification pending

### AT client

1. Photo fuite + « Appt 3B » (ou session logement) → proposition ticket + **pas** dump parc  
2. « oui » → ticket OPEN réel (ID Prisma)  
3. Sans logement → demande libellé, pas de pending inventé  
4. « automatise les tâches maintenance » → toujours automation existante (pas ce flux)

## Suite (hors K1)

- K2 — assignation agent propose→confirm (réutilise assign API)
- K3 — journal E2E téléphone scénario A mis à jour
