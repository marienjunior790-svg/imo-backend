# PHASE A — Audit Intelligence ITC + Architecture proposée

Date: 2026-08-12  
Scope: `src/modules/ai/`, `src/infrastructure/openai/`, RBAC, Prisma  
Aucun code modifié dans cette phase.

---

## 1. Ce qui existait (état réel)

### Surface API (`/api/v1/ai`)
Pipeline staff: JWT + org + subscription + rôles `OWNER|ORG_ADMIN|MANAGER|ACCOUNTANT`.  
**AGENT / TENANT exclus** des routes AI (malgré `AI_USE` éventuellement listé pour TENANT).

| Endpoint | Gate | Rôle |
|----------|------|------|
| `GET /status`, `/suggestions`, `/analysis-types` | `AI_USE` | statut / UX |
| `POST /chat` | `AI_USE` + `ACCESS_AI` | copilote principal |
| `POST /transcribe`, `/vision`, `/normalize`, `/speak` | idem | multimodal |
| `POST /contract` | idem | propose PDF bail |
| `POST /actions/confirm\|cancel` | idem | actions sensibles |
| `GET /forecast`, `POST /analyze` | `AI_USE` + `ACCESS_LIA` | LIA |

### Orchestration actuelle (`AiService.chat`)
1. Accès plan `aiAssistant`
2. Short-circuits PDF (avis / reçu / contrat) — **avant** les tools
3. Guide « comment faire » (app howto)
4. Priorités du jour → fallback local contextuel
5. Si intent local regex **OU** pas d’OpenAI → `chatLocalWithTools`
6. Sinon boucle OpenAI tools (max **4** rounds), fallback local si erreur

**Point critique :** dès qu’un intent local matche, OpenAI est **court-circuité**. GPT ne raisonne pas sur ces demandes.

### Tools (17) — statut réel

**Lecture (fonctionnels)**  
`getDashboardSummary`, `getOutstandingPayments`, `getVacantUnits`, `getUnits`, `getBuildings`, `getContracts`, `getTenants`, `getFinancialSummary`, `getExpiringContracts`, `getTeamMembers`

**Écriture via pendingAction (fonctionnels)**  
`proposeCreateLease`, `proposeGenerateLeasePdf`, `proposeGeneratePaymentReceipt`, `proposeGeneratePaymentNotice`, `proposeSendTenantMessage`, `proposeSendWhatsAppMessage` (Meta si configuré)

**Stub / NOT_SUPPORTED**  
`proposeSendWhatsAppMedia`  
Documents catalogue: inspection / fiche / visite / agent / courrier → `available: false`

### Contexte métier
`AiContextService` : agrégats org (counts, late, vacants, expiring, buildings), cache 60s, injecté en JSON au LLM.  
**Source de vérité** = Prisma / services métier via tools.

### Mémoire
| Type | État |
|------|------|
| History conversation | Client → API (`max 20`, serveur coupe à `AI_MAX_HISTORY=10`) — **OpenAI path only** |
| Pending actions | `Map` **in-memory**, TTL 15 min, scopé org+user |
| Mémoire user/org persistée | **Absente** (aucune table Prisma) |
| Conversation DB | **Absente** |

### Documents
- 3 PDF métier réels (contrat / reçu / avis) via propose→confirm→services
- Vision image GPT : réelle
- PDF OCR / RAG / index sémantique : **absent**

### Sécurité (partiel)
- Isolation `organizationId` sur tools : OK  
- Confirm messages : `MESSAGE_SEND` : OK  
- Confirm PDF / create lease : pas d’assert permission métier dédié  
- `chatLocalWithTools` hardcode parfois `UserRole.OWNER` pour propose PDF  
- Pending non HA (perdu au restart / multi-instance)  
- `extractCuid` = premier cuid trouvé (ambigu)

---

## 2. Verdicts capacité (vision agent)

| Capacité | Verdict | Commentaire |
|----------|---------|-------------|
| Mémoire intelligente | **NOT_IMPLEMENTED** | Pas de store structuré |
| Intent / entités | **PARTIAL** | Regex locaux solides ; pas de classifieur ; context follow-up faible |
| Agent autonome multi-step | **PARTIAL** | Tools 1-shot / max 4 rounds ; pas de plan→verify→replan |
| Recherche / synthèse | **PARTIAL** | Tools lecture OK ; pas de croisement analytique dédié |
| Documents | **PARTIAL** | 3 PDF + vision ; pas RAG |
| Conversation contextuelle | **PARTIAL** | History client ; local path ignore history |
| Automatisations | **PARTIAL** | Propose/confirm manuel ; n8n hors IA |
| Sécurité IA | **PARTIAL** | Org OK ; RBAC confirm incomplet ; pending RAM |

**Synthèse produit :** copilote **outil + règles** opérationnel. **Pas** encore un agent à mémoire persistante, plan multi-étapes et vérification de résultats.

---

## 3. Modifications de cette phase

Aucune (audit uniquement).

## 4. Fichiers inspectés (principaux)

