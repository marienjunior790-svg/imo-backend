# ITC AI — PHASE 1.2 : Audit de cohérence du corpus immobilier

**Date :** 2026-10-19  
**Mission :** audit uniquement — **aucun** code runtime, commit, push, migration, déploiement, APK  
**Sources Gemini (intactes ; copie de travail pour extraction) :**

| Fichier | Emplacement original | Snapshot audit |
|---------|----------------------|----------------|
| `ITC_AI_MANUEL_IMMOBILIER.docx` | Downloads UnigramPreview… | `qa-e2e/knowledge-sources/incoming/2026-10-19-gemini-phase1-2/` |
| `ITC_AI_COVERAGE_REPORT.docx` | idem | idem |
| `ITC_AI_KNOWLEDGE_INDEX.xlsx` | idem | idem |
| `ITC_AI_KNOWLEDGE_BASE.json` *(fourni dans le même dossier)* | idem | idem + `_extracted/knowledge_base.pretty.json` |

Textes extraits : `…/incoming/2026-10-19-gemini-phase1-2/_extracted/`  

Références ITC déjà présentes : `AI_KB_PHASE0_DOCS_AUDIT.md`, `AI_KB_PHASE1_ARCHITECTURE.md`, `AI_KB_PHASE1_1_CORPUS_READINESS.md`, `knowledge-sources/phase0-exports/`, `corpus-draft/example-cards/`.

**Transcript vidéo :** non fourni dans ce lot. Un fichier `IMG_4475.MP4` (~6,8 Mo) est présent dans le dossier Downloads — **trop petit** pour être la formation 1 h 48 ; **non utilisé** comme preuve de vérification.

---

## 1. Vérification de couverture (vidéo annoncée 1 h 48)

### 1.1 Affirmations du rapport de couverture (explicites)

Le DocX affirme :

1. « reprise **complète** » de la formation vidéo de Christopher Vangen (**1 h 48**).  
2. Cinq plages (interprétation **HH:MM**, cohérente avec 1 h 48) :

| Plage rapport | Durée | Thème annoncé |
|---------------|-------|---------------|
| 00:00 – 00:32 | 32 min | Psychologie financière / éducation budgétaire |
| 00:32 – 00:46 | 14 min | Investissement international (Budapest) **et** calculs rendement brut |
| 00:47 – 01:00 | 13 min | Bonnes affaires, DVF, valorisation studio→T2 |
| 01:01 – 01:30 | 29 min | Risques juridiques / administratifs (secteur sauvegardé, Béziers) |
| 01:31 – 01:38 | 7 min | Crédit bancaire / critères dossiers |

Somme des segments = **95 min** / 108 min.

### 1.2 Périodes non documentées dans le rapport lui-même

| Intervalle | Durée | Nature |
|------------|-------|--------|
| 00:46 – 00:47 | 1 min | Micro-trou entre segments |
| 01:00 – 01:01 | 1 min | Micro-trou |
| 01:30 – 01:31 | 1 min | Micro-trou |
| **01:38 – 01:48** | **10 min** | **Queue vidéo absente du rapport** |

**Total non listé ≈ 13 min (≥ 12 %).**  
→ La formule « reprise complète » du rapport est **contredite par ses propres plages**.

### 1.3 Couverture réelle des fiches (timestamps JSON / index)

Timestamps fiches (HH:MM:SS) :

| ID | Timestamp | Durée |
|----|-----------|-------|
| KC-IMM-001 | 00:08:00 – 00:32:00 | 24 min |
| KC-IMM-002 | 00:38:00 – 00:40:00 | 2 min |
| KC-IMM-003 | 00:47:00 – 00:53:00 | 6 min |
| KC-IMM-004 | 00:57:00 – 01:00:00 | 3 min |
| KC-IMM-006 | 01:29:00 – 01:31:00 | 2 min |
| KC-IMM-005 | 01:34:00 – 01:38:00 | 4 min |

**Union des plages fiches ≈ 41 min ≈ 38 %** de 1 h 48.

Trous majeurs **sans fiche** (parmi d’autres) :

