# PHASE C — Mémoire intelligente ITC

Date: 2026-08-12  
Scope: Prisma memory models, `AiMemoryService`, tools remember/recall/forget, chat wiring, thin REST  
WhatsApp / propose* tools: **non modifiés** (hors signature `execute` + ctx).

---

## 1. Existed

- Copilote AI avec tools métier Prisma (`ai.tools.ts` / `ai.service.ts`)
- History client → OpenAI only ; pending actions in-memory
- **Aucune** table mémoire user/org ; Phase A audit = `NOT_IMPLEMENTED`

## 2. Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Enums + `AiMemoryEntry` + `AiSessionContext` + relations Org/User |
| `src/config/env.ts` | `AI_MEMORY_ENABLED`, `AI_SESSION_TTL_HOURS`, `isAiMemoryEnabled` |
| `.env.example` | Même env |
| `src/modules/ai/ai.tools.ts` | 3 tools + intents FR + `execute(..., ctx?)` + formatters |
| `src/modules/ai/ai.service.ts` | Inject memory, system prompt, recall inject OpenAI, mergeEntities best-effort, pass userId/role |
| `src/modules/ai/ai.routes.ts` | `GET /ai/memory`, `DELETE /ai/memory/:id` |
| `tests/unit/ai.tools-local.test.ts` | Intents mémoire |
| `tests/unit/ai.team-members.test.ts` | Ctor `AiToolsService` + 4e arg |

## 3. Files created

| File | Role |
|------|------|
| `src/modules/ai/ai.memory.service.ts` | remember / recall / forget / session / listForUser |
| `prisma/migrations/20260812120000_ai_memory/migration.sql` | Additive IF NOT EXISTS |
| `tests/unit/ai.memory.test.ts` | Isolation USER, org write denied, roundtrip |
| `qa-e2e/AI_INTELLIGENCE_PHASE_C_MEMORY.md` | Ce livrable |

## 4. Migrations

`prisma/migrations/20260812120000_ai_memory/migration.sql`

- Enums `AiMemoryScope`, `AiMemoryKind`, `AiMemorySource`
- Tables `ai_memory_entries`, `ai_session_contexts`
- Indexes + FKs (DO $$ IF NOT EXISTS style)

## 5. Env

| Variable | Default | Export |
|----------|---------|--------|
| `AI_MEMORY_ENABLED` | `true` | `isAiMemoryEnabled` |
| `AI_SESSION_TTL_HOURS` | `24` | via `env.AI_SESSION_TTL_HOURS` |

Si désactivé : tools → `{ enabled: false, error: 'Mémoire IA désactivée' }`.

## 6. Tests

- `tests/unit/ai.memory.test.ts` — isolation A≠B, org write MANAGER denied, remember+recall
- `tests/unit/ai.tools-local.test.ts` — retiens / préférences / oublie

## 7. PASS / FAIL

| Check | Status |
|-------|--------|
| Schema + migration additive | **PASS** |
| Service multi-tenant + content ≤ 2000 | **PASS** |
| Tools + local FR intents | **PASS** |
| Chat inject mémoire ≠ Prisma | **PASS** |
| Routes thin AI_USE + ACCESS_AI | **PASS** |
| Unit tests (`ai.memory` + `ai.tools-local` + `ai.team-members`) | **PASS** (60) |
| `tsc --noEmit` | **PASS** |

## 8. Blocked

- Déploiement DB : `prisma migrate deploy` requis sur l’environnement cible avant usage runtime
- Pas d’auto-save de transcripts (volontaire)
- Session entities = best-effort ; pas de follow-up NL complet (Phase ultérieure)

---

## Comportement clé

- **USER** memory : propriétaire = `userId` JWT
- **ORGANIZATION** write/delete : `OWNER` (et alias `ORG_ADMIN` via `normalizeRole` → OWNER)
- Upsert si `key` fournie sur `(org, scope, userId|null, key)`
- Données métier : tools/Prisma gagnent toujours sur la mémoire
