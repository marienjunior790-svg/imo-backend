# Intelligence ITC — E2E fonctionnel (2026-08-11)

## Contexte

| Champ | Valeur |
|-------|--------|
| Compte | `ugcmanagemnet007@gmail.com` |
| Rôle | **OWNER** |
| userId | `cmsjkfnaa00uf4ggtuud22sho` |
| organizationId | `cmsjkfna100ud4ggtd8xfdv1m` |
| API | `https://imo-backend-production-d2d1.up.railway.app/api/v1` |
| Mode IA | `openai` (vision/stt/tts = true) |
| Preuve JSON | `qa-e2e/ai_e2e_intelligence_report.json` |
| Script | `qa-e2e/ai_e2e_intelligence_test.ps1` |

### Baseline API (réelle)

| Ressource | Count |
|-----------|------:|
| Immeubles | 1 |
| Logements | 2 |
| Locataires | 3 |
| Contrats | 2 |
| Impayés (PENDING/PARTIAL/LATE) | 0 |
| Agents (endpoint list) | 0* |

\*Le chat `getTeamMembers` a listé **8 agents** — écart endpoint `/team/agents` vs outil IA.

### Règle de verdict

- **PASS** = intention + outil + données API cohérentes (ou multimodal réellement disponible / bytes OK)
- **FAIL** = fausse réussite, intention non reconnue alors que l’outil existe, ou erreur runtime
- **NOT_SUPPORTED** = capacité absente du code IA (pas de simulation)
- **PARTIAL** = comportement incomplet mais pas mensonger

---

## Matrice outils IA (réalité code)

| Tool | Type | API / source |
|------|------|----------------|
| getBuildings | READ | Prisma buildings |
| getUnits | READ | Prisma apartments |
| getVacantUnits | READ | apartments AVAILABLE |
| getTenants | READ | Prisma tenants |
| getTeamMembers | READ | TeamMembersService |
| getContracts | READ | Prisma leases |
| getOutstandingPayments | READ | payments unpaid |
| getFinancialSummary | READ | AiContext |
| getDashboardSummary | READ | AiContext |
| getExpiringContracts | READ | context |
| proposeGenerateLeasePdf | ACTION propose | PDF after confirm — **pas** `lease.create` |
| proposeGeneratePaymentReceipt | ACTION propose | PDF after confirm |
| proposeGeneratePaymentNotice | ACTION propose | PDF after confirm |

**Absent :** create lease, send message/audio/image to tenant.

---

## Résultats E2E

### 2. Compréhension / lecture

| ID | Demande | Tool attendu | Verdict | Preuve |
|----|---------|--------------|---------|--------|
| R01 | Mes immeubles | getBuildings | **FAIL** | Reply « Je n’ai pas reconnu… » + dump dashboard, **aucun tool** |
| R02 | Mes logements | getUnits | **FAIL** | Idem |
| R03 | Mes locataires | getTenants | **PASS** | `tools=[getTenants]` — 3 noms réels |
| R04 | Mes agents | getTeamMembers | **PASS** | 8 agents listés |
| R05 | Mes contrats | getContracts | **PASS** | 2 baux ACTIVE + ids |
| R06 | Mes paiements | getFinancial* | **FAIL** | « pas reconnu » sans tool |
| R07 | Mes impayés | getOutstandingPayments | **PASS** | tool OK — 0 impayé (cohérent baseline) |
| R08 | Vacants | getVacantUnits | **PASS** | tool OK — aucun vacant |
| R09 | Patrimoine | getDashboardSummary | **PASS** | 2 biens, 371 000 XAF, 50 % |
| R10 | Encaissé ce mois | getFinancialSummary | **PASS** | 371 000 XAF |

**Cause R01/R02/R06 :** runtime prod renvoie encore le fallback *« Je n’ai pas reconnu une demande précise »*. Les intents locaux `getUnits` / `getBuildings` + suppression de cette phrase existent en **working tree local** mais **ne sont pas déployés** sur Railway.

### 3–4. Création / consultation contrat

| ID | Verdict | Vérification réelle |
|----|---------|---------------------|
| M01_CREATE_LEASE | **NOT_SUPPORTED** | Count leases avant/après = **2** (delta 0). IA propose liste PDF, ne crée pas de bail. |
| M02_CONSULT_CREATED | **PASS** | Pas d’invention d’un bail « que je viens de créer ». |

### 5–8. Messagerie / médias sortants

| ID | Verdict | Cause |
|----|---------|-------|
| M03_SEND_TEXT | **NOT_SUPPORTED** | Aucun tool AI → `notification-center` |
| M04_SEND_AUDIO | **NOT_SUPPORTED** | `/ai/transcribe` = entrée user→IA seulement |
| M05_SEND_IMAGE | **NOT_SUPPORTED** | `/ai/vision` = entrée user→IA seulement |

Pas de fausse affirmation « message envoyé » dans ces runs.

### 9–10. Multimodal (flags + TTS)

| ID | Verdict | Détail |
|----|---------|--------|
| MM01_STT | **PASS** | flag status true |
| MM02_VISION | **PASS** | flag status true |
| MM03_TTS | **PASS** | flag status true |
| MM04_TTS_BYTES | **FAIL** | `POST /ai/speak` → **HTTP 500** (audio non généré malgré flag) |

Uploads vision/transcribe fichiers réels : **non rejoués** dans ce run API (flags OK ; exécution binaire TTS = FAIL).

### 11. Multi-tour

| ID | Verdict | Détail |
|----|---------|--------|
| C01_MULTITURN_REMINDER | **PASS** (anti-mensonge) | « Envoie-lui un rappel » → pas de fake send. Compréhension contexte faible (fallback générique). |

### 12. Action PDF supportée

| ID | Verdict | Détail |
|----|---------|--------|
| A01_PROPOSE_LEASE_PDF | **PARTIAL** | Liste les 2 baux ; **pas** de `pendingAction` sans id explicite |

---

## Synthèse

| | Count |
|--|------:|
| PASS | 14 |
| FAIL | 4 |
| NOT_SUPPORTED | 4 |
| PARTIAL | 1 |
| **Total** | **23** |

### Verdict global

**PARTIAL / FAIL sur le périmètre « copilote métier complet ».**

Ce qui marche réellement aujourd’hui en prod :

- Lecture locataires / agents / contrats / impayés / vacants / patrimoine / encaissements via **vrais tools**
- Pas de création de bail via IA (honnête)
- Pas d’envoi message/audio/image via IA (honnête dans ce run)
- Multimodal **annoncé** (STT/Vision/TTS flags) mais **TTS runtime 500**

Ce qui bloque le brief :

1. **Deploy manquant** des intents logements/immeubles/paiements + fallback « pas reconnu »
2. **Création de contrat** (entité lease) = hors scope AI actuel
3. **Messagerie sortante** = hors scope AI actuel
4. **TTS** flag OK mais exécution **500**
5. PDF contrat = propose par id, confirm pas toujours déclenché sur formulation vague

### Next steps recommandés

1. Déployer le backend AI local (intents `getUnits`/`getBuildings`, fallback) sur `fortunate-beauty`
2. Brancher un tool `sendTenantMessage` → `POST /notification-center/messages` **si** le produit le veut (avec confirmation)
3. Investiguer 500 sur `/ai/speak`
4. Rejouer E2E après deploy ; ajouter tests fichier `/ai/transcribe` + `/ai/vision` avec fixtures
