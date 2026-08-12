# PHASE F — Intelligent analytics & synthesis

Date: 2026-08-13  
Scope: Cross-domain KPIs calculated in Prisma services → structured results → deterministic French formatter (no invented stats in the LLM).

---

## 1. Architecture

```
Prisma (org-scoped)
  → AiAnalyticsService (calculations)
  → structured JSON
  → formatToolResultForLocalReply (FR, numbers, asOf / periods / dataSources)
```

OpenAI may only rephrase if already on the tool path; local formatter is preferred and verifiable.

## 2. Service — `src/modules/ai/ai.analytics.service.ts`

| Method | Output highlights |
|--------|-------------------|
| `portfolioSnapshot` | buildings/units/occupancy (1 decimal), leases, outstanding remaining, collectedThisMonthXaf, `asOf`, `currency: XAF` |
| `compareRevenuePeriods` | periodA/B, revenueA/B, deltaXaf, deltaPct (null if A=0), direction |
| `buildingsOutstandingRanking` | ranked by outstandingTotalXaf desc |
| `revenueDropExplanation` | real factors or `{ sufficient: false, reason }` |
| `topUrgentIssues` | LATE, PENDING past due, leases ending/expired, high maintenance, vacant sans bail |
| `portfolioSynthesis` | snapshot + top 3 buildings + top urgent + period compare + `dataSources[]` |

Pure helpers: `src/modules/ai/ai.analytics.math.ts` (`occupancyRatePct`, `revenueDelta`, `remainingXaf`, `utcThisMonth` / `utcLastMonth`).

### Sample formulas

**Occupancy (1 decimal):**

\[
\text{occupancyRate} = \mathrm{round}\left(\frac{\text{occupiedUnits}}{\text{unitsCount}} \times 1000\right) / 10
\]

Empty parc → `0` (never NaN).

**Revenue delta (compare B vs A):**

\[
\Delta = \text{revenueB} - \text{revenueA},\quad
\Delta\% = \begin{cases}
\mathrm{null} & \text{if revenueA}=0 \\
\mathrm{round}(\Delta / \text{revenueA} \times 1000)/10 & \text{otherwise}
\end{cases}
\]

**Outstanding remaining:** `max(0, amount − amountPaid)` for PENDING|PARTIAL|LATE.

**Collected for a period (compare):** sum `amountPaid` where status ∈ {PAID, PARTIAL} and `periodMonth`/`periodYear` match (same period fields as `getOutstandingPayments`).

**Collected this month (snapshot):** PAID|PARTIAL where `periodMonth/Year = UTC month` **OR** `paidAt` in UTC month bounds.

## 3. Tools (`ai.tools.ts`)

| Tool | Maps to |
|------|---------|
| `analyzePortfolio` | `portfolioSynthesis` (or `snapshot` if `mode=snapshot`) |
| `compareRevenue` | `compareRevenuePeriods` (default last vs this UTC month) |
| `rankBuildingsByOutstanding` | ranking |
| `explainRevenueChange` | `revenueDropExplanation` |
| `listUrgentIssues` | `topUrgentIssues` |

FR intents in `resolveLocalToolIntents` (payment-reminder plan still first in `chatLocalWithTools`):

- « quel immeuble » + impayé → `rankBuildingsByOutstanding`
- compare + (revenu\|encaiss\|mois) → `compareRevenue`
- pourquoi + (revenu\|baisse) → `explainRevenueChange`
- résumé + (parc\|situation\|patrimoine) / « situation de mon parc » → `analyzePortfolio`
- problèmes urgents / plus urgents → `listUrgentIssues`

No new pending actions. `hasLocalDataIntent` picks these via `resolveLocalToolIntents`.

## 4. Files

| File | Role |
|------|------|
| `src/modules/ai/ai.analytics.math.ts` | Pure math / periods |
| `src/modules/ai/ai.analytics.service.ts` | Prisma analytics |
| `src/modules/ai/ai.tools.ts` | Tools + intents + FR formatters |
| `src/modules/ai/ai.service.ts` | Prompt hint for analytics tools |
| `tests/unit/ai.analytics.test.ts` | Math + mocked Prisma + intents |
| `qa-e2e/ai_e2e_analytics_test.ps1` | Optional live E2E |
| `qa-e2e/AI_INTELLIGENCE_PHASE_F_ANALYTICS.md` | This deliverable |

## 5. How to verify E2E mathematically

1. Pick an org with known seed (or compute from API: apartments OCCUPIED/total, payments by status/period).
2. Ask: « Quelle est la situation de mon parc ? » → expect `toolsUsed` includes `analyzePortfolio`.
3. Recompute occupancy: `occupied / units * 100` (1 decimal) must match reply.
4. Ask compare / ranking / explain / urgent → matching tool names; reply must show numbers or explicit `0` / « insuffisant ».
5. **FAIL** if reply invents percentages/amounts while `toolsUsed` is empty.

### Seed note

Do **not** invent payment rows in production. Full math verification needs seed data. If the org is sparse, script marks **BLOCKED/PARTIAL** for exact delta checks while tool routing can still **PASS**.

## 6. PASS / FAIL (unit)

| Check | Status |
|-------|--------|
| occupancyRate exact | unit |
| compareRevenue delta | unit |
| ranking order desc | unit |
| empty org zeros / sufficient:false | unit |
| FR intent phrases | unit |
| Typecheck + jest | run locally |

## 7. Constraints

- No fake stats
- Do not break Phase E orchestrator / memory / WhatsApp
- Org-scoped Prisma only
