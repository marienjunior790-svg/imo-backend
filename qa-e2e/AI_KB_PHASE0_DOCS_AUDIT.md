# ITC AI — PHASE 0 : Audit des documents de connaissances immobilières

**Date :** 2026-10-19  
**Périmètre :** accessibilité, lecture intégrale, qualité, couverture, fiabilité  
**Code modifié :** aucun  
**Prod / migrations / APK :** aucun  
**Verdict PHASE 0 :** documents **accessibles** mais **contenu insuffisant et non vérifié** pour une intégration agent « formation complète »

---

## 1. Accessibilité

Méthode : export public Google Docs `…/export?format=txt` depuis l’environnement de travail (HTTP 200, `text/plain`).

| # | Document ID | Export local (snapshot) | Taille | Accès |
|---|-------------|-------------------------|--------|-------|
| 1 | `1Q3zFwJb_xeqQLz7mB2wFzG8c9dQz8VEMK1HbFDPmJu8` | `qa-e2e/knowledge-sources/phase0-exports/01-knowledge-cards.txt` | 1 052 o | **OK** |
| 2 | `1NAfSknPCXe6f046cqoKqTCy0OzECK6cp01ezWWJUibc` | `…/02-index-csv.txt` | 234 o | **OK** |
| 3 | `11bYPlqWFBOmUNjoQH41HKCh_8-U4lsoitZwqGM2kN54` | `…/03-coverage-report.txt` | 1 047 o | **OK** |
| 4 | `1yVqGPIxLWjhICQDnBHaDHQggQQLQYZnNeDvyMkJ-Iww` | `…/04-manuel-officiel.txt` | 1 530 o | **OK** |

Aucune authentification Google n’a été requise pour l’export texte.  
Les quatre documents ont été **lus intégralement** (contenu court — pas de troncature technique).

