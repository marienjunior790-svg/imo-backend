# PHASE G — Document comprehension architecture

Date: 2026-08-13  
Scope: Analyse documentaire **honête** basée sur métadonnées Prisma (Document / Lease / Payment + URLs Cloudinary).  
Phases C–F (memory / context / reminder plan / analytics / WhatsApp) : **non cassées** (branchement additif).

---

## 1. What works (PASS)

| Capability | Tool / method | Source of truth |
|------------|---------------|-----------------|
| Lister documents analysables | `listDocumentsForAi` | `Document` + `lease.contractPdfUrl` + `payment.receiptPdfUrl` (IDs réels) |
| Résumer | `summarizeDocument` | Parties, loyer, dates, statut, URL Cloudinary ; extrait si `lease.terms` |
| Extraire faits structurés | `extractDocumentFacts` | Relations Prisma — **jamais inventés** |
| Q&A sur dossier | `askAboutDocument` | Uniquement champs présents dans les faits ; sinon message d’indisponibilité |
| Incohérences rule-based | `checkLeaseDocumentConsistency` | Loyer bail vs `apartment.rentAmount`, autre bail ACTIVE autre locataire, statut vs dates / signature / logement AVAILABLE |
| Comparer **deux baux** | `compareDocuments` + `leaseIdA` + `leaseIdB` | Diffs sur faits structurés |

Réponses FR via `formatToolResultForLocalReply` : cite `documentId` / `leaseId` / `paymentId` / URL ; annonce clairement l’absence d’OCR.

## 2. NOT_SUPPORTED (ne pas revendiquer PASS)

| Capability | Status |
|------------|--------|
| OCR / extraction texte complète d’un PDF Cloudinary | **NOT_SUPPORTED** (pas de `pdf-parse` ; pas de fetch+parse buffer) |
| RAG / index vectoriel / recherche sémantique | **NOT_SUPPORTED** |
| Comparaison générique de deux PDFs / uploads arbitraires | **NOT_SUPPORTED** (`Comparaison documentaire non encore disponible.`) sauf 2 `leaseId` |
| Vision OpenAI sur PDF (hors images déjà supportées ailleurs) | **NOT_SUPPORTED** dans Phase G |
| Persistence `AiDocumentInsight` | **non** — insights **éphémères** (pas de migration) |

## 3. Architecture

```
Prisma (org-scoped Document | Lease | Payment)
  → AiDocumentsIntelService
  → structured JSON (facts / summary / inconsistencies)
  → formatToolResultForLocalReply (FR, sources, NOT_SUPPORTED explicite)
```

Pas de fake OCR. Si seul l’URL Cloudinary est connu : résumé métadonnées + `textExtraction: NOT_SUPPORTED | METADATA_ONLY` (ou `BUFFER_EXCERPT` si `terms`).

## 4. Intents FR (`resolveLocalToolIntents`)

| Pattern | Tool |
|---------|------|
| résumé + (contrat\|document\|pdf\|reçu\|avis) | `summarizeDocument` |
| extrait\|extraire + document/contrat | `extractDocumentFacts` |
| incohérence\|incoherent\|vérifie le contrat | `checkLeaseDocumentConsistency` |
| compare + (contrats\|documents\|bail) | `compareDocuments` |
| « dans le contrat » / « sur le reçu » (+ cuid) | `askAboutDocument` |
| liste des documents / documents analysables | `listDocumentsForAi` |

Priority : **Phase E** `detectPaymentReminderPlan` reste **avant** la boucle d’intents dans `ai.service.ts`.  
Phase G exclut le vol d’intent `getDashboardSummary` / `getContracts` / `analyzePortfolio` sur « résume mon contrat ».

## 5. Files

| File | Role |
|------|------|
| `src/modules/ai/ai.documents-intel.service.ts` | Service org-scoped |
| `src/modules/ai/ai.tools.ts` | Tools + intents + formatters |
| `src/modules/ai/ai.documents.ts` | Catalog génération PDF (inchangé Vague 1/2) |
| `tests/unit/ai.documents-intel.test.ts` | Faits, incohérences, compare, intents |
| `qa-e2e/AI_INTELLIGENCE_PHASE_G_DOCUMENTS.md` | Ce livrable |
| `qa-e2e/ai_e2e_documents_test.ps1` | Smoke optionnel |

## 6. Constraints

- Pas de migration Prisma
- Pas de claim RAG/OCR PASS
- Org-scoped uniquement
- Reminder plan Phase E prioritaire

## 7. Verification

```bash
npm run lint
npx jest --config jest.config.cjs tests/unit/ai.documents-intel.test.ts
```
