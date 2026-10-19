# ITC AI — PHASE 1.1 : Préparation du corpus immobilier complet

**Date :** 2026-10-19  
**Prérequis acceptés :** diagnostic PHASE 0 / 1 (`AI_KB_PHASE0_DOCS_AUDIT.md`, `AI_KB_PHASE1_ARCHITECTURE.md`)  
**Code runtime / RAG / migrations / prod / APK :** **aucun**  
**PHASE 2 :** non démarrée — nécessite autorisation explicite

---

## 1. Examen des snapshots et livrables

| Artefact | Rôle | Contenu utile net |
|----------|------|-------------------|
| `knowledge-sources/phase0-exports/01-knowledge-cards.txt` (1 052 o) | Cartes JSON | **1** carte `KC-IMM-001` |
| `…/02-index-csv.txt` (234 o) | Index | **1** ligne = même `KC-IMM-001` |
| `…/03-coverage-report.txt` (1 047 o) | Méta couverture | Plage 00:00–00:15 ; thèmes *annoncés* |
| `…/04-manuel-officiel.txt` (1 530 o) | Manuel | Formule rendement brut + 1 Q/R + limites |
| `AI_KB_PHASE0_DOCS_AUDIT.md` | Audit docs | Verdict : insuffisant / pending transcript |
| `AI_KB_PHASE1_ARCHITECTURE.md` | Audit IA | Pas de RAG ; copilote Prisma |
| `AI_KB_PHASE2_INTEGRATION_PLAN.md` | Plan futur | **Gelé** jusqu’à GO + corpus prêt |

**Conclusion d’examen :** le matériau actuel est un **échantillon de cadrage**, pas un corpus formation. Il sert uniquement à figer le format et le processus d’import.

---

## 2. Incomplets, doublons, affirmations non vérifiables

### 2.1 Documents incomplets

| Élément | Lacune |
|---------|--------|
| Doc 1 | Une seule fiche ; `formulas: []` ; contenu = 1 phrase |
| Doc 2 | Pas de contenu pédagogique (index seul) |
| Doc 3 | Thèmes « nette », « risques », « erreurs » **listés sans développement** |
| Doc 4 | § sommaire « Gestion des biens et relations locatives » **absent du corps** |
| Doc 4 | Banque Q/R : **1** couple seulement |
| Ensemble | Vidéo citée ~2 h ; documents = **~15 min** seulement |
| Ensemble | `verification_status` = pending / awaiting transcript |

### 2.2 Doublons

| Contenu | Apparitions |
|---------|-------------|
| `KC-IMM-001` / fondamentaux / studio zone tendue / 00:00–15:00 | Doc 1 + Doc 2 (+ thèmes Doc 3) |
| Lien YouTube `BhuVohwG-3s` | Docs 1, 3, (4 indirect via formation) |
| Avertissement « vérifier fiscalité / local / pro » | Doc 3 + Doc 4 |

**Règle future :** une connaissance = **une** fiche canonique (`id` stable) ; Doc 2 devient un *index généré*, pas une source parallèle.

### 2.3 Affirmations sans source vérifiable (ne pas promouvoir en « verified »)

| Affirmation / élément | Problème |
|-----------------------|----------|
| Contenu pédagogique de `KC-IMM-001` | Non recoupé avec un transcript horodaté |
| « Studio en zone tendue » | Illustration non chiffrée, non localisée, non tirée d’un cas transcript |
| Thèmes Doc 3 (nette, risques, erreurs) | Annoncés seulement — **interdit** d’en inventer le détail |
| Formule rendement brut | Présente dans Doc 4 ; **pas** horodatée sur la vidéo ; standard métier plausible mais statut = `unverified` jusqu’à validation |
| Taux / cas fiscaux « de la vidéo » | Doc 3 exige vérification — **aucune valeur chiffrée** dans les exports |

---

## 3. Format canonique des fiches (`KnowledgeCard` v1)

Schéma JSON cible (fichiers `KC-*.json`). Champs **obligatoires** marqués ★.