Source vidéo citée dans les docs : [YouTube `BhuVohwG-3s`](https://youtu.be/BhuVohwG-3s) — **non transcrite ici** ; les documents eux-mêmes déclarent n’avoir couvert que ~15 minutes d’une vidéo « deux heures ».

---

## 2. Contenu réel par document

### Doc 1 — Cartes de connaissances (JSON embarqué dans un Google Doc)

**Nature :** payload JSON unique (métadonnées + 1 carte).

| Champ | Valeur observée |
|-------|-----------------|
| `metadata.target_system` | ITC AI (Immo-Tec) |
| `metadata.source_url` | YouTube BhuVohwG-3s |
| `metadata.version` | 1.0.0 |
| `metadata.generation_date` | 2026-10-19 |
| `metadata.verification_status` | **Partial/Pending Full Transcript Access** |
| Cartes | **1 seule** : `KC-IMM-001` |
| Titre | Introduction aux Fondamentaux de l'Investissement Immobilier |
| Catégorie | Investissement & Stratégie |
| Contenu | 1 phrase générique sur structurer un investissement et maîtriser les risques |
| Steps | 3 étapes génériques (objectifs, zone, demande locative) |
| Formules | **aucune** (`formulas: []`) |
| Exemple | Studio en zone tendue |
| Timestamp | 00:00:00 – 00:15:00 |
| Vérification carte | **Awaiting direct transcript validation** |

### Doc 2 — Index tabulaire (CSV sur une ligne)

En-têtes : `ID, Chapitre, Sujet Principal, Méthode / Formule, Exemples, Timestamp, Statut de Vérification`  
Une seule ligne de données : `KC-IMM-001` / Investissement / Principes Fondamentaux / Analyse de marché / Studio… / 00:00–15:00 / **En attente de transcription complète**.

Rôle : index / inventaire — **pas** un corpus pédagogique.

### Doc 3 — Rapport de couverture

Document méta (pas une formation) :

1. Contexte : alimentation KB ITC AI depuis la vidéo YouTube.  
2. Plages : **seulement 00:00–00:15** (échantillon) ; vidéo présentée comme ~2 h.  
3. Thèmes *annoncés* (non développés) : fondamentaux locatifs ; rentabilité brute vs nette ; risques / erreurs.  
4. À vérifier : fiscalité juridiction cible ; taux de rendement des études de cas vidéo.

### Doc 4 — « Manuel immobilier officiel — ITC AI »

Sommaire annoncé (6 parties) vs corps réellement présent :

| Section sommaire | Corps présent ? |
|------------------|-----------------|
| 1. Présentation | Oui — 1 paragraphe mission |
| 2. Principes fondamentaux | Oui — 1 paragraphe (cash-flow, emplacement, juridique/fiscal) |
| 3. Méthodes / rentabilité | Oui — **formule rendement brut** (LaTeX) |
| 4. Gestion des biens et relations locatives | **Non** — absente du corps |
| 5. Banque Q/R | Partiellement — **1** couple Q/R sur rentabilité brute (numéroté « 4 » dans le corps) |
| 6. Limites / sécurité | Oui — rappel validation pro + droit local |

**Formule extraite (Doc 4) :**

\[
\text{Rendement Brut} = \left( \frac{\text{Loyer Annuel Hors Charges}}{\text{Prix d'Acquisition Total}} \right) \times 100
\]

Procédure Q/R associée : loyer mensuel × 12 ÷ coût total d’acquisition (frais de notaire compris) × 100.

---

## 3. Évaluation qualité / couverture / cohérence

### Qualité pédagogique

| Critère | Constat |
|---------|---------|
| Profondeur | **Très faible** — résumés génériques, pas de transcript ni de chapitres développés |
| Actionnabilité pour un agent | Limitée — une formule + étapes vagues |
| Traçabilité | Partielle — IDs `KC-IMM-*`, timestamps, lien YouTube |
| Maturité déclarée | Explicitement **partielle / en attente de transcription** |

### Couverture thématique

| Thème utile pour un conseiller ITC | Présent dans les docs ? | Niveau |
|------------------------------------|-------------------------|--------|
| Fondamentaux investissement | Oui (surface) | Intro |
| Rendement brut | Oui (formule + Q/R) | Utilisable avec prudence |
| Rendement net | Annoncé (Doc 3) | **Absent** du contenu |
| Cash-flow / charges / vacance | Allusions | Non opérationnel |
| Fiscalité (Congo / local) | Mention « vérifier » | **À ne pas intégrer comme fait** |
| Gestion locative / baux / impayés | Annoncé sommaire Doc 4 | **Manquant** |
| Stratégies avancées (flip, colocation, etc.) | Non | — |
| Lien explicite avec modules ITC (parc, paiements…) | Non | — |

### Cohérence et répétitions

- Les 4 docs **tournent autour de la même carte** `KC-IMM-001` et des 15 premières minutes.  
- Doc 1 (JSON) ≈ Doc 2 (index) ≈ thèmes Doc 3 / intro Doc 4 : **forte redondance**, faible volume net.  
- Incohérence structurelle Doc 4 : sommaire §4 « Gestion des biens » **sans contenu** ; la banque Q/R est numérotée 4 dans le corps.  
- Doc 3 annonce « rentabilité nette » et « erreurs courantes » **sans les développer**.

### Formules et références

| Élément | Fiable pour intégration ? | Commentaire |
|---------|---------------------------|-------------|
| Formule rendement brut | **Oui, avec conditions** | Standard métier ; hypothèses (HC, prix total) à exposer ; pas de preuve qu’elle vient du transcript |
| Exemple « studio zone tendue » | **Non comme fait local** | Illustration générique, non chiffrée, non adaptée Congo/ITC |
| Statuts fiscaux / taux vidéo | **Non** | Docs demandent vérification |
| Attribution à un « expert » nommé | **Non** | Aucun expert nommé dans le texte exporté |

---

## 4. Ce qui peut / ne peut pas être intégré

### Suffisamment fiable pour une intégration *prudente* (après PHASE 1–2)

1. **Structure de carte** Doc 1 (`id`, `title`, `category`, `keywords`, `steps`, `limitations`, `source`, `timestamp`) — bon format cible KB.  
2. **Formule de rendement brut** + procédure de calcul (Doc 4) — comme *connaissance de formation*, jamais comme donnée parc utilisateur.  
3. **Garde-fous** Doc 4 §limites (droit local, validation pro).  
4. **Métadonnées de couverture** Doc 3 — pour refuser d’affirmer une couverture « formation 2 h ».

### À vérifier / ne pas intégrer comme vérité agent

1. Tout contenu non présent dans le transcript validé (les docs le disent eux-mêmes).  
2. Thèmes seulement listés (nette, risques, gestion locative).  
3. Exemples non chiffrés et non localisés.  
4. Toute affirmation fiscale ou légale « obligatoire ».

### Blocage contenu (pas d’accès technique)

L’accès Google Docs **n’est pas** le blocage.  
Le blocage est **qualitatif / volumétrique** :

> Corpus actuel = échantillon ~15 min + stubs. **Insuffisant** pour déclarer une base de connaissances formation opérationnelle.

**Demande explicite pour la suite :** fournir, dès que possible :

1. Transcription complète (ou segments horodatés) de la formation vidéo, **ou**  
2. Exports enrichis DOCX/PDF/JSON avec le reste des chapitres (gestion locative, rendement net, cas chiffrés, local Congo si pertinent),  
3. Confirmation métier : quels passages sont **validés** vs brouillon.

Sans cela, une PHASE 2 ne peut indexer qu’un **noyau minimal** (1 carte + 1 formule).

---

## 5. Implications pour les phases suivantes (sans exécution)

| Phase | Impact du constat PHASE 0 |
|-------|---------------------------|
| 1 Architecture | Peut démarrer en **lecture seule** (audit ITC AI existant) — indépendant du volume docs |
| 2 Conception KB | Concevoir le pipeline RAG/index **pour un format extensible** (cartes JSON + manuel), mais **ne pas** promettre une couverture formation complète |
| 3 Données utilisateur | Reste prioritaire (déjà Data-First) ; les docs ne remplacent **jamais** les données org |
| 4 Comportement | L’agent doit **citer les limites de couverture** (15 min / pending transcript) |
| 5 Tests | Scénarios « réponse documentaire » limités au noyau ci-dessus jusqu’à enrichissement |

---

## 6. Preuves

- Snapshots locaux : `imo-backend/qa-e2e/knowledge-sources/phase0-exports/*.txt`  
- Méthode : `export?format=txt` (bytes ci-dessus)  
- Aucune invention de chapitres absents du corps exporté  

---

## 7. Décision PHASE 0

| Question | Réponse |
|----------|---------|
| Docs accessibles ? | **Oui (4/4)** |
| Lecture intégrale possible ? | **Oui** |
| Intégration « formation complète » justifiée ? | **Non** — corpus stub / pending verification |
| Intégration d’un noyau minimal justifiable plus tard ? | **Oui** — carte KC-IMM-001 + formule rendement brut + garde-fous, après audit architecture (PHASE 1) et plan (PHASE 2) |
| Modification code maintenant ? | **Non** — rapport d’audit seulement |

**Prochaine étape autorisée par le brief :** PHASE 1 — audit de l’architecture ITC AI existante (mobile `immo_tec` / `cg.immo.tec.immo_tec` + backend), sans reconstruction ni déploiement.
