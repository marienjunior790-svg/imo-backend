# ITC AI — PHASE 2 : Proposition d’intégration base de connaissances

**Date :** 2026-10-19  
**Statut :** plan uniquement — **aucune implémentation runtime** dans ce lot  
**Entrées :** `AI_KB_PHASE0_DOCS_AUDIT.md` + `AI_KB_PHASE1_ARCHITECTURE.md`

---

## 1. Contrainte corpus (PHASE 0)

Volume net actuel ≈ **1 carte** `KC-IMM-001` + **1 formule** (rendement brut) + garde-fous.  
Statut source : **pending transcript**.  

→ Concevoir un pipeline **extensible**, mais n’indexer que le **noyau vérifié** jusqu’à enrichissement des documents.

---

## 2. Méthode recommandée (justifiée)

### Choix : RAG léger **fichier + BM25/keyword d’abord**, embeddings **optionnels** ensuite

| Option | Pour | Contre | Décision |
|--------|------|--------|----------|
| A. Injecter tout le manuel dans `ASSISTANT_PROMPT` | Simple | Non scalable ; mélange instruction système ; corpus grandira | **Rejet** pour le long terme |
| B. Vector DB externe (Pinecone…) | Sémantique | Nouvelle dépendance + ops + secrets ; overkill pour ~2 ko | **Différé** |
| C. pgvector + embeddings OpenAI | Natif Postgres | Migration Prisma/prod interdite dans cette mission ; coût | **Hors PHASE immédiate** |
| D. **Store JSON versionné + retrieval lexical/hybrid local** | Zéro migration prod ; traçabilité ; aligné cartes Doc 1 ; tests unitaires faciles | Moins « sémantique » au début | **Retenu pour V1** |

**V1 (local, sans prod) :**

1. Normaliser les exports → `knowledge-sources/corpus/v1/*.json` (chunks avec `id`, `title`, `category`, `sourceDocId`, `timestamp`, `text`, `formulas[]`, `verificationStatus`).
2. Service `AiFormationKnowledgeService` : `search(query, { topK })` → score mots-clés / titres / keywords (et éventuellement bigrammes).
3. Outil IA `searchFormationKnowledge` (lecture seule, **sans** `organizationId` métier — corpus global formation ITC).
4. Injection réponse : passages + provenance dans le **contexte utilisateur/outil**, jamais comme override Data-First.
5. Prompt : section « Connaissance formation (secondaire) » — faits org Prisma **primaires**.

**V2 (après GO + enrichissement corpus) :** embeddings OpenAI + table `AiKnowledgeChunk` / pgvector **sous migration explicite**.

---

## 3. Séparation des sources (PHASE 3)

```
Question utilisateur
    ├─► Outils Prisma (org JWT)     → FAITS portefeuille
    ├─► searchFormationKnowledge    → SAVOIR formation (citations)
    └─► ITC_KNOWLEDGE / app-guide   → produit ITC (pas formation YouTube)
Réponse structurée :
  Fait (org) | Savoir (formation + source) | Analyse | Recommandation | Estimation | Limite
```

Règles :

- Documents formation ≠ instructions système prioritaires.  
- Pas de mélange multi-org.  
- Pas d’invention si retrieval vide → « hors base documentaire actuelle ».  
- Formules : calcul côté code vérifiable quand entrées org ou saisies utilisateur disponibles.

---

## 4. Cycle de vie corpus

| Opération | Mécanisme V1 |
|-----------|--------------|
| Ajout formation | Nouveau JSON chunké + bump `corpusVersion` |
| Déduplication | Clé `id` (`KC-IMM-*`) + hash contenu |
| Versionnement | Dossier `corpus/v{n}/` + manifest |
| Retrait | `status: retired` dans manifest (exclu du search) |
| Actualisation | Remplacer fichier + tests snapshot |

---

## 5. Fichiers concernés (prévisionnels — non modifiés dans PHASE 0/1)

| Fichier | Action prévue |
|---------|----------------|
| `qa-e2e/knowledge-sources/phase0-exports/*` | Sources brutes (déjà là) |
| `qa-e2e/knowledge-sources/corpus/v1/*` | À créer (chunks normalisés) |
| `src/modules/ai/ai.formation-knowledge.ts` | Service retrieval V1 |
| `src/modules/ai/ai.tools.ts` | Outil `searchFormationKnowledge` |
| `src/modules/ai/ai.service.ts` | Câblage prompt secondaire (léger) |
| `src/modules/ai/ai.data-first.ts` | Clarifier priorité org > formation |
| `tests/unit/ai.formation-knowledge.test.ts` | Tests PHASE 5 |
| `qa-e2e/AI_KB_PHASE5_VALIDATION.md` | Preuves |

**Non touchés :** Flutter `imo-mobile` (même API `/ai/chat`), schémas Prisma prod, Hostinger, APK.

---

## 6. Nouvelles dépendances

**V1 :** aucune (Node + fichiers JSON).  
**V2 (GO futur) :** éventuellement SDK embeddings déjà via `openai` existant + extension Postgres — justification obligatoire au moment du GO.

---

## 7. Critères avant implémentation locale V1

1. PHASE 0 acceptée (corpus stub connu).  
2. PHASE 1 acceptée (pas de reconstruction du copilote).  
3. GO utilisateur pour **écriture code locale uniquement** (pas prod).  
4. Idéalement : exports formation enrichis (transcript / chapitres manquants).

Sans enrichissement, V1 indexe seulement le noyau PHASE 0 et les réponses documentaires resteront limitées — c’est **honnête** et testable.