```json
{
  "id": "KC-IMM-XXX",
  "schemaVersion": "1.0.0",
  "title": "string",
  "category": "string",
  "keywords": ["string"],
  "content": "string — développement pédagogique",
  "method": {
    "summary": "string",
    "steps": ["string"]
  },
  "formulas": [
    {
      "id": "F-…",
      "name": "string",
      "expression": "string ASCII / pseudo-code",
      "expressionLatex": "string | null",
      "variables": [
        { "name": "string", "unit": "string", "definition": "string" }
      ],
      "conditions": ["string"]
    }
  ],
  "examples": [
    {
      "label": "string",
      "text": "string",
      "inputs": { },
      "expectedOutput": { },
      "verifiable": true,
      "note": "string | null"
    }
  ],
  "source": {
    "type": "youtube | transcript | docx | pdf | json | manual_export",
    "url": "string | null",
    "videoId": "string | null",
    "chapter": "string | null",
    "timestampStart": "HH:MM:SS | null",
    "timestampEnd": "HH:MM:SS | null",
    "originDocuments": ["chemin relatif snapshot"]
  },
  "verificationStatus": "unverified | reviewed | verified | rejected | retired",
  "warnings": ["string"],
  "limitations": ["string"],
  "relatedCardIds": ["KC-…"],
  "corpusRole": "draft_example_only | candidate | production_ready",
  "retired": false
}
```

### 3.1 Sémantique des champs

| Champ | Règle |
|-------|--------|
| `id` ★ | Stable, unique, format `KC-<DOMAIN>-<NNN>` (ex. `KC-IMM-001`). Jamais réutilisé pour un autre sens. |
| `title` ★ / `category` ★ | Titre humain ; catégorie contrôlée (liste ci-dessous). |
| `content` ★ | Texte pédagogique **extrait ou paraphrasé fidèle** d’une source ; pas de filler. Minimum : 2 phrases utiles **ou** justification `warnings` si brouillon. |
| `method` | Procédure ordonnée ; `steps` peut être `[]` si purement conceptuel. |
| `formulas` | Chaque formule a variables + conditions ; sinon `[]`. |
| `examples` | Si `verifiable: true` → `inputs` + `expectedOutput` obligatoires et recalculables. |
| `keywords` ★ | ≥ 2 termes pour retrieval futur. |
| `source` ★ | Au moins `type` + (`url` ou `originDocuments`) ; timestamps si source vidéo. |
| `verificationStatus` ★ | Voir §4. |
| `warnings` / `limitations` | Avertissements d’usage / limites de validité. |
| `corpusRole` | `draft_example_only` = jamais indexé en prod ; `production_ready` seulement si critères §5. |

### 3.2 Catégories contrôlées (V1)

`Investissement & Stratégie` · `Analyse & Rentabilité` · `Gestion locative` · `Juridique & Fiscal` · `Risques & Erreurs` · `Marché & Emplacement` · `Produit ITC` *(hors formation YouTube — réservé au pack app)* · `Autre`

### 3.3 Statuts de vérification

| Statut | Signification |
|--------|----------------|
| `unverified` | Importé / extrait, **pas** confronté au transcript ou revue métier |
| `reviewed` | Relu par un humain ; corrections mineures possibles |
| `verified` | Aligné transcript/source + validation métier explicite |
| `rejected` | Incorrect ou hors périmètre — ne pas indexer |
| `retired` | Obsolète — conservé pour historique, exclu du search |

---

## 4. Règles de validation (avant acceptation d’une fiche)

Une fiche est **rejetée** à l’import si :

1. `id` manquant / doublon sémantique non déclaré.  
2. `content` vide ou purement marketing (« l’immobilier c’est important ») sans procédure ni concept opérationnel.  
3. `verificationStatus: verified` **sans** preuve (`timestampStart/End` vidéo **ou** extrait transcript **ou** revue signée dans le manifest).  
4. `examples[].verifiable: true` sans `inputs` / `expectedOutput` cohérents.  
5. Formule sans définition des variables.  
6. Affirmation légale/fiscale présentée comme obligation universelle sans juridiction.  
7. Contenu inventé pour combler un trou de transcript (règle absolue).

Une fiche peut rester `unverified` dans `corpus-draft/` pour travail éditorial — **jamais** `corpusRole: production_ready`.

---

## 5. Critères d’acceptation — corpus « réellement documenté »

