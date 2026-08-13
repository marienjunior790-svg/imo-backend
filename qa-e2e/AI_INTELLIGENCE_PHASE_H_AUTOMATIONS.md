# PHASE H — Intelligent automations

Date: 2026-08-13  
Scope: Detection → Proposal → Validation → Execution → Verification → Logging for ITC AI automations.

---

## 1. Safety posture (default)

| Setting | Default | Who can change |
|---------|---------|----------------|
| `AiAutomationRule.enabled` | `false` | staff with AI access / OWNER |
| `AiAutomationRule.autoExecute` | **`false`** | **OWNER only** |

Sensitive actions (message sends, WhatsApp, task create) are **never** silent-sent unless:

1. An `AiAutomationRule` exists for the kind
2. `enabled=true`
3. `autoExecute=true` (OWNER-set)
4. Permissions still pass at execute time (`MESSAGE_SEND` / `TASK_CREATE` / `REMINDER_SEND`)

Default AI chat path: **propose + `APPROVE_AUTOMATION_RUN` pending action**.

---

## 2. Cycle

```
detect (Prisma)
  → propose (AiAutomationRun PROPOSED + pendingAction)
    → user confirm
      → approveAndExecute (assert RBAC last moment)
        → execute via NotificationCenter
          → verify (re-read message/task/reminder ids)
            → status SUCCEEDED | PARTIAL | FAILED + audit AUTOMATION_JOB_RUN
```

Idempotency (`organizationId` + `idempotencyKey`):

- Unfinished run → reuse same run (duplicate)
- SUCCEEDED/PARTIAL same key → skip messaging (`SKIPPED_DUPLICATE` / anti-doublon)
- Examples: `outstanding-reminder:{yyyy-MM-dd}`, `lease-expiry-batch:{date}`, `maint-tasks-batch:{date}`, `anomaly-batch:{date}`

---

## 3. Kinds

| Kind | Detect | Execute |
|------|--------|---------|
| `OUTSTANDING_REMINDER` | unpaid PENDING/PARTIAL/LATE → draft reminders | `sendMessage` / WhatsApp (Phase E patterns) |
| `LEASE_EXPIRY_REMINDER` | ACTIVE leases ending soon | `createReminder` |
| `MAINTENANCE_ASSIGN_TASK` | OPEN/ASSIGNED tickets | `createTask` (StaffTask) |
| `ANOMALY_ACTION` | analytics `topUrgentIssues` | navigate / task / reminder — **no invented fixes** |

---

## 4. Schema

Migration: `prisma/migrations/20260813120000_ai_automations/`

- Enums: `AiAutomationKind`, `AiAutomationRunStatus`
- Models: `AiAutomationRule`, `AiAutomationRun`
- Relations on `Organization` + `User`
- Defaults: `enabled=false`, `autoExecute=false`

---

## 5. Service / tools

- Service: `src/modules/ai/ai.automation.service.ts`
- Pending: `APPROVE_AUTOMATION_RUN` in `ai.pending-actions.ts`
- Confirm: `AiService.confirmAction` → `automations.approveAndExecute`
- Tools: `proposeOutstandingReminderAutomation`, `proposeLeaseExpiryReminders`, `proposeMaintenanceTasksFromTickets`, `proposeAnomalyActions`, `listAutomationRuns`

FR intents (local):

- « automatise les relances » / « lance l'automatisation impayés »
- « rappels d'échéance » / « baux qui expirent »
- « crée des tâches pour les tickets »
- « anomalies » + « automatis|propose des actions »

Phase E coexistence: if message contains **automatis**, prefer Phase H tool; classic « prépare les relances » (+ contrat + impayés) keeps Phase E plan.

---

## 6. Permissions

| Step | Permission |
|------|------------|
| Propose | `AI_USE` (chat gate) |
| Execute sends | `MESSAGE_SEND` at execute time |
| Create tasks | `TASK_CREATE` (fallback OWNER/MANAGER + `AI_USE`) |
| `autoExecute=true` rules | OWNER only |

Org isolation always (`organizationId` on every query).

---

## 7. Files

| File | Role |
|------|------|
| `prisma/schema.prisma` | enums + models |
| `prisma/migrations/20260813120000_ai_automations/` | SQL |
| `src/modules/ai/ai.automation.service.ts` | detect/propose/execute |
| `src/modules/ai/ai.pending-actions.ts` | `APPROVE_AUTOMATION_RUN` |
| `src/modules/ai/ai.tools.ts` | tools + intents |
| `src/modules/ai/ai.service.ts` | confirm + Phase E priority |
| `tests/unit/ai.automation.test.ts` | unit |
| `qa-e2e/ai_e2e_automations_test.ps1` | E2E |

---

## 8. E2E

```powershell
powershell -File qa-e2e/ai_e2e_automations_test.ps1
```

Asserts: login → propose outstanding automation → pending `APPROVE_AUTOMATION_RUN` or 0 items → confirm with real status (no fake « envoyé » without ids) → second propose same day → duplicate/skip.
