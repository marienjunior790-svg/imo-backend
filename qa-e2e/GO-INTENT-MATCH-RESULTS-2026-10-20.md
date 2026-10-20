# GO-INTENT-MATCH — Résultats (2026-10-20)

**Périmètre :** audit + correction locale + tests — **aucun** commit / push / deploy.  
**Incident prod (`c17e23d`) :** smoke A FAIL (HTTP 200, `toolsUsed=[]`, reply « Nouveau contrat / locataire ») ; B PASS (`getOutstandingPayments`).

---

## Verdict

**PASS WITH LIMITATIONS**

| Couche | Résultat |
|--------|----------|
| Cause racine prouvée | **Oui** |
| Correction locale minimale | **Oui** |
| Tests unitaires ciblés | **23/23 PASS** |
| Smoke prod post-fix | **Non applicable** — fix non déployé ; session JWT expirée (401) au re-smoke |

---

## 1. Diagnostic / cause racine

### Chaîne auditée

`message` → `AiService.chat` → **`handleContractRequest` (avant outils)** → sinon `resolveLocalToolIntents` → `matchCatalogListings` / etc. → reply.

### Preuve (reproductible hors prod)

Message smoke A :

> Trouve-moi un logement de 3 pièces avec un loyer maximal de 300 000 XAF.

| Check | Résultat |
|-------|----------|
| `isCatalogMatchQuestion(A)` | **true** (seek `trouve` + housing `logement`) |
| `mentionsContract(A)` | **false** |
| `parseLeaseFields(A).monthlyRent` | **300000** → `hasLeaseDetails` true |
| Historique session type `[user: crée nouveau contrat, assistant: Nouveau contrat — …]` | `collectLeaseDraftMessages` → **draft.length > 1** (`continuing`) |

**Cause racine :** `handleContractRequest` (`ai.service.ts` ~L377) s’exécute **avant** le routage outils. Si la session a un brouillon « Nouveau contrat », le message de recherche est traité comme **continuation de draft** parce que le loyer/pièces comptent comme `hasLeaseDetails` / contribution — d’où reply `Nouveau contrat — pour quel locataire ?` avec **`toolsUsed: []`**.

Ce n’est **pas** un bug du SQL MatchingService, ni l’absence de câblage `matchCatalogListings` (`resolveLocalToolIntents` le sélectionnait déjà correctement).

### Facteur secondaire (parsing NL)

`parseCatalogMatchDemand` ne capturait pas `maximal` ni `300 000` (espaces) → `maxRent` absent (seuls `minRooms` + currency). Corrigé pour appliquer le filtre budget sans toucher au moteur SQL.

---

## 2. Fichiers modifiés

| Fichier | Pourquoi |
|---------|----------|
| `src/modules/ai/ai.service.ts` | Early-return `shouldSkipLeaseDraftForCatalogSearch(message)` dans `handleContractRequest` |
| `src/modules/ai/ai.catalog-match.ts` | `shouldSkipLeaseDraftForCatalogSearch` ; parse `maximal` + montants espacés |
| `src/modules/ai/ai.tools.ts` | Ne pas empiler `getUnits` quand intent catalogue (évite dump parc org) |
| `tests/unit/ai.intent-match-routing.test.ts` | **Nouveau** — régression smoke A + non-régression 1–7 |
| `tests/unit/ai.catalog-match.test.ts` | Cas `loyer maximal de 300 000 XAF` |

**Non modifié :** MatchingService, filtres SQL, comptages, sémantique empty/eligible.

---

## 3. Tests — commandes et résultats

```text
cd imo-backend
npx jest --config jest.config.cjs --runInBand ^
  tests/unit/ai.intent-match-routing.test.ts ^
  tests/unit/ai.catalog-match.test.ts
```

**Résultat réel :** `Test Suites: 2 passed` — `Tests: 23 passed`.

Également OK précédemment dans la même session : `ai.lease-request.test.ts`, `ai.data-first.test.ts` (47 tests avec les suites jointes avant fix du constructeur).

### Preuve outil matching (déterministe)

Dans `ai.intent-match-routing.test.ts` :

- smoke A → `resolveLocalToolIntents` **contient `matchCatalogListings`**
- args : `minRooms: 3`, `maxRent: 300000`
- **pas** `getOutstandingPayments`, **pas** `getUnits`

### Preuve impayés préservés

- smoke B / « impayés du locataire… » → `getOutstandingPayments`, **pas** `matchCatalogListings`
- création contrat « Crée un nouveau contrat pour Jean » → **pas** catalogue

---

## 4. Smoke session

| Tentative | Résultat |
|-----------|----------|
| Smoke initial (incident) | A FAIL / B PASS — prod `c17e23d` |
| Re-smoke après fix local | JWT **401** (session expirée) ; proxy Vite → **prod** (code ancien) |

**Limite :** tant que le fix n’est pas déployé, un smoke HTTP contre Railway ne peut pas prouver `matchCatalogListings` en prod. La preuve locale = sélection d’outil + garde-fou contrat.

---

## 5. Limites restantes

1. **Prod encore sur `c17e23d`** — comportement incident possible jusqu’au deploy autorisé.
2. Pas de test d’intégration Jest mockant tout `AiService.chat` (privé) — garde-fou couvert via `shouldSkipLeaseDraftForCatalogSearch` + intents.
3. Autres court-circuits précoces (howto / knowledge) non refondus — hors scope si non impliqués par A.
4. Fichiers `itc-site` (proxy Vite / URL relative) hors mission cerveau — utiles au debug local uniquement.

---

## 6. État Git (`imo-backend`)

```text
HEAD: c17e23d feat(ai): wire catalog matching tool into copilote

Modifiés (GO-INTENT-MATCH) :
  M src/modules/ai/ai.catalog-match.ts
  M src/modules/ai/ai.service.ts
  M src/modules/ai/ai.tools.ts
  M tests/unit/ai.catalog-match.test.ts
  ?? tests/unit/ai.intent-match-routing.test.ts
  ?? qa-e2e/GO-INTENT-MATCH-RESULTS-2026-10-20.md
```

Aucun commit / push effectué (mission).

---

## Verdict final

**PASS WITH LIMITATIONS** — cause racine prouvée, correction minimale validée par tests déterministes (outil `matchCatalogListings` sélectionné ; impayés / contrat préservés). Validation smoke prod post-fix **bloquée** (pas de deploy + JWT expiré).
