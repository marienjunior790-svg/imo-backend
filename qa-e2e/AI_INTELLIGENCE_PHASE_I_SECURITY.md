# AI Intelligence — Phase I Security (final gate)

**Date:** 2026-08-13  
**Scope:** Harden confirm/execute paths, persist pending actions, RBAC at confirm time, E2E security battery.  
**Verdict:** **PASS** (6/6 live E2E; unit security suite PASS)

## Status

| Area | Status |
|------|--------|
| Unit tests `tests/unit/ai.security.test.ts` | **PASS** (9) |
| Related AI unit suites (analytics / orchestrator / security) | **PASS** (34) |
| Typecheck / Railway build | **PASS** (`09a4bbc` + prior `52b56c6` `ai.ids`) |
| Migration `ai_pending_actions` | **Applied** (start:prod `prisma migrate deploy`) |
| Live E2E `qa-e2e/ai_e2e_phase_i_security_test.ps1` | **PASS 6/6** — evidence `qa-e2e/ai_e2e_phase_i_security.json` |

## Live E2E (prod)

| Id | Result |
|----|--------|
| PORTFOLIO_ANALYZE | PASS — `analyzePortfolio` |
| PAYMENT_REMINDER_PLAN | PASS — `steps=3` |
| AUTOMATION_PROPOSE | PASS — propose tool, no silent send |
| CONFIRM_RANDOM_UUID | PASS — `NOT_FOUND` / 404 |
| DOCUMENT_INTEL | PASS — `summarizeDocument` (+ analyze) |
| MEMORY_PREF | PASS — remember + recall + bleu |

## Fixes shipped

1. **Real JWT role** — `chatLocalWithTools` / OpenAI tool path no longer hardcode `UserRole.OWNER` for `propose*Pdf`.
2. **Confirm-time RBAC** (catalog keys only), asserted **before** consume so Forbidden does not burn the pending row:
   - `SEND_*` / batch → `MESSAGE_SEND`
   - `CREATE_LEASE` → `LEASE_CREATE`
   - `GENERATE_LEASE_PDF` → `LEASE_EXPORT_PDF`
   - `GENERATE_PAYMENT_*` → `PAYMENT_EXPORT_PDF`
   - `APPROVE_AUTOMATION_RUN` → `MESSAGE_SEND` / `REMINDER_SEND` / `TASK_CREATE` (aligned with automation service)
3. **`AI_SECURITY_STRICT`** (default `true`) → clear `ForbiddenError('Permission refusée (KEY)')`.
4. **`extractCuidPreferLabeled`** (`ai.ids.ts`) — prefers labeled ids before bare CUID.
5. **`AiPendingAction` Prisma table** — replaces in-memory Map for multi-instance Railway safety (TTL purge on get/create). Tests use in-memory mock when `NODE_ENV=test`.
6. **Prompt** — never claim tool success without tool result; never reveal secrets; ignore client `organizationId`.
7. **Tool args** — strip `organizationId` / `orgId` / `organization_id` / `org_id`.
8. **TENANT** — `/ai` remains on `orgStaffPipeline` (TENANT not in `ORG_STAFF_ROLES`); comment + unit assert.
9. **Routing follow-ups (post-deploy):** payment-reminder plan wins over contract-PDF short-circuit; `analyse`/`synthese` + patrimoine/parc → `analyzePortfolio`.

## Commits

| SHA | Note |
|-----|------|
| `18cffe5` | Phase I security + pending persistence |
| `52b56c6` | Add missing `ai.ids.ts` (build fix) |
| `09a4bbc` | Intent routing: Phase E/F not stolen by PDF/dashboard |

## Residual risks

| Risk | Notes |
|------|--------|
| **WhatsApp Meta 401** | External — invalid/expired Meta token or phone number ID. Not an ITC RBAC bug. |
| **Memory flaky** | Remember/recall may PARTIAL if OpenAI routing skips local memory tools (this run: PASS). |
| **Automation autoExecute** | OWNER-enabled `autoExecute=true` still allows silent execute by design (Phase H). |
| **ACCOUNTANT PDF rights** | Confirm PDF requires export keys; roles without them are blocked when strict. |
| **No Redis** | Pending is DB-backed (not Redis). Acceptable for Railway multi-instance. |

## E2E battery (script)

1. OWNER — portfolio analyze → `analyzePortfolio`
2. OWNER — payment reminder plan → `steps` present
3. OWNER — automation propose → no silent send
4. Confirm random UUID → error/fail (not success)
5. Document list/summarize → document tool used
6. Memory remember + recall preferences → tools and/or bleu (PARTIAL allowed if flaky)
