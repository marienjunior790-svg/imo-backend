# ITC AI — PHASE 1.2 : Affirmations sensibles à vérifier

**Date :** 2026-10-19  
**Règle :** distinguer (A) texte **explicitement présent** dans les livrables Gemini, (B) **inférence**, (C) **reste à vérifier** (transcript / droit local / métier).  
**Ne pas** traiter un exemple ou une opinion d’expert comme une garantie.  
**Expert nommé dans le manuel :** Christopher Vangen — les conseils chiffrés sont à traiter comme **attribués à la formation / à l’expert**, pas comme règles universelles ITC.

---

## 1. Épargne systématique de 10 %

| | |
|--|--|
| **Présent dans** | JSON KC-IMM-001 (`minimum 10% des revenus`) ; steps (virement auto 10 %) ; manuel §2 ; index (« Règle d’épargne systématique (10%) ») |
| **Nature** | Conseil / règle de formation (psychologie & budget) |
| **Pas une** | Obligation légale ; norme ITC ; donnée org |
| **À vérifier** | Formulation exacte dans la vidéo ; exceptions (charges incompressibles — déjà en `limitations` JSON) ; pertinence hors zone € / Livret A (référence FR explicite dans la fiche) |
| **Usage IA recommandé** | Présenter comme *conseil de formation*, jamais comme fait portefeuille ; ne pas calculer 10 % des revenus ITC sans donnée revenus réelle autorisée |

---

## 2. Augmentation de valeur de 10 à 15 % après transformation studio → T2

| | |
|--|--|
| **Présent dans** | JSON KC-IMM-004 content + exemple « +15 % » ; manuel §4 « augmente la valeur de 10 à 15% » ; index « +15% valeur » |
| **Nature** | Ordre de grandeur / opinion d’expérience — **pas** une étude de marché jointe |
| **Pas une** | Garantie de plus-value ; coefficient applicable Congo / tout marché |
| **À vérifier** | Citation vidéo ; conditions (fenêtres séparées, 9 m², copropriété) ; marché local |
| **Usage IA recommandé** | « Selon la formation, une fourchette **illustrative** de 10–15 % est citée » + `limitations` ; exiger hypothèses si calcul |

---

## 3. Rendement brut et prix d’acquisition total

| | |
|--|--|
| **Présent dans** | KC-IMM-002 formule + steps (prix + notaire + agence + travaux immédiats) ; exemple 100 k€ / 7,5 k€ → 7,5 % ; manuel §3 |
| **Nature** | Définition de calcul **standard** + exemple numérique **cohérent arithmétiquement** |
| **Ambiguïté** | Vocabulaire « Prix d’Acquisition Total » vs détail des composants — bien coller à la définition de la fiche |
| **À vérifier** | Horodatage 00:38–00:40 dans la vidéo ; éventuelle variante « rendement net » (non fournie) |
| **Usage IA recommandé** | Calcul autorisé si loyer et prix **fournis** (utilisateur ou outils ITC) avec hypothèses explicites ; séparer **Fait** / **Estimation** (Data-First) |

---

## 4. Autorisations de travaux en secteur protégé (ABF)

| | |
|--|--|
| **Présent dans** | KC-IMM-006 ; manuel §6 ; rapport (Béziers / secteur sauvegardé) ; exemple mise en demeure |
| **Nature** | Alerte urbanisme **France** (ABF, DP, permis) + anecdote Béziers |
| **Pas une** | Règle d’urbanisme congolaise / générique mondiale |
| **À vérifier** | Exactitude procédure FR à la date d’usage ; applicabilité hors FR ; détails du cas Béziers vs résumé |
| **Usage IA recommandé** | Cadre FR + « vérifier la réglementation locale du bien » ; ne pas mélanger avec données parc ITC |

---

## 5. Critères d’octroi du crédit

| | |
|--|--|
| **Présent dans** | KC-IMM-005 (5 piliers) ; limitation HCSF ~35 % ; exemple 1 500 € vs 3 000 € ; manuel §5 « levier d’enrichissement en **France** » |
| **Nature** | Conseils de dossier + rappel réglementaire FR (HCSF) |
| **Pas une** | Décision bancaire ; scoring ITC ; droit du crédit hors FR |
| **À vérifier** | Alignement HCSF à jour ; propos exacts vidéo ; transfert hors France |
| **Usage IA recommandé** | Étiqueter « formation / contexte France » ; ne jamais promettre un accord de prêt |

---

## 6. Autres points sensibles (liste complémentaire)

| Affirmation (présente) | Risque | Action |
|------------------------|--------|--------|
| Livret A / 1–3 mois de précaution (KC-001) | Produit FR | Localiser / contextualiser |
| Base DVF / notaires (KC-003) | Outil FR | Ne pas inventer d’équivalent local |
| « Frais de notaire inclus » dans exemple offre max (KC-003) | Ambigu vs formule | Clarifier avant indexation |
| Cash-flow loyers ≥ mensualités (KC-005) | Simplification | Vacance / charges non traitées ici |
| Métadonnée JSON « Verified from Training Transcript » | Sur-déclaration | Ignorer jusqu’à transcript fourni |
| Index « Validé » | Idem | Ne pas mapper vers `verified` schéma 1.1 |

---

## 7. Tableau récap — attribution

| Affirmation | Attribuable à l’expert / formation (doc) | Règle générale universelle | Donnée ITC org |
|-------------|------------------------------------------|----------------------------|----------------|
| Épargne 10 % | Oui (texte) | Non | Non |
| +10–15 % après T2 | Oui (texte) | Non | Non |
| Formule rendement brut | Oui + standard métier | Formule répandue | Non (sauf inputs org) |
| ABF / secteur sauvegardé | Oui (cadre FR + cas) | Non hors FR | Non |
| 5 piliers crédit + HCSF 35 % | Oui (cadre FR) | Non | Non |

---

## 8. Preuves manquantes (bloquantes pour « verified »)

1. Transcription horodatée (ou revue humaine contre la vidéo 1 h 48) pour chaque timestamp de fiche.  
2. Alignement des 10 dernières minutes (01:38–01:48) et du bloc Budapest.  
3. Développement du chapitre risques 01:01–01:29 au-delà de KC-006.  
4. Correction index KC-003 (exemple Béziers vs JSON).  
5. Politique d’ID : migration / rename de l’ancien `KC-IMM-001` PHASE 0.  
6. Validation juridiction (FR vs marchés ITC) pour crédit / ABF / Livret A / DVF.
