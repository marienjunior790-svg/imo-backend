# PHASE D — Intent Detection + Conversational Context

Date: 2026-08-12  
Scope: Context Manager (référents FR), enrichissement intents locaux via session, période impayés, cancel pending, « pourquoi »  
WhatsApp / memory core : **non réécrits** (session entities étendues seulement).

---

## 1. Existed (Phase C)

- `AiMemoryService` + `AiSessionContext.entitiesJson` (`lastTenantId`, `lastBuildingId`, …)
- Tools mémoire remember / recall / forget
- `resolveLocalToolIntents(message)` sans session
- Pending actions in-memory (`cancelPendingAction`)

## 2. Modified

| File | Change |
|------|--------|
| `src/modules/ai/ai.memory.service.ts` | `AiSessionEntities` + `lastToolsUsed`, `lastUserMessage`, `lastReplyDigest` |
| `src/modules/ai/ai.pending-actions.ts` | `getLatestPendingForUser` |
| `src/modules/ai/ai.tools.ts` | `resolveLocalToolIntents(message, session?, history?)` ; `getOutstandingPayments` filtre `period` / `tenantId` ; clarification helper |
| `src/modules/ai/ai.service.ts` | Charge session avant intents ; `chatLocalWithTools(..., history, session)` ; cancel / pourquoi / persist digest |
| `tests/unit/ai.tools-local.test.ts` | Signature optionnelle (appels existants OK) |

## 3. Files created

| File | Role |
|------|------|
| `src/modules/ai/ai.context-manager.ts` | Helpers purs + `AiContextManager` injectable |
| `tests/unit/ai.context-manager.test.ts` | Referents, période, clarification, enrichToolArgs |
| `qa-e2e/AI_INTELLIGENCE_PHASE_D_CONTEXT.md` | Ce livrable |

## 4. Migrations

Aucune (réutilise `AiSessionContext` Phase C).

## 5. Env

Aucun nouveau. Dépend de `AI_MEMORY_ENABLED` pour session / digest.

## 6. Tests

- `tests/unit/ai.context-manager.test.ts` — celui-là → lastTenantId ; mois dernier ; ambiguous ; enrichToolArgs ; intents période
- Régression : `ai.tools-local` / `ai.team-members` (signature rétrocompatible)

## 7. PASS / FAIL

| Check | Status |
|-------|--------|
| Context Manager référentiel sans inventer d’IDs | **PASS** |
| `resolveLocalToolIntents` + session | **PASS** |
| `getOutstandingPayments` period Prisma (`periodMonth`/`periodYear`) | **PASS** |
| Cancel latest pending | **PASS** |
| History 2–4 tours sur path local | **PASS** |
| Unit tests + `tsc --noEmit` | voir vérification |

## 8. Blocked

- Noms dans l’historique : extraction heuristique (pas de résolution ID sans Prisma tool)
- « pourquoi » sans `lastIntent` / digest → tip générique (pas d’invention)

---

## Comportement clé

1. « celui-là » → injecte `lastTenantId` (etc.) si session connue ; sinon **une** question de clarification.
2. « et celui du mois dernier » après impayés → `getOutstandingPayments` + `period: 'last_month'`.
3. « annule ce que tu viens de faire » → `getLatestPendingForUser` + cancel.
4. « pourquoi » / « explique autrement » → rejoue `lastIntent` lecture ou tip sur `lastReplyDigest`.
5. Faits métier : Prisma / tools uniquement — jamais d’IDs inventés.
