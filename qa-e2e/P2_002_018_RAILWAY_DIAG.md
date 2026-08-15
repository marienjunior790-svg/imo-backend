# P2-002/018 — Diagnostic Railway `perpetual-generosity`

**Date:** 2026-08-11  
**Scope:** diagnostic only — aucun fix code / DB / other P2.

## Service réellement utilisé par ITC

| | |
|--|--|
| App mobile `API_BASE_URL` | `https://imo-backend-production-d2d1.up.railway.app/api/v1` |
| Projet Railway | **fortunate-beauty** (`1652eff0-…`) |
| Service | **imo-backend** |
| Domaine | `imo-backend-production-d2d1.up.railway.app` (ACTIVE, port 3000) |
| Déploiement actif | `468398eb-…` **SUCCESS** |
| Commit runtime | **`0f1a52305c949d23462e0fa24de447c47fee5473`** (`fix(p2): resolve confirm notifs…`) |

## `perpetual-generosity` — pourquoi FAILURE

| | |
|--|--|
| Projet | `520ce4ff-…` / service `imo-backend` |
| Domaines publics | **aucun** (`domain list` → `[]`) |
| Déploiements récents | tous **FAILED** (0f1a523, f6534bf, 5ffdfd6…) — chronique |
| Build image | OK (Dockerfile / tsc) |
| Runtime | `start-prod.sh` → Prisma **P1012** : `Environment variable not found: DATABASE_URL` |
| Variables service | uniquement métadonnées `RAILWAY_*` — **pas de `DATABASE_URL`** |
| Healthcheck | `/api/v1/health` timeout 5 min → *service unavailable* → deploy failure |

**Conclusion :** miroir GitHub du même repo **non configuré** (pas de DB / pas d’URL publique). **Non nécessaire** au runtime ITC mobile/prod.

## Preuve API (fortunate-beauty / 0f1a523)

Ticket validation `cmso31bwz00uhfqfhhem60yu6` : COMPLETED → **CLOSED** + notif TENANT **SYSTEM** « Votre demande est clôturée » ; CTA « confirmez » réécrit pour ce ticket. Historiques 10/08 non touchés (doc séparée).

## Pourquoi perpetual n’est pas bloquant

L’app pointe exclusivement sur le domaine de **fortunate-beauty**, où le patch est SUCCESS. Corriger perpetual exigerait ops (vars/DB/domaine) hors nécessité P2-002/018 — non fait.

## Verdict

**P2-002/018 = PASS**
