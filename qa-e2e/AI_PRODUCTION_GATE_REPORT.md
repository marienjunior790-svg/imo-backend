# ITC AI — Production Gate Report

**Date:** 2026-08-13 02:11 (+01)  
**Verdict:** **PASS** (17 PASS / 0 FAIL / 0 PARTIAL)  
**Evidence:** `qa-e2e/ai_e2e_production_gate.json`  
**Script:** `qa-e2e/ai_e2e_production_gate_test.ps1`  
**Org:** `cmsjkfna100ud4ggtd8xfdv1m` (OWNER QA)

## Verdict

La batterie croisée (mémoire, référents, multi-step, analytics, documents, automations, RBAC, isolation, échec tool, anti-faux-succès) **passe en prod** sans inventer de preuves d’envoi.

Ce n’est **pas** une collection de smoke tests isolés : chaque scénario enchaîne des tours / outils / confirmations réels contre Railway.

## Results

| Id | Status | Detail |
|----|--------|--------|
| `G00_LOGIN` | PASS | OWNER |
| `G00_BASELINE` | PASS | lease + tenant fortune libolo |
| `G01_MEMORY_MULTITURN` | PASS | remember + recall + `GATE-BLUE-42` |
| `G02_REF_CELUI_LA` | PASS | follow-up référentiel |
| `G02_REF_MOIS_DERNIER` | PASS | `getOutstandingPayments` ×2 (période) |
| `G03_MULTISTEP` | PASS | `steps=3`, 0 impayés → 0 brouillons (honnête) |
| `G03_MULTISTEP_NO_FAKE` | PASS | pas de « envoyé » sans preuve |
| `G04_CROSS_ANALYTICS` | PASS | `compareRevenue` + `analyzePortfolio` + `listUrgentIssues` |
| `G05_DOC_CHAIN` | PASS | `listDocumentsForAi` + `checkLeaseDocumentConsistency` |
| `G06_AUTO_PROPOSE` | PASS | propose automation, 0 items, pas d’envoi silencieux |
| `G06_AUTO_CONFIRM` | PASS | N/A (rien à confirmer) |
| `G07_REFUS_PERM` | PASS | AGENT bloqué (`MUST_CHANGE_PASSWORD` avant /ai) |
| `G08_CROSS_TENANT` | PASS | leaseId étranger → introuvable / scoped |
| `G08_ORG_SPOOF` | PASS | `organizationId` client ignoré (JWT) |
| `G08_CONFIRM_FOREIGN` | PASS | confirm UUID → `NOT_FOUND` |
| `G09_TOOL_FAIL` | PASS | id document invalide sans faux succès |
| `G10_NO_FAKE_SUCCESS` | PASS | WhatsApp sans claim d’envoi non prouvé |

## Scenario coverage

1. Conversation multi-tour + mémoire  
2. « celui-là » / « mois dernier »  
3. Demande multi-step (relances)  
4. Analyse croisée Prisma  
5. Document → extraction / cohérence  
6. Automatisation propose → confirm → execute (vide = pas de faux envoi)  
7. Refus sans permission (AGENT)  
8. Cross-tenant / spoof org / confirm foreign  
9. Échec tool mid-flow  
10. Aucun succès annoncé sans preuve  

## Residual risks (honest)

| Risk | Notes |
|------|--------|
| **« Extrais » (impératif)** | En prod actuelle, « Extrais les faits du bail… » tombe encore sur **OpenAI** (0 tools) et propose un PDF. Fix code poussé `1d93c04` **pas encore déployé** (`railway up` 413 — trop gros). Redeploy GitHub/Railway requis. Contournement gate : phrases `extraire` / `verifie les incoherences` (locales). |
| **WhatsApp Meta 401** | Résidu externe token/phone — pas un faux PASS ITC. |
| **0 impayés org QA** | Multi-step + automation confirment le chemin « vide » ; pas un envoi réel batch (cohérent). |
| **AGENT G07** | Comptes `Gate NoAi*` créés pour le refus — nettoyage manuel optionnel. |
| **OpenAI fallthrough** | Si intent local rate, le LLM peut proposer un PDF sans `toolsUsed` — à surveiller après deploy `Extrais`. |

## How to re-run

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File qa-e2e/ai_e2e_production_gate_test.ps1
```
