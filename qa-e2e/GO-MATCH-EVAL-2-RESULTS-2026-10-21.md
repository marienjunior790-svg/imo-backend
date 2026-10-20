# GO-MATCH-EVAL-2 — Résultats (2026-10-21)

**Demande :** vérifier le filet avant de pousser `47b977d`.  
**MatchingService / SQL / scorer :** inchangés.  
**Push / deploy :** non. `47b977d` reste local. Les corrections EVAL-2 ne sont pas encore commitées.

---

## Verdict

**PASS** — 25 tests EVAL-2, plus le filet routing/catalogue existant (50 tests au total sur les trois fichiers).

Le jeu 1.0.0 ne couvrait pas tout le critère. La fixture est passée en **1.1.0**.

| Critère | 1.0.0 (`47b977d`) | 1.1.0 |
|---------|-------------------|--------|
| Budget + pièces + ville | pièces + budget seulement | `P4-budget-rooms-city` (Brazzaville, 3 pièces, 300 000 XAF) |
| Sans critères chiffrés | `P2` présent, absence de `maxRent` non exigée hors A3 | tout cas catalogue sans champ attendu refuse l’invention |
| Impayés ≠ recherche | oui (`N2`) | `N2` + `A4` sans nom de personne |
| Contrat ≠ recherche | `N3` n’interdisait que le catalogue, sans outil positif | `N3` exécute `proposeCreateLease` ; `N6` a pièces + loyer et n’appelle pas `matchCatalogListings` |
| Résultats vides | `N1` codé en dur, `expectEmptyHard` ignoré | chaque cas catalogue est joué sur gold B2 |
| Ambigu | partiel | `A1` parc org, `A2` aucun outil, `A3` catalogue sans budget inventé |
| Outils réellement appelés | noms d’intents seulement | `execute(nom, args)` puis `MatchingService.match` pour le catalogue |
| Déterministe / relecture | une passe | deux passes identiques (intents, args, gold, nDCG) |
| Données personnelles | « Jean », « Yannick » | messages synthétiques ; rejet email, téléphone, ces prénoms |

---

## Preuve

```text
npx jest --config jest.config.cjs --runInBand ^
  tests/unit/ai.match-intel-eval.test.ts ^
  tests/unit/ai.catalog-match.test.ts ^
  tests/unit/ai.intent-match-routing.test.ts
→ Test Suites: 3 passed · Tests: 50 passed
```

Outils catalogue : les args reçus par `match()` portent `minRooms`, `maxRent`, `cities` uniquement quand le message les contient.

Vides gold B2 (corpus Brazzaville figé) :

- `N1` — 5 pièces / 50 000 XAF → `EMPTY_ELIGIBLE`, 0 match.
- `N5` — Pointe-Noire → `EMPTY_ELIGIBLE`, 0 match.
- `P1`, `P2`, `P3`, `P4`, `A3` → au moins un match, deux passes avec les mêmes ids.

---

## Comportement verrouillé (pas un changement produit)

`N6` (« Crée un nouveau contrat… 3 pièces, loyer maximal… ») exécute, dans cet ordre :

1. `askAboutDocument` — « loyer » + « contrat » est déjà une question document.
2. `getUnits` — le mot « logement » hors recherche catalogue ouvre le parc org.
3. `proposeCreateLease`.

`matchCatalogListings` n’est pas dans cette liste. Le brouillon « Nouveau contrat » n’absorbe pas les recherches catalogue (`shouldSkipLeaseDraftForCatalogSearch` aligné sur l’intent catalogue).

---

## Suite

Commit sélectif de `qa-e2e/match-intel-cases.json`, `tests/unit/ai.match-intel-eval.test.ts` et ce rapport, puis push de `47b977d` + ce commit. Pas de deploy métier : aucun changement runtime.