| Intervalle | ~Durée | Thème rapport non porté par une fiche |
|------------|--------|----------------------------------------|
| 00:00 – 00:08 | 8 min | Début psychologie (rapport 00:00–00:32) |
| 00:32 – 00:38 | 6 min | Partie « Budapest / international » |
| 00:40 – 00:47 | 7 min | Fin bloc rendement / international |
| 00:53 – 00:57 | 4 min | Entre négociation et transformation |
| **01:00 – 01:29** | **29 min** | Gros bloc « risques / Béziers » du rapport — **une fiche de 2 min seulement à 01:29** |
| 01:31 – 01:34 | 3 min | Entre ABF et crédit |
| 01:38 – 01:48 | 10 min | Fin de vidéo |

### 1.4 Chapitres annoncés sans contenu suffisamment développé

| Chapitre / thème | Annoncé où ? | Contenu fiche / manuel |
|------------------|--------------|-------------------------|
| Investissement international (Budapest) | Rapport 00:32–00:46 | **Aucune fiche** ; manuel silencieux |
| Risques juridiques 01:01–01:30 | Rapport | Seulement KC-006 (2 min, ABF) — **insuffisant** vs 29 min annoncées |
| Gestion locative / baux / impayés | Absent de ce lot | Toujours manquant (déjà PHASE 0/1.1) |
| Rendement **net** | Ancien Doc 3 PHASE 0 | Toujours absent |

### 1.5 Incohérences manuel ↔ rapport ↔ index ↔ JSON

| Écart | Détail |
|-------|--------|
| « Reprise complète » vs plages | Rapport se contredit (§1.2) |
| Rapport vs fiches | ~95 min « couvertes » en titre de chapitres vs **41 min** horodatées sur fiches |
| Index KC-003 exemple | Index : « Appartement Bézier / base DVF » — JSON KC-003 : exemple générique 150 k€ / 20 k€ / 20 k€ → 110 k€ (**pas Béziers**) ; Béziers est dans KC-006 |
| Index timestamps | Format `HH:MM` (sans secondes) vs JSON `HH:MM:SS` — alignés en substance pour les 6 IDs |
| Statut « Validé » | Présent index + JSON — **auto-déclaratif** ; pas de transcript joint |
| Métadonnées JSON | `verification_status`: « Consolidated & Verified from Training Transcript & Expert Testimony » — **transcript non fourni** à l’audit |
| ID `KC-IMM-001` | PHASE 0 / brouillon 1.1 = « Fondamentaux investissement / studio zone tendue » — lot Gemini = « Psychologie financière… » → **réécriture du même ID** (casse la stabilité d’identifiant PHASE 1.1) |
| Expert nommé | Manuel : « Christopher Vangen » — absent des fiches JSON `source` (seulement YouTube id) |
| Manuel volume | ~2,3 ko texte — résumé des thèmes, pas développement égal aux fiches |

### 1.6 Conclusion couverture

**On ne peut pas conclure** que la vidéo complète a été analysée de façon documentaire exploitable.  
Preuve disponible : couverture **partielle** (fiches ~38 % du temps ; rapport ~88 % en *titres de chapitres* avec queue de 10 min et thèmes sans fiche).

---

## 2. Audit des six fiches (KC-IMM-001 … 006)

Légende statut audit (≠ champ JSON « Validé ») :

- **VERIFIED** — éléments disponibles justifient une validation (transcript/horodatage contrôlé + cohérence). **Aucun** dans ce lot.  
- **NEEDS_SOURCE_CHECK** — contenu détaillé mais vérification directe contre vidéo/transcript **à faire**.  
- **INCONSISTENT** — contradiction entre livrables ou avec schéma / IDs antérieurs.  
- **INSUFFICIENT_DETAIL** — trop mince pour un usage pédagogique sûr.

### KC-IMM-001 — Psychologie financière et éducation budgétaire

