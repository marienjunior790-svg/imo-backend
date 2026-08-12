# PHASE E — Agent multi-étapes (relances impayés)

Date: 2026-08-13  
Scope: Plan déterministe « impayés → contrats → brouillons de relance » + confirmation batch  
WhatsApp / memory / context (Phases B–D) : **non réécrits** (branchement additif uniquement).

---

## 1. User request supportée

> « Trouve les locataires qui ont des impayés, vérifie leurs contrats et prépare les relances. »

## 2. Behavior

1. `detectPaymentReminderPlan(message)` — vrai si **impayés/retard** + **contrat/bail** + **relance/prépare/prévenir**.
2. `runPaymentReminderPlan` exécute 3 étapes visibles (`AiChatResponse.steps`) :
   - **A** `getOutstandingPayments` (Prisma réel, PENDING|PARTIAL|LATE) → locataires uniques
   - **B** baux `ACTIVE` (sinon `DRAFT` seul) pour ces `tenantId`s
   - **C** brouillons de relance — **aucun envoi** tant que non confirmé
3. Réponse type « Terminé. • N … • Contrats vérifiés … • M relances … • K interventions » + `pendingAction` si M>0.
4. Si N=0 : message explicite, **pas** de `pendingAction`, **pas** de faux brouillons.

## 3. Pending batch

| Champ | Valeur |
|-------|--------|
| Type | `SEND_BATCH_TENANT_REMINDERS` |
| Payload | `items[]` : `{ tenantId, tenantName, recipientUserId?, toPhone?, body, subject?, channel }` |
| Canal | `IN_APP` si `tenant.userId` ; sinon `WHATSAPP` si configuré + téléphone valide ; sinon **intervention** (hors batch) |

Confirm (`ai.service.ts`) : `MESSAGE_SEND` → `sendMessage` / `sendWhatsAppMessage` par item → compteurs succès/échecs (+ provider ids WA). Jamais de succès sans envoi réel.

## 4. Files

| File | Role |
|------|------|
| `src/modules/ai/ai.orchestrator.ts` | `detectPaymentReminderPlan` + `runPaymentReminderPlan` |
| `src/modules/ai/ai.pending-actions.ts` | type + `items` payload |
| `src/modules/ai/ai.service.ts` | wire avant intent loop ; `steps`/`planSummary` ; confirm batch |
| `tests/unit/ai.orchestrator.test.ts` | detect + empty + 2 tenants / 1 canal |
| `qa-e2e/AI_INTELLIGENCE_PHASE_E_AGENT.md` | ce livrable |

## 5. Constraints

- Pas de faux outstanding
- Pas d’envoi silencieux
- Scoped org (`organizationId` JWT / Prisma)
- Template FR : `Bonjour {name}, … ({amount} XAF, période {period}). … — ITC`

## 6. PASS / FAIL

| Check | Status |
|-------|--------|
| Detect multi-step intent | **PASS** (unit) |
| Plan N=0 sans pending | **PASS** (unit) |
| Plan 2 tenants → 1 draft + 1 intervention | **PASS** (unit) |
| Confirm batch réel | **PASS** (code path) |
| Typecheck + jest | voir vérification |

## 7. Blocked / hors scope

- Envoi automatique sans confirmation utilisateur
- Invention de téléphones / userId
- Réécriture WhatsApp standalone / mémoire Phase C–D
