# P2-002 / P2-018 — Diagnostic de traçabilité (aucune correction)

**Date:** 2026-08-11T02:20Z  
**Runtime:** FAIL (confirmé)  
**Actions:** lecture seule API + git + source local. Aucune mutation DB.

---

## Flux code (local, working tree)

| Étape | Service | Fonction | Effet notif |
|-------|---------|----------|-------------|
| Terminé | `MaintenanceService` | `complete` / `completeForAgent` | Crée TENANT `MAINTENANCE_COMPLETED` titre « Intervention terminée — confirmez la résolution » via `NotificationService.notifyUser` |
| Clôturé | `MaintenanceService` | `close` (unique écrire CLOSED) | **Local uniquement:** `resolveCompletedMaintenanceNotifs` + `notifyUser` `SYSTEM` « Votre demande est clôturée » |

**Chemins d’appel vers `close()` (tous convergent) :**
- `POST /maintenance/:id/close` → `close`
- `POST /agent/jobs/:id/close` → `closeForAgent` → (`complete` si besoin) → `close`
- `portal.confirmMaintenanceResolved` → `close`

Aucune voie parallèle de clôture hors `MaintenanceService.close`.

---

## Preuve runtime (prod DB via API)

### Anciennes notifs « confirmez »
1. `cmsnsowpn00ys1237ebm4yxjs` — GATE-MAINT-001 — createdAt **2026-08-10T22:20:28.955Z** — type MAINTENANCE_COMPLETED — data.status=COMPLETED — ticket CLOSED 33s plus tard
2. `cmsmjybh900ujtu02ghuhwpf8` — plomberie — createdAt **2026-08-10T01:28:05.277Z** — même type — ticket CLOSED ~6s plus tard

### Tickets
- GATE `cmsnrsqar00xh1237ojjfm0ca` CLOSED **2026-08-10T22:21:01Z** actor **ITC-ABJARH3H** (event CLOSED)
- plomberie `cmsmjtfjr00w2w4tiaczgiouk` CLOSED **2026-08-10T01:28:11Z** actor **ugcmanagemnet007@gmail.com**

### SYSTEM
- Liste TENANT : **0** notif type SYSTEM / titre clôturée → **jamais créée** (pas filtrée).

Si `resolveCompletedMaintenanceNotifs` avait tourné, titre serait « Intervention clôturée » — titres inchangés → **jamais exécuté**.

---

## Backend prod

| Champ | Valeur |
|-------|--------|
| Health | `GET /api/v1/health` → version **0.8.0**, env production, database connected |
| Uptime observé | ~32665 s (~9.07 h) au moment du check |
| Commit SHA exposé | **non** (health ne renvoie pas `RAILWAY_GIT_COMMIT_SHA`) |
| package.json | `"version": "0.8.0"` (fallback APP_VERSION) |
| Repo local HEAD | `f6534bfe…` *fix(p1): clearer Resend…* (2026-08-10 18:11 +0100) |
| Patch P2-002/018 | **working tree uniquement** — `git status` : `M maintenance.service.ts`, `M notification.service.ts` — **non commité**, donc **non déployable / non déployé** |
| Diff local | +56/−1 lignes (resolve + SYSTEM) absentes de `origin/main` |

---

## Cause racine

Les tickets ont été clôturés **le 10 août** par le **code prod historique** (sans resolve, sans SYSTEM). Les notifs « confirmez » créées à `complete()` restent en DB. Le correctif lot 1 existe **seulement en local non commité** ; Railway tourne encore la build issue de HEAD/`0.8.0` **sans** ce patch. Pas un filtre UI ; pas un second chemin magique.

---

## Correction nécessaire (ne pas appliquer maintenant)

1. Commit + deploy backend du lot P2-002/018.
2. Backfill one-shot (ou script) : pour tickets déjà CLOSED, appeler la logique `resolveCompletedMaintenanceNotifs` + créer SYSTEM manquantes — **sans** supprimer les lignes pour « masquer ».
3. Re-valider runtime TENANT (titres réécrits + SYSTEM visible).

---

## STOP
