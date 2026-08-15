# P2-002 / P2-018 — Finalisation (commit · deploy · runtime)

**Date:** 2026-08-11  
**Commit:** `0f1a52305c949d23462e0fa24de447c47fee5473`  
**Message:** `fix(p2): resolve confirm notifs and emit SYSTEM on maintenance close`  
**Fichiers commités uniquement:**  
- `src/modules/maintenance/maintenance.service.ts`  
- `src/modules/notifications/notification.service.ts`  
(+56 / −1) — pas de redesign ; `portal.service.ts` (P2-001) **exclu**.

## Tests
- `tests/unit/maintenance.lifecycle.test.ts` → **6/6 PASS**
- `notification-scope.db.test.ts` → skip sans `RUN_DB_TESTS` (non bloquant)

## Railway
| Environnement GitHub deploy | SHA | État |
|-----------------------------|-----|------|
| fortunate-beauty / production | `0f1a523` | **success** (2026-08-11T03:03:38Z) |
| perpetual-generosity / production | `0f1a523` | **failure** (2026-08-11T03:08:13Z) |

API `imo-backend-production-d2d1` : health ok, **uptime reset** ~03:03Z → process redémarré. Health n’expose pas le SHA ; preuve runtime = comportement du patch.

## Runtime (ticket neuf)
- Ticket `cmso31bwz00uhfqfhhem60yu6` « P2-002-VALIDATE close SYSTEM »
- Cycle AGENT: accept → start → complete → **CLOSED** (`closedAt=2026-08-11T03:10:17.544Z`)
- Notif TENANT **SYSTEM** « Votre demande est clôturée » créée `03:10:17.581Z`
- Notif `MAINTENANCE_COMPLETED` réécrite « Intervention clôturée » (`readAt` posé) — **0** « confirmez » pour ce ticket

## Historique (documenté, non modifié)
Les **2** notifs « confirmez la résolution » des tickets déjà CLOSED le 10/08 restent visibles (`HIST_CONFIRM_AFTER=2`).  
Non générées par le nouveau workflow ; pas de delete DB / pas de create manuelle / pas de backfill dans cette finalisation.

## Verdict
**PARTIAL** — runtime + API **PASS** sur le workflow neuf ; deploy GitHub **incomplet** (1 env failure).

## STOP
