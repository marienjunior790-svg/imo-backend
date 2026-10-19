# ITC AI — PHASE 2 locale V1 (retrieval lexical formation)

**Date :** 2026-10-19  
**Autorisation :** GO utilisateur après PHASE 1.2  
**Prod / Railway / migrations / APK / commit :** **non effectués** dans ce lot  
**Statut corpus :** toutes fiches `unverified` — **pas** `production_ready`

---

## 1. Ce qui a été fait

| Élément | Détail |
|---------|--------|
| Normalisation schéma 1.1 | `qa-e2e/knowledge-sources/corpus/v1/cards.json` + `manifest.json` |
| Embed runtime | `src/modules/ai/ai.formation-corpus.v1.ts` |
| Types / search | `ai.formation-knowledge.types.ts`, `ai.formation-knowledge.ts` |
| Outil | `searchFormationKnowledge` dans `ai.tools.ts` |
| Prompt | Mention dans `ASSISTANT_PROMPT` + `DATA_FIRST_PROMPT` (formation = secondaire) |
| Tests | `tests/unit/ai.formation-knowledge.test.ts` |

Méthode : **BM25-like lexical** (tokens + boost titre/keywords). **Pas** d’embeddings, **pas** de vector DB, **pas** de migration Prisma.

---

## 2. Limites assumées (PHASE 1.2)

- Couverture vidéo partielle (~38 % timestamps fiches).  
- Aucune fiche `verified` (transcript absent).  
- Collision historique ID `KC-IMM-001` (contenu Gemini ≠ stub PHASE 0) — id Gemini retenu ; draft 1.1 reste hors index runtime.  
- Juridiction FR (Livret A, DVF, ABF, HCSF) — avertissements dans les fiches.

---

## 3. Comportement attendu

1. Question méthode (« rendement brut ») → outil formation → citation `KC-IMM-*` + statut unverified.  
2. Question parc (« mes vacants ») → outils Prisma uniquement.  
3. Combinaison : données org d’abord, formation en conseil secondaire.

---

## 4. Non fait (volontairement)

- Déploiement production  
- Commit / push  
- APK  
- Vector RAG  
- Promotion `verified`
