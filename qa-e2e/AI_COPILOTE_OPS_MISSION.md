# Intelligence ITC — Copilote opérationnel (post-mission)

**Date:** 2026-08-11  
**Baseline E2E:** 14 PASS / 4 FAIL / 4 NOT_SUPPORTED / 1 PARTIAL  
**Prod Railway:** `fortunate-beauty` / `imo-backend` → `imo-backend-production-d2d1.up.railway.app`  
**Commits déployés:**
- `43227d8` feat(ai): operational copilote intents, TTS harden, lease/message tools
- `c2c6b37` fix(ai): paiements intent + clearer TTS billing errors
- `13b846a` fix(ai): create-lease vs PDF routing and extract message/lease args
- `acdd796` fix(ai): parse au locataire Name for sendTenantMessage args

---

## 1. Causes racines des FAIL baseline

| FAIL | Cause | Correction |
|------|--------|------------|
| Mes immeubles / logements | Intents `getBuildings`/`getUnits` non déployés ; fallback « pas reconnu » | Déployé + verified tools |
| Mes paiements | Intent ne matchait que revenu/financ/encaiss | Intent `paiements` → `getFinancialSummary` |
| TTS HTTP 500 puis 400 | OpenAI **crédits épuisés (429)** ; flag TTS=true car clé présente | Harden route (audit non-bloquant) + message billing clair. **PASS impossible tant que billing OpenAI non rechargé** |

---

## 2. Fonctionnalités nouvellement supportées

| Capacité | Statut |
|----------|--------|
| Lecture immeubles / logements / paiements (tools) | **PASS** en prod |
| Création bail métier via IA + confirmation | **PASS** (DRAFT via `LeaseService.create`) |
| Message texte locataire (portail) via IA + confirmation | **PASS** (`NotificationCenterService.sendMessage`) |
| TTS `/ai/speak` | **FAIL** (billing OpenAI) |
| Audio/image → locataire | **NOT_SUPPORTED** (modèle `Message` text-only) |

---

## 3. Tools ajoutés

| Tool | Type | Effet |
|------|------|--------|
| `proposeCreateLease` | propose | Valide tenant/logement/dates ; pending `CREATE_LEASE` |
| `proposeSendTenantMessage` | propose | Résout locataire + body ; pending `SEND_TENANT_MESSAGE` |

Confirm :
- `CREATE_LEASE` → `LeaseService.create` (org-scopé)
- `SEND_TENANT_MESSAGE` → `NotificationCenterService.sendMessage`

---

## 4. APIs / services réutilisés (pas de 2e métier)

- `LeaseService.create` / `POST` logique baux existante
- `NotificationCenterService.sendMessage` / `POST /notification-center/messages`
- Prisma reads existants pour tools lecture

---

## 5. Fichiers modifiés

- `src/modules/ai/ai.tools.ts`
- `src/modules/ai/ai.service.ts`
- `src/modules/ai/ai.fallback.ts`
- `src/modules/ai/ai.pending-actions.ts`
- `src/modules/ai/ai.routes.ts`
- `src/infrastructure/openai/openai.client.ts`
- `tests/unit/ai.tools-local.test.ts`, `ai.fallback.test.ts`
- Preuves : `qa-e2e/ai_e2e_*.json`, `AI_E2E_INTELLIGENCE_REPORT.md`

---

## 6–7. Commit + déploiement

Pushed `main` → GitHub `imo-backend`  
Railway **fortunate-beauty** deployments **SUCCESS** on hashes above (verified via `railway deployment list`).

---

## 8–9. Preuves actions réelles (post-deploy)

### Lecture (phase 1)
- `Mes immeubles` → `tools=getBuildings` **PASS**
- `Mes logements` → `tools=getUnits` **PASS**
- `Mes paiements` → `tools=getFinancialSummary` **PASS**

### Création contrat (phase 3)
- Propose `CREATE_LEASE` pending OK
- Leases **3 → 4** après confirm (**PASS**)
- Logement test `E2E-AI-*` AVAILABLE créé pour le test
- Consultation follow-up : réponse guide UI (howto) plutôt que dump du bail → **PARTIAL** qualité contexte

### Message (phase 4)
- `messageId=cmsovae5d00ugwh6kr9ayjvq6`
- `recipient=cmsl81ss500ukwnm1xgckstuy` (fortune portail)
- inbox `0 → 1` **PASS**

### TTS (phase 2)
- Flag tts=true mais OpenAI **429 no credits** → **FAIL** (infra billing, pas logique métier)

### Audio/image sortants (phases 5–6)
- **NOT_SUPPORTED** — `Message` n’a que `body` string (pas média)

---

## 10. Tableau AVANT → APRÈS (focus mission)

| Domaine | AVANT | APRÈS |
|---------|-------|-------|
| Immeubles / logements / paiements | FAIL | **PASS** |
| Création contrat IA | NOT_SUPPORTED | **PASS** (confirm + N+1) |
| Message texte IA | NOT_SUPPORTED | **PASS** (message DB) |
| TTS | FAIL 500 | **FAIL** billing 429 (erreur claire) |
| Audio/image → locataire | NOT_SUPPORTED | **NOT_SUPPORTED** (architecture) |
| PDF propose | PARTIAL | inchangé (hors scope critique) |

### Compteurs opérationnels rejoués (ops actions run `acdd796`)

| | |
|--|--:|
| PASS | 5 |
| FAIL | 1 (TTS) |
| NOT_SUPPORTED | 0 in that script |
| PARTIAL | 0 (consult loosely passed; qualité = PARTIAL) |

### Lecture smoke post-deploy

| | |
|--|--:|
| PASS | 3 (R01/R02/R06) |
| FAIL | 1 (TTS) |
| NOT_SUPPORTED | 4 (create/message discovery quirk in smoke script + media out) |

---

## Sécurité

- Pending actions scopées `organizationId` + `userId`
- Create lease / send message utilisent services métier org-scoped
- Pas de contournement RBAC : routes AI restent `orgStaffPipeline` + `AI_USE`
- Locataire sans `userId` portail → message refusé proprement (pas d’invention)

---

## Reste pour copilote 100 %

1. **Recharger crédits OpenAI** → retester `/ai/speak` (mp3 réel)
2. Améliorer follow-up « contrat que tu viens de créer » (contexte pending / lastLeaseId) — éviter howto
3. Media sortant : étendre modèle Message **ou** stocker URL Cloudinary dans `body` (produit à trancher)
4. Multi-tour « envoie-lui un rappel » après impayés une fois message tool + contexte locataire reliés

**Objectif architecture** COMPRENDRE → TOOL → API → AGIR → VÉRIFIER : **atteint pour lecture + création bail + message texte**. TTS bloqué billing. Media out non supporté par schéma actuel.