| Critère | Constat |
|---------|---------|
| Source documentaire | JSON + index ; manuel §2 ; rapport plage 00:00–00:32 |
| Timestamp annoncé | 00:08:00 – 00:32:00 |
| Méthode / conseil | Analyse dépenses ; couper compulsif ; virement auto **10 % min** ; horizons CT/MT/LT |
| Formule | Aucune |
| Exemple | Jeune 25 ans, 100 €/mois, intérêts composés vs départ à 30 ans (qualitatif, pas de calcul fourni) |
| Cohérence manuel | Aligné §2 (épargne 10 %, horizons) |
| Preuve de vérification | Statut « Validé » auto-déclaré ; **pas de transcript** |
| Collision ID | Contenu **différent** du `KC-IMM-001` PHASE 0 / draft 1.1 |
| **Statut audit** | **INCONSISTENT** (ID) + contenu **NEEDS_SOURCE_CHECK** |

### KC-IMM-002 — Formule de calcul du Rendement Brut

| Critère | Constat |
|---------|---------|
| Source | JSON + index + manuel §3 |
| Timestamp | 00:38:00 – 00:40:00 |
| Formule | `(Loyer Annuel HC / Prix d'Acquisition Total) * 100` |
| Méthode | Loyer ×12 ; coût = prix + notaire + agence + travaux immédiats ; ratio ×100 |
| Exemple | 100 000 € TFC, 7 500 €/an → **7,5 %** (arithmétique correcte : 7500/100000×100) |
| Cohérence manuel | Alignée |
| Preuve | Pas de transcript ; formule standard + exemple cohérent **interne** |
| **Statut audit** | **NEEDS_SOURCE_CHECK** (pas VERIFIED sans vidéo) — meilleure fiche du lot pour usage *calculatoire encadré* |

### KC-IMM-003 — Achat en dessous du marché (« bien moche »)

| Critère | Constat |
|---------|---------|
| Source | JSON + manuel §3 ; rapport 00:47–01:00 |
| Timestamp | 00:47:00 – 00:53:00 |
| Formule | `Prix d'Achat Max = Valeur Marché Rénové - Travaux - Marge` |
| Exemple JSON | 150 000 − 20 000 − 20 000 = **110 000** (calcul OK) ; mention « frais de notaire inclus » dans le texte d’exemple — **ambigu** vs formule |
| Index | Exemple « Appartement Bézier / DVF » **≠** exemple JSON |
| **Statut audit** | **INCONSISTENT** (index vs JSON) ; fond **NEEDS_SOURCE_CHECK** |

### KC-IMM-004 — Transformation studio → deux pièces

| Critère | Constat |
|---------|---------|
| Source | JSON + manuel §4 |
| Timestamp | 00:57:00 – 01:00:00 (3 min) |
| Conseil | Grand studio 35–45 m² → chambre ≥9 m² ; **+10 à 15 %** valeur |
| Exemple | Studio 40 m² → T2 « +15 % » (pas de prix avant/après vérifiables) |
| Formule | Aucune |
| **Statut audit** | **NEEDS_SOURCE_CHECK** ; détail chiffré **INSUFFICIENT** pour en faire une garantie |

### KC-IMM-005 — Crédit immobilier / dossier bancaire

| Critère | Constat |
|---------|---------|
| Source | JSON + manuel §5 ; rapport 01:31–01:38 |
| Timestamp | 01:34:00 – 01:38:00 |
| Méthode | 5 piliers (épargne, pas de découverts/jeux, bien sous marché, dossier pro, cash-flow) |
| Exemple | 1 500 € bien géré vs 3 000 € mal géré (opinion / cas pédagogique) |
| Limitation | Endettement ~35 % directives HCSF (France) |
| **Statut audit** | **NEEDS_SOURCE_CHECK** — règles crédit = **cadre FR** ; pas des données ITC org |

### KC-IMM-006 — Secteur sauvegardé / ABF

| Critère | Constat |
|---------|---------|
| Source | JSON + manuel §6 ; rapport 01:01–01:30 |
| Timestamp | 01:29:00 – 01:31:00 (**2 min** pour un chapitre rapport de 29 min) |
| Conseil | Vérifier zone ; DP / permis ; purger recours |
| Exemple | Immeuble Béziers, absence DP → mise en demeure (anecdote expert) |
| **Statut audit** | **INSUFFICIENT_DETAIL** vs couverture annoncée ; fond **NEEDS_SOURCE_CHECK** |

