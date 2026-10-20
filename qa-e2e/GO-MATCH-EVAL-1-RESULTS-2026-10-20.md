# GO-MATCH-EVAL-1 — Résultats (2026-10-20)

**Périmètre :** filet déterministe NL → intents/demand + empty hard + gold B2 ranking.  
**MatchingService / SQL / scorer :** **inchangés**.  
**Commit / push / deploy :** **non** (attente GO explicite).

---

## Verdict

**PASS** (local) — 15/15 tests ; fixture P+/P−/ambigu + EMPTY_ELIGIBLE gold + suite CI4 gold B2.

---

## Livrables

| Fichier | Rôle |
|---------|------|
| `qa-e2e/match-intel-cases.json` | Fixture versionnée (11 cas : P1–P3, N1–N4, A1–A4) |
| `tests/unit/ai.match-intel-eval.test.ts` | Harness Jest : intents, demand, hard empty, gold B2 |

---

## Matrice cas (fixture)

| Id | Kind | Catalogue | Outil attendu | Demand clé |
|----|------|-----------|---------------|------------|
| P1-smoke-A | + | oui | matchCatalogListings | minRooms=3, maxRent=300000 |
| P2-general-search | + | oui | matchCatalogListings | (aucun inventé) |
| P3-explicit-appart | + | oui | matchCatalogListings | minRooms=3, maxRent=300000 |
| N1-hard-tight | hard − | oui | matchCatalogListings | minRooms=5, maxRent=50000 → EMPTY |
| N2-impayes-smoke-B | routing − | non | getOutstandingPayments | — |
| N3-contrat | routing − | non | (pas catalogue) | — |
| N4-vacants-org | routing − | non | getVacantUnits | — |
| A1-no-seek-verb | ambigu | non | — | pas catalogue sans verbe |
| A2-seek-without-housing | ambigu | non | — | cherche sans type logement |
| A3-seek-housing-vague-budget | ambigu | oui | matchCatalogListings | pas de maxRent inventé |
| A4-tenant-impaye | ambigu | non | getOutstandingPayments | — |

---

## Preuves tests

```text
npx jest --config jest.config.cjs --runInBand tests/unit/ai.match-intel-eval.test.ts
→ Test Suites: 1 passed · Tests: 15 passed
```

- Fixture chargée (`version` 1.0.0, ≥8 cas).  
- 11 cas NL : `isCatalogMatchQuestion` + `resolveLocalToolIntents` + `parseCatalogMatchDemand`.  
- N1 sur corpus gold B2 → `EMPTY_ELIGIBLE`, 0 matches.  
- Smoke A (3 pièces / 300k) → ≥1 éligible sur gold B2.  
- `runGoldB2Suite` / `goldSuitePassed` → true (nDCG / ordre).

---

## Limites

1. Harness **local uniquement** — pas d’appel API prod / JWT.  
2. Ambigu A1/A2 : comportement **documenté actuel** (pas d’assouplissement parseur).  
3. EMPTY hard N1 prouvé sur **gold B2**, pas sur le catalogue live org.

---

## Suite

- **GO-COMMIT** (sélectif) pour versionner fixture + harness + ce rapport.  
- Pas de deploy requis (tests / qa-e2e seulement).  
- Élargir la fixture si nouveaux smokes copilote.