- `src/modules/ai/ai.service.ts`, `ai.tools.ts`, `ai.routes.ts`, `ai.context.service.ts`
- `src/modules/ai/ai.pending-actions.ts`, `ai.fallback.ts`, `ai.documents.ts`, `ai.app-guide.ts`, `ai.schema.ts`, `ai.types.ts`
- `src/infrastructure/openai/openai.client.ts`
- `src/config/env.ts`, `src/shared/rbac/*`
- `prisma/schema.prisma` (aucune table AI/mémoire)

## 5. Migrations / env

Aucune migration dans cette phase.  
Env déjà utilisés : `OPENAI_*`, `AI_*`, `STT_*`, `TTS_*`, `AI_MAX_HISTORY`, `AI_PENDING_ACTION_TTL_MS`, `AI_CONTEXT_CACHE_TTL_MS`.

## 6–7. Tests

Non exécutés (phase lecture seule).  
Référence connue : unitaires tools/pending existants (`tests/unit/ai.tools-local.test.ts`).

## 8. Bloquants connus (hors scope WhatsApp token)

- Pas de couche Memory / Orchestrator
- Intent local bypass OpenAI → limite le raisonnement multi-tour
- Pending actions non persistées
- Pas de RAG documents
- UX agent (étapes / progress) non exposée dans le contrat API actuel

---

# PHASE B (proposition) — Architecture Intelligence Core

À valider **avant** code massif.

```
┌─────────────────────────────────────────────────────────────┐
│ Client (Flutter / API)                                      │
│  history? · sessionId · confirm/cancel · progress UI        │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ AI Orchestrator  (nouveau cœur — enveloppe AiService)       │
│  1. Policy gate (RBAC + feature + org)                      │
│  2. Intent Detection (rules + optional LLM classify)        │
│  3. Context Manager (turn entities + history + refs)        │
│  4. Memory retrieve (user/org facts, gated)                 │
│  5. Plan (read tools → optional write proposes)             │
│  6. Tool Registry + Permission Engine                       │
│  7. Execute + Result Verification                           │
│  8. Response Generation (reply + steps + pendingAction)     │
└───────────────┬─────────────────────┬───────────────────────┘
                │                     │
                ▼                     ▼
     ┌──────────────────┐   ┌──────────────────────────┐
     │ LLM (raisonnement)│   │ Vérité système (Prisma)  │
     │ OpenAI optional  │   │ Services métier ITC      │
     └──────────────────┘   └──────────────────────────┘
```

### Séparation nette
- **LLM** : reformulation, plan, clarification, synthèse — jamais source de vérité chiffrée.
- **Tools / DB** : seuls autorisés à produire chiffres, IDs, envois, PDF.

### Types de mémoire (PHASE C)
| Store | Contenu | Scope | TTL |
|-------|---------|-------|-----|
| Turn / conversation | entités (« celui-là »), derniers tools | `userId`+`orgId`+`sessionId` | courte (session / 24h) |
| User memory | préférences, faits demandés « retiens… » | user+org | explicite / CRUD |
| Org memory | habitudes org (si OWNER) | org | CRUD + audit |
| Métier | Prisma live | org + RBAC | toujours prioritaire |

**Ne pas** logger toute conversation en mémoire longue.

### Contrat API enrichi (sans casser l’existant)
Étendre `AiChatResponse` de façon additive :
```ts
steps?: { id: string; label: string; status: 'pending'|'running'|'done'|'error' }[]
memoryUsed?: boolean
planSummary?: string
```
`pendingAction` / `actions` / `suggestions` / `toolsUsed` **conservés**.

### Ordre d’implémentation (inchangé vs mission)
| Phase | Focus | Risque |
|-------|-------|--------|
| **C** | Tables mémoire + CRUD + tools `remember`/`recall`/`forget` | Migration |
| **D** | Context Manager + follow-ups (« celui-là », mois dernier) | Intent |
| **E** | Orchestrator multi-step + verification + steps UX | Cœur |
| **F** | Tool synthèse croisée (impayés × immeubles) | Lecture |
| **G** | Pipeline documents (extract/summarize) — stub clair si pas d’index | Docs |
| **H** | Automations proposées (pas silent) | Confirm |
| **I** | RBAC confirm + pending Redis/DB + E2E sécu | Sécurité |

### Règles non négociables
- Aucun fake success / tool simulé présenté comme réel
- Toute écriture sensible : PROPOSE → CONFIRM → EXECUTE → JOURNALISE
- Donnée métier Prisma > mémoire > LLM
- Isolation org obligatoire sur chaque tool

### Variables envisagées (phases suivantes)
```
AI_MEMORY_ENABLED=true
AI_ORCHESTRATOR_ENABLED=true   # feature flag soft rollout
AI_SESSION_TTL_HOURS=24
# plus tard documents:
# AI_DOC_INDEX_ENABLED=false
```

---

## Décision demandée

Valider PHASE B pour enchaîner **PHASE C — Mémoire** (migration Prisma + service + tools gated + tests), sans toucher WhatsApp / P0–P1 déjà validés.
