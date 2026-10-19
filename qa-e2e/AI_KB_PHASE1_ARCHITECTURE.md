# ITC AI — PHASE 1 : Diagnostic architecture IA existante

**Date :** 2026-10-19  
**Code modifié :** aucun  
**Apps de référence :**

| Surface | Identifiant | Chemin |
|---------|-------------|--------|
| Mobile Flutter | package `immo_tec`, Android `cg.immo.tec.immo_tec` | `imo-mobile/` |
| Backend API | Railway / Express | `imo-backend/` |
| Hors périmètre | KMP `cg.immo.tec.itc` | `itc-kmp/` — **ne pas confondre** |

---

## 1. Moteur IA

| Couche | Technologie | Statut |
|--------|-------------|--------|
| LLM | OpenAI Chat Completions + tools (`openai` ^4.73, défaut `gpt-4o`) | **Existe** |
| Mode dégradé | `AI_PROVIDER=none` → fallback local + intents outils | **Existe** |
| STT / TTS / Vision | Whisper, tts-1, vision images | **Existe** |
| Embeddings / vector store | — | **Absent** |
| LangChain / LlamaIndex | — | **Absent** |

Preuves : `imo-backend/package.json`, `src/infrastructure/openai/openai.client.ts`, `src/modules/ai/ai.service.ts`, `ai.fallback.ts`.

---

## 2. Prompts et contexte métier

Composition dans `ai.service.ts` → `ASSISTANT_PROMPT` :

| Pack | Fichier | Rôle |
|------|---------|------|
| Assistant + Data-First | `ai.service.ts` + `ai.data-first.ts` | Copilote ; faits org avant invention |
| Knowledge métier ITC | `ai.knowledge.ts` | Graphe rôles/entités, limites OCR/RAG |
| Guide app | `ai.app-guide.ts` / `ai.app-manual.ts` | Mode d’emploi UI |
| Docs formation Phase 0 | Google Docs (snapshots locaux) | **Non branchés** au runtime |

`ITC_KNOWLEDGE_PROMPT` déclare déjà explicitement : OCR PDF / RAG = **NOT_SUPPORTED**.

---

## 3. Services de conversation

- Orchestrateur : `AiService` (`ai.service.ts`)
- Routes : `ai.routes.ts` montées sous `/ai` (auth `orgStaffPipeline`)
- Endpoints clés : `POST /ai/chat`, `/ai/transcribe`, `/ai/vision`, `/ai/speak`, `/ai/analyze`, actions confirm/cancel, suggestions, memory, forecast
- Continuité : historique client + `AiSessionContext` + `AiMemoryEntry` (pas de table transcript durable)

---

## 4. API / outils données immobilières (org authentifiée)

Outils Prisma scopés JWT (`ai.tools.ts`) — échantillon :

`getDashboardSummary`, `getVacantUnits`, `getOutstandingPayments`, `getUnits`, `getBuildings`, `getContracts`, `getTenants`, `getFinancialSummary`, `analyzePortfolio`, `compareRevenue`, `listUrgentIssues`, docs metadata, propose/confirm PDF & WhatsApp & automations, mémoire.

Isolation : `organizationId` serveur uniquement ; `stripClientOrganizationIds` (Data-First).

---

## 5. Recherche documentaire / sémantique

| Capacité | Statut | Preuve |
|----------|--------|--------|
| Intelligence docs (métadonnées Prisma) | Existe | `ai.documents-intel.service.ts` |
| OCR PDF / RAG / embeddings | **NOT_SUPPORTED** | Outils + knowledge prompt |
| Vector DB / pgvector | Absent | `package.json` |
| Cartes formation Phase 0 | Snapshots seulement | `qa-e2e/knowledge-sources/phase0-exports/` |

---

## 6. Stockage / indexation

Postgres + Prisma : données métier, `AiMemoryEntry`, `AiSessionContext`, `AiPendingAction`, automations, quotas.  
Cloudinary : fichiers.  
Indexation sémantique formation : **inexistante**.

---

## 7. Permissions / isolation

- `/ai` : rôles staff org (OWNER, ORG_ADMIN, MANAGER, ACCOUNTANT) + `AI_USE` + capability `AI`
- AGENT exclu du pipeline HTTP copilote (même si matrice RBAC mentionne AI_USE)
- Org isolation stricte outils + audits `AI_CHAT` / `AI_USE`
- Actions sensibles : propose → confirm

---

## 8. Client mobile (`immo_tec`)

`imo-mobile/lib/features/ai/` → JWT via `apiClientProvider` → `/ai/*` (chat, STT, vision, speak, confirm, LIA).  
OCR/STT on-device en complément (ML Kit / speech_to_text).

---

## 9. Tests existants (AI)

Unit : `ai.data-first`, `ai.security`, `ai.knowledge`, `ai.documents-intel`, `ai.fallback`, `ai.tools-local`, `ai.memory`, orchestrateur, analytics, automations, phases J/K, etc.  
QA : `qa-e2e/AI_*.md` + scripts PowerShell gate.

---

## 10. Verdict architecture

ITC AI est un **copilote CRM sur données Prisma org** (OpenAI optionnel, fallback local fort), **pas** un système RAG formation.

Pour PHASE 2 : **ne pas reconstruire** le moteur chat/outils ; **ajouter** un module de connaissances formation (retrieval) branché en amont du prompt, séparé des données privées org et des instructions système prioritaires.
