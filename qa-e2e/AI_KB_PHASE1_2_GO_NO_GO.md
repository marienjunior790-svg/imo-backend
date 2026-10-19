# ITC AI — PHASE 1.2 : Décision GO / NO-GO (corpus)

**Date :** 2026-10-19  
**Entrées :** `AI_KB_PHASE1_2_CORPUS_CONSISTENCY.md`, `AI_KB_PHASE1_2_CLAIMS_TO_VERIFY.md`, schéma PHASE 1.1, audits PHASE 0/1  
**Hors scope :** runtime RAG, code applicatif, prod, APK, commit/push

---

## Réponses explicites

### 1. Les documents sont-ils cohérents entre eux ?

**Partiellement — PAS pleinement cohérents.**

- Manuel, JSON et index partagent les **mêmes six thèmes**.  
- Le rapport de couverture affirme une « reprise **complète** » de 1 h 48 alors que ses plages laissent **~13 min** hors liste (dont **10 min** en queue 01:38–01:48) et que les fiches n’horodatent qu’environ **41 min (~38 %)**.  
- Index KC-003 (exemple Béziers) **≠** exemple JSON KC-003.  
- Statuts « Validé » / métadonnée « Verified from Training Transcript » **sans transcript fourni**.  
- Collision d’ID `KC-IMM-001` avec le corpus PHASE 0 / draft 1.1.

### 2. Le corpus est-il suffisamment détaillé pour une intégration RAG ?

**NON (NO-GO RAG).**

| Gate PHASE 1.1 | Résultat |
|----------------|----------|
| ≥25 fiches verified/reviewed substantielles | **FAIL** (6 fiches, 0 VERIFIED audit) |
| ≥80 % durée vidéo mappée | **FAIL** (~38 % fiches) |
| Chapitres annoncés développés | **FAIL** (Budapest ; 01:01–01:29) |
| Transcript / preuves | **FAIL** |
| Schéma 1.1 respecté | **FAIL** (champs manquants ; « Validé » non mappable) |

Le lot est un **progrès qualitatif** vs PHASE 0 (stubs), insuffisant pour indexer en production ou brancher un retrieval.

### 3. Quelles fiches peuvent être utilisées sans risque excessif ?

| Fiche | Usage prudent (hors RAG prod) |
|-------|-------------------------------|
| **KC-IMM-002** | Oui, **encadré** : formule + exemple 7,5 % comme *savoir de formation / calcul* ; toujours `NEEDS_SOURCE_CHECK` ; hypothèses explicites ; pas de statut `verified` |
| KC-IMM-001, 003, 004, 005, 006 | **Brouillon pédagogique seulement** — citations « selon la formation », avertissements juridiction FR, pas de garantie |
| Aucune | Usage comme **instruction système prioritaire** ou comme **fait portefeuille ITC** |

Risque excessif si : promesse de +10–15 %, promesse de crédit, application ABF hors FR, ou épargne 10 % présentée comme règle obligatoire.

### 4. Quelles preuves ou sources manquent encore ?

1. **Transcript** (ou revue horodatée signée) de la vidéo `BhuVohwG-3s` / formation Christopher Vangen.  
2. Fiches pour **Budapest / international** et pour le bloc **01:01–01:29**.  
3. Traitement de la **queue 01:38–01:48**.  
4. Alignement **index ↔ JSON** (KC-003).  
5. Stratégie d’**IDs stables** vs PHASE 0.  
6. Normalisation au **schéma 1.1** (`unverified`, formulas structurées, examples verifiable).  
7. Validation **juridiction** (FR vs marchés ITC).  
8. *(Optionnel)* Vidéo source complète — le `IMG_4475.MP4` du dossier n’est **pas** une preuve 1 h 48.

### 5. Quelle action précise doit être réalisée ensuite ?

**Action immédiate (recommandée) :**

1. Fournir le **transcript horodaté** (ou segments SRT/VTT) de la formation 1 h 48.  
2. Corriger l’index KC-003 et documenter/renommer l’ancien `KC-IMM-001`.  
3. Compléter les chapitres manquants (Budapest, risques 01:01–01:29, fin 01:38–01:48) **ou** déclarer explicitement ces plages `excluded` dans un rapport de couverture révisé (sans revendiquer « complet »).  
4. Rejouer la checklist PHASE 1.1 (§8) + gates G1–G8.  
5. Seulement si gates **PASS** → demander un **GO explicite PHASE 2** (retrieval) — **pas avant**.

**Interdit maintenant :** démarrer le RAG / modifier `src/modules/ai` pour ce corpus.

---

## Décision

| Question | Décision |
|----------|----------|
| GO intégration RAG / runtime ? | **NO-GO** |
| GO prod / APK ? | **NO-GO** |
| Conservation des fichiers en `incoming/` pour suite éditoriale ? | **Oui** (déjà copiés ; sources Downloads intactes) |
| Corpus « production_ready » ? | **Non** |

---

## Résumé exécutif

Le lot Gemini (manuel, rapport, index, JSON v2 — 6 fiches) est **plus riche** que les stubs PHASE 0, thématiquement centré sur une formation FR (Christopher Vangen / YouTube `BhuVohwG-3s`).  
Il **n’établit pas** une analyse complète prouvée de la vidéo 1 h 48 : ~38 % du temps seulement est porté par des timestamps de fiches ; le rapport ommet ~10 min en fin de vidéo et annonce des chapitres (Budapest, long bloc risques) sans fiches proportionnées.  
Les libellés « Validé » / « Verified from Transcript » sont **rejetés comme preuve** faute de transcript consultable.  
**Aucune fiche n’est VERIFIED** au sens audit ; KC-IMM-002 est la seule candidate à un usage calculatoire **encadré**.  
Écarts schéma 1.1 et collision d’ID bloquent un import propre.  

**Verdict : NO-GO RAG.** Prochaine étape = enrichir / prouver / normaliser le corpus (transcript + gaps), puis nouveau gate — pas de phase retrieval sans autorisation explicite.
