# ITC AI Knowledge Base — Synthèse PHASE 0 + 1 (livrable intermédiaire)

**Date :** 2026-10-19  
**Prod / migrations / APK / secrets :** aucun  
**Code runtime :** non modifié

---

## 1. Rapport sur les quatre documents

| Doc | Accès | Contenu réel | Qualité |
|-----|-------|--------------|---------|
| 1 — Cartes JSON | OK | 1 carte `KC-IMM-001`, verification pending | Stub structuré |
| 2 — Index CSV | OK | 1 ligne index | Inventaire |
| 3 — Couverture | OK | Méta : 0–15 min / ~2 h vidéo | Pas pédagogique |
| 4 — Manuel | OK | Intro + formule rendement brut + 1 Q/R + limites ; §gestion locative **absent** | Partiel |

Détail : [`AI_KB_PHASE0_DOCS_AUDIT.md`](./AI_KB_PHASE0_DOCS_AUDIT.md)  
Snapshots : `knowledge-sources/phase0-exports/*.txt`

**À fournir pour une vraie base :** transcript / DOCX enrichis + statut « verified » des passages.

---

## 2. Diagnostic architecture IA

Copilote **OpenAI + tools Prisma org** + fallback local ; Data-First déjà en place.  
RAG / embeddings / vector DB : **absents** (déclarés NOT_SUPPORTED).  
Mobile référence : Flutter **`immo_tec`** / `cg.immo.tec.immo_tec` → `/ai/*`.

Détail : [`AI_KB_PHASE1_ARCHITECTURE.md`](./AI_KB_PHASE1_ARCHITECTURE.md)

---

## 3. Proposition d’intégration

RAG léger V1 : corpus JSON versionné + retrieval lexical + outil `searchFormationKnowledge`, **sans** migration prod ni vector DB.  
Priorité : données org > savoir formation > guide produit.  
V2 embeddings/pgvector seulement après GO + corpus enrichi.

Détail : [`AI_KB_PHASE2_INTEGRATION_PLAN.md`](./AI_KB_PHASE2_INTEGRATION_PLAN.md)

---

## 4. Fichiers concernés

**Créés (audit uniquement) :**

- `qa-e2e/AI_KB_PHASE0_DOCS_AUDIT.md`
- `qa-e2e/AI_KB_PHASE1_ARCHITECTURE.md`
- `qa-e2e/AI_KB_PHASE2_INTEGRATION_PLAN.md`
- `qa-e2e/AI_KB_PHASE0_1_EXECUTIVE.md`
- `qa-e2e/knowledge-sources/phase0-exports/{01..04}.txt`

**Runtime à modifier plus tard (GO local) :** liste dans plan PHASE 2 — non touchés.

---

## 5. Modifications locales réalisées

Snapshots des 4 docs + rapports d’audit/plan.  
**Aucune** modification de `src/modules/ai/*` runtime dans ce lot.

---

## 6. Tests

Pas de tests d’intégration KB : **pas encore de code retrieval**.  
Référence existante Data-First / security : suites `ai.data-first`, `ai.security` (inchangées).

---

## 7. Limitations restantes

- Corpus formation trop mince et non vérifié (transcript).  
- Pas de RAG runtime.  
- Doc 4 incomplet vs sommaire.  
- Thèmes « nette / gestion locative / fiscalité » non intégrables comme faits.

---

## 8. Avant toute nouvelle APK

1. Enrichir / valider le corpus formation.  
2. Implémenter V1 locale + tests PHASE 5 (10 scénarios).  
3. GO déploiement backend (Railway) séparé.  
4. Smoke `/ai/chat` (question formation + question portefeuille).  
5. Ensuite seulement build APK `immo_tec` — **non démarré ici**.

---

## Suite

Attente GO pour **implémentation locale V1** (PHASE 2–5 code + tests), ou livraison des documents formation enrichis.
