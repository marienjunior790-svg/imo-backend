# PHASE K — Real actions close the loop

**Objectif :** fermer les boucles métier propose→confirm sans nouveaux tools OpenAI.  
**Règle d’or :** Prisma / services = vérité. Zéro création silencieuse.

## K1 — Ticket maintenance depuis vision / NL — **DONE** (`406d584`)

| Avant (J3) | Après (K1) |
|------------|------------|
| Photo dégât → plan + route `/maintenance` | Photo dégât + logement connu → **pending `CREATE_MAINTENANCE_TICKET`** |
| « crée le ticket » | Propose depuis session / libellé → « oui » crée ticket via `MaintenanceService` |
| Automation StaffTask | Inchangée (`proposeMaintenanceTasksFromTickets`) |

### AT client

1. Photo fuite + « Appt 3B » (ou session logement) → proposition ticket + **pas** dump parc  
2. « oui » → ticket réel (ID Prisma)  
3. Sans logement → demande libellé, pas de pending inventé  
4. « automatise les tâches maintenance » → toujours automation existante (pas ce flux)

## K2 — Assignation agent propose→confirm — **IN PROGRESS**

| Avant | Après (K2) |
|-------|------------|
| Création ticket → lien UI / auto-assign silencieux | « assigne le ticket à \<agent\> » → pending `ASSIGN_MAINTENANCE_TICKET` |
| Pas de confirm copilote | « oui » → `MaintenanceService.assign` (**ASSIGNED**) |

### Fichiers

- `ai.maintenance-ticket.ts` — `wantsAssignMaintenanceTicket`, match agent par nom
- `ai.pending-actions.ts` — `ASSIGN_MAINTENANCE_TICKET`
- `ai.service.ts` — propose / execute assign ; session `lastMaintenanceTicketId`
- `ai.capability-router.ts` — score + clarification assignation

### AT client

1. Après ticket créé → « assigne le ticket à \<nom\> » → proposition  
2. « oui » → statut **ASSIGNED** + nom agent  
3. Nom ambigu / absent → liste agents, pas dump parc  
4. Sans ticket en session → demande de créer d’abord (ou dernier OPEN org)

## Suite

- K3 — journal E2E téléphone (création + assignation)
