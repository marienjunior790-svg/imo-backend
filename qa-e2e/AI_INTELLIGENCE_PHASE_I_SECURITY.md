# AI Intelligence — Phase I Security (final gate)

**Date:** 2026-08-13  
**Scope:** Harden confirm/execute paths, persist pending actions, RBAC at confirm time, E2E security battery.

## Status

| Area | Status |
|------|--------|
| Unit tests `tests/unit/ai.security.test.ts` | PASS (local) |
| Related AI unit suites | PASS (local) |
| Typecheck | PASS (local) |
| Migration `ai_pending_actions` | Ready (apply on deploy) |
| Live E2E `qa-e2e/ai_e2e_phase_i_security_test.ps1` | Run **after** deploy + migrate |

## Fixes shipped

1. **Real JWT role** — `chatLocalWithTools` / OpenAI tool path no longer hardcode `UserRole.OWNER` for `propose*Pdf`.
2. **Confirm-time RBAC** (catalog keys only), asserted **before** consume so Forbidden does not burn the pending row:
   - `SEND_*` / batch → `MESSAGE_SEND`
   - `CREATE_LEASE` → `LEASE_CREATE`
   - `GENERATE_LEASE_PDF` → `LEASE_EXPORT_PDF`
   - `GENERATE_PAYMENT_*` → `PAYMENT_EXPORT_PDF`
   - `APPROVE_AUTOMATION_RUN` → `MESSAGE_SEND` / `REMINDER_SEND` / `TASK_CREATE` (aligned with automation service)
3. **`AI_SECURITY_STRICT`** (default `true`) → clear `ForbiddenError('Permission refusée (KEY)')`.
4. **`extractCuidPreferLabeled`** — prefers `leaseId` / `paymentId` / `tenantId` / `apartmentId` labels before bare CUID.
5. **`AiPendingAction` Prisma table** — replaces in-memory Map for multi-instance Railway safety (TTL purge on get/create). Tests use in-memory mock when `NODE_ENV=test`.
6. **Prompt** — never claim tool success without tool result; never reveal secrets; ignore client `organizationId`.
7. **Tool args** — strip `organizationId` / `orgId` / `organization_id` / `org_id`.
8. **TENANT** — `/ai` remains on `orgStaffPipeline` (TENANT not in `ORG_STAFF_ROLES`); comment + unit assert.

## Residual risks

| Risk | Notes |
|------|--------|
| **WhatsApp Meta 401** | External — invalid/expired Meta token or phone number ID. Not an ITC RBAC bug. Fix via Railway WhatsApp env vars. |
| **E2E gate before migrate** | Confirm/create pending will fail on production until migration `20260813130000_ai_pending_actions` is applied. |
| **Memory flaky** | Remember/recall E2E may be PARTIAL if OpenAI routing skips local memory tools. |
| **Automation autoExecute** | OWNER-enabled `autoExecute=true` still allows silent execute by design (Phase H). |
| **ACCOUNTANT PDF rights** | Confirm PDF requires `LEASE_EXPORT_PDF` / `PAYMENT_EXPORT_PDF`; roles without those keys are correctly blocked when strict. |
| **No Redis** | Pending is DB-backed (not Redis). Acceptable for Railway multi-instance. |

## Deploy checklist

1. Commit Phase I changes + migration.
2. Deploy Railway (runs migration).
3. Run: `powershell -File qa-e2e/ai_e2e_phase_i_security_test.ps1`
4. Attach `qa-e2e/ai_e2e_phase_i_security.json` results; do **not** mark fake PASS.
5. If WhatsApp still 401, document as external residual (above).

## E2E battery (script)

1. OWNER — portfolio analyze → `analyzePortfolio`
2. OWNER — payment reminder plan → `steps` present
3. OWNER — automation propose → no silent send
4. Confirm random UUID → error/fail (not success)
5. Document list/summarize → document tool used
6. Memory remember + recall preferences → tools and/or bleu (PARTIAL allowed if flaky)