Le corpus est **incomplet** tant qu’**un** critère ci-dessous échoue.

### 5.1 Seuil minimum corpus (gate)

| # | Critère | Seuil proposé |
|---|---------|---------------|
| G1 | Nombre de fiches `verified` ou `reviewed` avec `content` ≥ 400 caractères utiles | **≥ 25** |
| G2 | Couverture vidéo (si source principale = une vidéo) | **≥ 80 %** de la durée totale en segments horodatés mappés à ≥ 1 fiche |
| G3 | Formules annoncées dans la formation | 100 % des formules citées ont une fiche `formulas[]` non vide + 1 exemple `verifiable: true` |
| G4 | Chapitres du sommaire manuel / outline | Aucun chapitre « annoncé » sans fiche ou sans entrée `retired` motivée |
| G5 | Doublons | Index généré = 1 ligne / `id` ; pas de contradiction non résolue entre fiches |
| G6 | Local / juridique | Toute fiche fiscale/juridique : `warnings` + juridiction **ou** statut `unverified` interdit en prod |
| G7 | Manifest | Fichier `corpus/vN/manifest.json` : version, date, source URL, liste ids, compteurs par statut |
| G8 | Traçabilité | Chaque fiche `verified` pointe vers timestamp **ou** ancre transcript |

### 5.2 État actuel vs gate

| Critère | État PHASE 0/1.1 |
|---------|------------------|
| G1 | **FAIL** — 0 fiche `verified` ; 2 brouillons d’exemple seulement |
| G2 | **FAIL** — ~15 min / ~2 h |
| G3 | **FAIL** — 1 formule sans exemple chiffré vérifiable |
| G4 | **FAIL** — « Gestion des biens » manquante |
| G5–G8 | **FAIL** / partiel |

**Corpus actuel ≠ production_ready.**

---

## 6. Exemples de fiches (contenu réel uniquement)

Emplacement :

- `qa-e2e/knowledge-sources/corpus-draft/example-cards/KC-IMM-001.draft.json`  
- `qa-e2e/knowledge-sources/corpus-draft/example-cards/KC-IMM-002.draft.json`

| Fiche | Origine | Inventé ? |
|-------|---------|-----------|
| `KC-IMM-001` | Doc 1 (+ index Doc 2) | Non — reformatage schéma ; `formulas: []` conservé |
| `KC-IMM-002` | Doc 4 (formule + Q/R + limites) | Non — `id` `KC-IMM-002` attribué ici faute d’id source ; **unverified** ; pas d’exemple numérique |

Ces fichiers ont `corpusRole: "draft_example_only"`. Ils **ne constituent pas** une base indexable.

---

## 7. Processus d’importation des documents enrichis

### 7.1 Formats acceptés en entrée

| Format | Usage |
|--------|--------|
| JSON (cartes ou tableau `knowledge_cards`) | Préféré — mapping direct |
| DOCX / Google Doc export `.docx` ou `.txt` | Découpage éditorial → cartes |
| PDF | Idem (texte extractible) |
| Transcription (`.srt`, `.vtt`, `.txt` horodaté) | Source de vérité pour timestamps |
| CSV index | Contrôle de couverture seulement |

### 7.2 Pipeline éditorial (humain + outillage futur — pas de runtime RAG ici)

```
1. Dépôt brut
   knowledge-sources/incoming/<date>-<label>/
     source.(docx|json|txt|srt) + README (URL, durée vidéo, auteur revue)

2. Snapshot immuable
   Copier vers knowledge-sources/snapshots/<date>/

3. Extraction → cartes brouillon
   Remplir le schéma §3 ; verificationStatus = unverified
   Interdit : combler les trous par génération libre

4. Revue métier
   unverified → reviewed | rejected
   Ajouter examples verifiable + formules complètes

5. Vérification transcript
   reviewed → verified si timestamps / citation OK

6. Packaging corpus
   knowledge-sources/corpus/vN/
     manifest.json
     cards/KC-*.json
   Gate §5 doit PASS

7. Remise à l’équipe IA
   GO explicite PHASE 2 (indexation / retrieval) — hors présent document
```

### 7.3 Règles d’import