### Synthèse statuts

| ID | Statut audit retenu |
|----|---------------------|
| KC-IMM-001 | **INCONSISTENT** (ID) / **NEEDS_SOURCE_CHECK** |
| KC-IMM-002 | **NEEDS_SOURCE_CHECK** |
| KC-IMM-003 | **INCONSISTENT** + **NEEDS_SOURCE_CHECK** |
| KC-IMM-004 | **NEEDS_SOURCE_CHECK** (chiffres **INSUFFICIENT** comme garantie) |
| KC-IMM-005 | **NEEDS_SOURCE_CHECK** |
| KC-IMM-006 | **INSUFFICIENT_DETAIL** + **NEEDS_SOURCE_CHECK** |
| **VERIFIED** | **0 / 6** |

---

## 3. Compatibilité schéma PHASE 1.1

Référence : `AI_KB_PHASE1_1_CORPUS_READINESS.md` §3 (aucun nouveau schéma créé).

| Exigence schéma 1.1 | JSON Gemini v2 | Écart |
|---------------------|----------------|-------|
| `schemaVersion` | Absent | Manquant |
| `method: { summary, steps }` | `steps` à la racine | Structure différente |
| `formulas[]` objets (id, variables, conditions) | Strings | Sous-spécifié |
| `examples[]` objets + `verifiable` + inputs/outputs | Strings | Pas d’exemple machine-vérifiable sauf texte KC-002/003 |
| `source` objet (type, url, timestamps start/end, originDocuments) | String `"YouTube Video…"` + `timestamp` string | Partiel |
| `verificationStatus` enum (`unverified`…) | `"Validé"` | **Non conforme** ; ne pas mapper automatiquement vers `verified` |
| `warnings` | Absent | Manquant |
| `corpusRole` | Absent | Manquant |
| `relatedCardIds` | Absent | Optionnel |
| Catégories contrôlées 1.1 | Nouvelles libellés (ex. « Fondamentaux & Psychologie ») | Extension possible — **signaler**, ne pas inventer mapping silencieux |
| Gate G1 (≥25 fiches verified) | 6 fiches, 0 verified audit | **FAIL** |
| Gate G2 (≥80 % durée vidéo mappée fiches) | ~38 % | **FAIL** |
| Stabilité `id` | `KC-IMM-001` réutilisé avec autre sens | **FAIL** règle 1.1 |

**Mapping d’import recommandé (futur, hors mission) :** traiter le JSON comme `unverified` / `candidate`, normaliser vers le schéma 1.1, **renommer ou versionner** l’ancien draft `KC-IMM-001` pour éviter la collision.

---

## 4. Séparation connaissances formation / données ITC

Les six fiches portent sur psychologie, rendement, stratégie d’achat, travaux, crédit FR, urbanisme FR.  
**Aucune** ne contient de données d’organisation ITC (loyers réels, locataires, orgId).  
Rappel PHASE 1 : faits portefeuille = outils Prisma uniquement ; formation = secondaire et citée.

---

## 5. Preuves d’extraction (reproductibilité)

```
qa-e2e/knowledge-sources/incoming/2026-10-19-gemini-phase1-2/
  ITC_AI_*.docx|xlsx|json          # copies binaires
  _extracted/
    knowledge_base.pretty.json
    ITC_AI_MANUEL_IMMOBILIER.txt
    ITC_AI_COVERAGE_REPORT.txt
    ITC_AI_KNOWLEDGE_INDEX.txt
```

Méthode : lecture ZIP OOXML (DOCX/XLSX) + `json.loads` — sans altérer les binaires originaux Downloads.

---

## 6. Verdict partiel (cohérence)

Les trois livrables (+ JSON) sont **thématiquement alignés** (mêmes 6 sujets) mais **pas pleinement cohérents** : couverture « complète » non prouvée, gaps temporels, index KC-003 divergent, IDs instables vs PHASE 0/1.1, statuts « Validé » non appuyés par un transcript consultable.

→ Décision d’intégration : voir `AI_KB_PHASE1_2_GO_NO_GO.md`.
