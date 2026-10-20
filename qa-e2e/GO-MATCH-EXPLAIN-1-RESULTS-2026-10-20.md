# GO-MATCH-EXPLAIN-1 — Résultats (2026-10-20)

**Choix :** priorisé vs `GO-MATCH-EVAL-1` (audit INTEL).  
**Périmètre :** pont copilote uniquement — **MatchingService / SQL / scorer inchangés**.  
**Commit / push / deploy :** **non** (attente GO explicite).

---

## Verdict

**PASS** (local) — factors scorer → payload + reply Data-First ; empty suggestions moteur relayées.

---

## Changements

| Fichier | Modification |
|---------|--------------|
| `src/modules/ai/ai.catalog-match.ts` | `factors`, `matchTier: 'eligible'`, `emptySuggestions` ; `explainMatchFactors` ; format reply « pourquoi » |
| `tests/unit/ai.catalog-match.test.ts` | 2 tests EXPLAIN-1 + empty suggestions |

---

## Preuves tests

```text
npx jest --config jest.config.cjs --runInBand ^
  tests/unit/ai.catalog-match.test.ts ^
  tests/unit/ai.intent-match-routing.test.ts
→ Test Suites: 2 passed · Tests: 25 passed
```

- Factors propagés (`price` / `rooms` / `location`) dans payload.  
- Sans factors → **pas** de « pourquoi : » inventé.  
- EMPTY → recommandations = `suggestions` moteur.  
- Routage intent non régressé (11 tests GO-INTENT-MATCH).

---

## Comportement user-facing (attendu après deploy)

Pour une recherche catalogue réussie :

- Liste avec **score** + **pourquoi : …** (labels scorer).  
- Analyse : meilleure proposition expliquée ; rappel « éligibles hard ».  
- Empty : tips eligibility (budget / pièces / ville) si fournis.

---

## Limites

1. Pas encore en prod (`c98787c` reste le tip déployé pour le routage).  
2. Qualité des labels = celle du scorer 0.2.0 (pas de nouveaux critères soft).  
3. `GO-MATCH-EVAL-1` (jeu P+/P−/ambigu) toujours ouvert.

---

## Suite

- **GO-COMMIT / GO-DEPLOY** (sélectif) pour livrer EXPLAIN-1.  
- Puis **GO-MATCH-EVAL-1** pour le filet de cas réels.