- Préférer **une fiche = un concept** (pas un chapitre de 30 min dans une seule carte).  
- Conserver citations / timestamps dans `source`.  
- Les données utilisateurs ITC **n’entrent jamais** dans ce corpus.  
- Les secrets et PII sont interdits dans les fichiers knowledge-sources.

### 7.4 Livrables attendus du fournisseur de contenu

1. Transcript complet (ou segments) de la vidéo `BhuVohwG-3s` **ou** outline horodaté chapitre par chapitre.  
2. Manuel / DOCX avec sections **effectivement rédigées** (dont gestion locative).  
3. Jeux d’exemples chiffrés pour chaque formule (inputs + résultat attendu).  
4. Liste des passages **exclus** volontairement (hors scope, droit local incertain).  
5. Contact / date de validation métier pour le manifest.

---

## 8. Liste de contrôle — exhaustivité vidéo & traçabilité

### 8.1 Exhaustivité vidéo

- [ ] Durée totale de la vidéo notée (HH:MM:SS)  
- [ ] Table des matières horodatée (chapitres) fournie  
- [ ] Chaque chapitre a ≥ 1 fiche **ou** motif d’exclusion documenté  
- [ ] Somme des plages couvertes / durée totale ≥ 80 % (critère G2)  
- [ ] Segments muets / pub / hors sujet marqués `excluded`  
- [ ] Aucun thème annoncé dans un rapport de couverture sans fiche ou exclusion  
- [ ] Formules entendues dans l’audio = formules dans les fiches  
- [ ] Cas chiffrés de la vidéo = `examples` avec `verifiable: true`  

### 8.2 Traçabilité des connaissances

- [ ] Chaque fiche a un `id` stable  
- [ ] `source.url` ou `originDocuments` renseigné  
- [ ] `timestampStart` / `timestampEnd` **ou** ancre transcript pour fiches `verified`  
- [ ] `verificationStatus` cohérent avec les preuves  
- [ ] Manifest liste tous les ids + hash ou version fichier  
- [ ] Historique des retraits (`retired`) conservé  
- [ ] Aucune fiche `production_ready` avec statut `unverified`  
- [ ] Revue humaine datée (nom/rôle) dans le manifest  

### 8.3 Qualité pédagogique minimale par fiche

- [ ] `content` actionnable (pas seulement un titre)  
- [ ] `method.steps` si procédure  
- [ ] `warnings` / `limitations` si risque de sur-interprétation  
- [ ] Mots-clés ≥ 2  
- [ ] Pas de PII / pas de données org ITC  

---

## 9. Étapes pour recevoir les documents enrichis

1. Déposer les fichiers dans `imo-backend/qa-e2e/knowledge-sources/incoming/<date>-<label>/`.  
2. Joindre un `README.md` : URL vidéo, durée, format, contact validateur.  
3. Signaler dans le chat / ticket : « Corpus enrichi prêt pour revue PHASE 1.1 ».  
4. L’équipe applique le pipeline §7, met à jour ce document (section « État gate »), et émet un **PASS/FAIL** §5.  
5. Seulement si gate **PASS** + **GO explicite** → ouverture PHASE 2 (runtime retrieval).

---

## 10. Verdict PHASE 1.1

| Question | Verdict |
|----------|---------|
| Format canonique défini ? | **Oui** (§3) |
| Règles de validation / critères d’acceptation ? | **Oui** (§4–§5) |
| Exemple de fiche sans invention ? | **Oui** (`KC-IMM-001`, `KC-IMM-002` draft) |
| Processus d’import documenté ? | **Oui** (§7) |
| Checklist vidéo / traçabilité ? | **Oui** (§8) |
| Corpus prêt pour indexation / PHASE 2 ? | **Non** |
| Corpus prêt pour production ? | **Non** |
| Runtime / RAG modifié ? | **Non** |

**Verdict global :** la **préparation éditoriale et normative du corpus est prête** (schéma, gates, import, checklists, exemples). Le **corpus immobilier lui-même n’est pas prêt** : volume, couverture vidéo, vérification transcript et chapitres manquants bloquent tout passage en PHASE 2.

**Prochaine action autorisée :** réception des documents enrichis (§7.4 / §9).  
**Interdit sans GO explicite :** PHASE 2 (développement retrieval / RAG / câblage runtime).
