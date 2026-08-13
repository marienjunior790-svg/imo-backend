# Phase J6 — Scénarios client E2E (Intelligence ITC 2.0)

Vérification **manuelle** téléphone / app. Zéro fake PASS : chaque étape doit produire le résultat attendu (Prisma / Meta / vision), pas un dump patrimoine.

Prérequis : backend déployé avec ce branch (J0–J5), app mobile à jour, org avec au moins 1 bail ACTIVE + locataire nommé + logement libellé.

---

## Scénario A — Photo fuite → maintenance

| # | Action utilisateur | Attendu | Phase |
|---|-------------------|---------|-------|
| A1 | Envoyer **photo** d’une fuite / humidité (+ message « Appt X » si possible) | Constat vision + **Plan d’action ITC** + actions Maintenance — **pas** « Erreur interne » | J0/J3 |
| A2 | Follow-up « mon logement » / libellé | Hint logement session ou clarification — **pas** dump parc | J1/J3 |
| A3 | « résumé du bail de \<locataire\> » | Faits Prisma (loyer, dates) — OCR PDF = NOT_SUPPORTED si demandé en clauses | J4 |
| A4 | « génère le contrat PDF de \<locataire\> » puis « oui » | Propose → confirm → URL PDF réelle | J0 |
| A5 | « automatise les tâches maintenance » / ouvrir Maintenance | Proposition ou route `/maintenance` — pas de ticket inventé silencieux | J3 |

**Échec si :** dump « Voici ce que confirment vos données » après photo ou « oui ».

---

## Scénario B — Contrat → faits → WhatsApp impayé

| # | Action utilisateur | Attendu | Phase |
|---|-------------------|---------|-------|
| B1 | Upload **PDF** contrat (via vision) ou « résumé du bail de … » | Bridge faits ITC + OCR fichier NOT_SUPPORTED clair | J4 |
| B2 | « quel est le loyer du bail de … » | Montant XAF Prisma | J4 |
| B3 | « durée / date de fin du contrat de … » | Dates / ~mois depuis Prisma | J4 |
| B4 | « anomalies du bail » | Codes RENT_MISMATCH / etc. ou « aucune » — pas OCR inventé | J4 |
| B5 | « prépare une relance WhatsApp pour l’impayé de … » | Proposition pending (téléphone E.164 réel) | J5 |
| B6 | Confirmer l’envoi | Succès : `providerMessageId` + **SENT** ; **ou** 401 → **« Token Meta invalide… »** | J5 |

**Échec si :** faux « message envoyé » sans providerMessageId ; 401 générique opaque.

---

## Régressions rapides (J0–J2)

- « oui crée le PDF » après propose → PDF, pas dump
- « à quoi sert MFA » → guide, pas patrimoine
- « types de biens » → guide produit
- « trouve la clause préavis dans ce PDF » → NOT_SUPPORTED + alternatives
- « pourquoi retard si bail actif » → explication bail ≠ paiements

---

## Journal (à remplir côté client)

| Date | Build / commit | Scénario | PASS/FAIL | Notes |
|------|----------------|----------|-----------|-------|
| 2026-08-13 | `bc00c7d` (main / Phase J) | A | PASS | Client téléphone — Intelligence 2.0 |
| 2026-08-13 | `bc00c7d` (main / Phase J) | B | PASS | Client téléphone — WhatsApp / faits |

> Suite : Phase K1 propose→confirm ticket maintenance (`qa-e2e/PHASE_K_REAL_ACTIONS.md`).

