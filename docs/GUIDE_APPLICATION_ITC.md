# Guide complet — Application Intelligence ITC

**Version document :** 1.0 — août 2026  
**Produit :** ITC / IMMO-tec — gestion immobilière (Congo, monnaie **XAF**)  
**Application mobile :** copilote « Intelligence ITC » — *Votre copilote immobilier*  
**Backend API :** `https://imo-backend-production-d2d1.up.railway.app/api/v1`

Ce document regroupe **toutes les étapes** et **informations essentielles** pour comprendre et utiliser l’application, du quotidien gestionnaire jusqu’aux actions avancées via l’IA.

---

## Table des matières

1. [Vue d’ensemble](#1-vue-densemble)
2. [Hiérarchie et rôles](#2-hiérarchie-et-rôles)
3. [Navigation dans l’application](#3-navigation-dans-lapplication)
4. [Connexion et mots de passe](#4-connexion-et-mots-de-passe)
5. [Parc immobilier (immeubles et logements)](#5-parc-immobilier-immeubles-et-logements)
6. [Locataires et portail](#6-locataires-et-portail)
7. [Contrats / baux](#7-contrats--baux)
8. [Paiements et loyers](#8-paiements-et-loyers)
9. [Maintenance](#9-maintenance)
10. [Équipe et agents](#10-équipe-et-agents)
11. [Tableau de bord et rapports](#11-tableau-de-bord-et-rapports)
12. [Paramètres, sécurité et compte](#12-paramètres-sécurité-et-compte)
13. [Intelligence ITC (IA)](#13-intelligence-itc-ia)
14. [WhatsApp et messages](#14-whatsapp-et-messages)
15. [Documents PDF](#15-documents-pdf)
16. [Automatisations](#16-automatisations)
17. [Règles métier importantes](#17-règles-métier-importantes)
18. [Limites actuelles (honnêteté produit)](#18-limites-actuelles-honnêteté-produit)
19. [Référence technique rapide](#19-référence-technique-rapide)

---

## 1. Vue d’ensemble

ITC est une **entreprise de gestion immobilière** modélisée dans une application mobile :

| Concept | Description |
|---------|-------------|
| **Organisation** | Votre agence / société de gestion (une base de données isolée par org) |
| **Immeuble** | Bâtiment regroupant des logements |
| **Logement (Apartment)** | Unité locative (libellé, pièces, surface, loyer, statut) |
| **Locataire** | Personne CRM + éventuellement compte portail |
| **Bail (Lease)** | Contrat liant locataire + logement |
| **Paiement** | Échéance de loyer (en attente, payé, retard, partiel…) |
| **Maintenance** | Ticket d’intervention (fuite, réparation…) |
| **Intelligence ITC** | Chat IA connecté à vos **données réelles** (Prisma) + actions avec confirmation |

**Principe d’or :** l’IA lit vos données et **propose** des actions sensibles ; vous **confirmez** (« oui », « confirme », « annule ») avant toute création de PDF, ticket, envoi WhatsApp, etc.

---

## 2. Hiérarchie et rôles

### 2.1 Les rôles utilisateurs

| Rôle | Libellé produit | Mission principale |
|------|-----------------|-------------------|
| **OWNER** | Propriétaire (supervision) | Vue globale, équipe, abonnement, configuration, rapports |
| **MANAGER** | Agent gestionnaire | **Centre ops** : locataires, biens, contrats, paiements, maintenance (desk) |
| **AGENT** | Agent terrain | Interventions **assignées uniquement** (espace terrain) |
| **TENANT** | Locataire | Portail personnel : son logement, bail, loyers, SAV |
| **ACCOUNTANT** | Comptable | Finances / paiements selon permissions |

> **Attention :** « Agent » dans le langage courant peut désigner le **gestionnaire** (MANAGER). Le rôle **AGENT** en base = **terrain / maintenance**.

### 2.2 Qui fait quoi au quotidien

```
OWNER (supervision)
  └── provisionne MANAGER + AGENT terrain
MANAGER (ops)
  └── locataires, baux, paiements, tickets, assignations
AGENT (terrain)
  └── accepte / démarre / termine les interventions assignées
TENANT (portail)
  └── consulte bail, paie (info), signale maintenance
```

### 2.3 Flux métier type

1. Le **propriétaire** crée l’équipe (gestionnaires + agents terrain).
2. Le **gestionnaire** enregistre immeubles, logements, locataires, baux.
3. Les **échéances de loyers** suivent le bail actif.
4. Le **locataire** signale un problème → ticket → le gestionnaire **assigne** → l’agent terrain **intervient**.
5. Le **propriétaire** peut consulter l’historique sans traiter chaque ticket.

---

## 3. Navigation dans l’application

Barre de navigation mobile (4 onglets principaux) :

| Onglet | Contenu |
|--------|---------|
| **Tableau** | Dashboard — KPIs occupation, encaissements, alertes |
| **Immeubles** | Parc immobilier — immeubles et logements |
| **IA** | Intelligence ITC — chat copilote, photo, voix |
| **Réglages** | Profil, sécurité, équipe, abonnement |

### Menus métier (via navigation ou IA)

| Module | Accès typique | Contenu |
|--------|---------------|---------|
| **Locataires** | Menu Locataires | Fiches CRM, portail, retrait |
| **Contrats** | Menu Contrats | Baux DRAFT / ACTIVE / EXPIRED |
| **Paiements** | Menu Paiements | Échéances, impayés, reçus |
| **Maintenance** | Menu Maintenance | Desk tickets, assignation |
| **Équipe** | Menu Équipe (Agents) | Collaborateurs, LoginId |
| **Notifications** | Cloche / centre | Alertes in-app |

---

## 4. Connexion et mots de passe

### 4.1 Identifiants

Chaque compte utilise :

- **E-mail** *ou*
- **LoginId** au format `ITC-XXXXXXXX` (8 caractères alphanumériques)

Au moins l’un des deux est obligatoire.

### 4.2 Première connexion (collaborateur ou locataire)

1. Le **propriétaire / gestionnaire** crée le compte.
2. ITC affiche **une seule fois** :
   - le **LoginId** (ou l’e-mail)
   - le **mot de passe temporaire**
3. Remettez ces identifiants à la personne.
4. À la **première connexion**, ITC exige souvent de **changer le mot de passe**.

> **Sécurité :** le mot de passe temporaire **n’est plus visible** sur la fiche après création. Il n’est jamais stocké en clair côté serveur.

### 4.3 Mot de passe perdu

| Profil | Procédure |
|--------|-----------|
| **Agent / gestionnaire** | Propriétaire → Équipe → fiche → **Régénérer** mot de passe |
| **Locataire** | Locataires → fiche → régénérer accès portail **ou** « Mot de passe oublié » avec LoginId |
| **Propriétaire** | Écran login → « Mot de passe oublié » |

### 4.4 MFA (authentification multi-facteurs)

1. **Réglages** → sécurité du compte  
2. Activer / gérer le MFA (code temporaire ou app d’authentification)  
3. **Sessions** : voir et révoquer les appareils connectés  

Recommandé pour les comptes **OWNER** et **MANAGER**.

---

## 5. Parc immobilier (immeubles et logements)

### 5.1 Types de biens dans ITC

ITC ne classe pas les logements en liste fermée (Studio / F2 / F3). Chaque bien a :

- un **libellé** (ex. Appt 3B, Studio RDC)
- un **nombre de pièces** et une **surface**
- un **loyer** (montant XAF)
- un **statut** :

| Statut | Signification |
|--------|---------------|
| **AVAILABLE** | Vacant, commercialisable |
| **OCCUPIED** | Occupé (bail actif en principe) |
| **MAINTENANCE** | En travaux / indisponible temporairement |
| **UNAVAILABLE** | Hors parc locatif |

### 5.2 Créer un immeuble

1. Menu → **Immeubles** → **+**
2. Saisir nom, adresse, informations du bâtiment
3. Enregistrer

### 5.3 Ajouter un logement

1. Ouvrir l’**immeuble**
2. **Ajouter une unité** : libellé, pièces, surface, **loyer**, statut
3. Enregistrer  

*Alternative :* menu **Biens / Logements** pour la liste transversale.

### 5.4 Changer le prix (loyer) d’un logement

1. Menu → **Immeubles** (ou **Biens / Logements**)
2. Ouvrir l’immeuble → ouvrir le **logement**
3. Modifier le champ **Loyer** (XAF) → **Enregistrer**

**Si un bail est déjà actif :**

- Le loyer du **contrat** peut rester celui du bail jusqu’à renouvellement / avenant.
- Menu → **Contrats** → ouvrir le bail → **Renouveler** ou ajuster le loyer du bail si proposé.
- Les **prochaines échéances** dans Paiements suivent le bail actif.

> L’IA **explique** ce parcours ; elle ne modifie pas encore le prix automatiquement sans passer par les écrans d’édition.

---

## 6. Locataires et portail

### 6.1 Principe

> **Un locataire ne crée jamais seul son compte.**  
> L’organisation **provisionne** l’accès portail.

### 6.2 Ajouter un locataire (étapes)

1. Menu → **Locataires** → **+**
2. Identité : prénom, nom, pièce d’identité, contacts
3. Associer un **logement** / créer le **contrat** si proposé
4. ITC crée le **compte portail** + affiche identifiant et mot de passe temporaire (**une fois**)
5. Remettre les accès au locataire (changement de mot de passe au 1er login)

### 6.3 Statuts du compte portail

| Statut | Signification |
|--------|---------------|
| **PROVISIONED** | Compte créé, jamais connecté |
| **INVITE_SENT** | Identifiants envoyés (e-mail / SMS) |
| **ACTIVATED** | Mot de passe définitif choisi |
| **SUSPENDED** | Accès coupé |
| **ARCHIVED** | Ancien locataire (historique conservé) |

### 6.4 Provision automatique

Par défaut, quand un bail passe **ACTIVE**, ITC peut **provisionner automatiquement** le portail locataire (configurable dans les paramètres org).

### 6.5 Retirer un locataire

1. **Locataires** → fiche
2. **Retirer le locataire**
3. Choisir le motif (départ, fin de bail, impayés…)

ITC résilie le(s) bail(s), libère le logement et archive le portail. **L’historique reste.**

### 6.6 Espace locataire (portail)

Le locataire voit **uniquement** :

| Écran | Contenu |
|-------|---------|
| Accueil | Résumé |
| Bail | Son contrat |
| Loyers | Échéances / paiements |
| SAV | Créer et suivre une maintenance |
| Profil | Compte, notifications |

Il **ne voit jamais** les autres locataires ni les finances de l’organisation.

---

## 7. Contrats / baux

### 7.1 Statuts de bail

| Statut | Signification |
|--------|---------------|
| **DRAFT** | Brouillon |
| **ACTIVE** | En cours |
| **EXPIRED** | Expiré |
| **TERMINATED** | Résilié |

### 7.2 Créer / activer un bail

1. Menu → **Contrats**
2. Créer un bail : locataire + logement + dates + loyer
3. **Activer** le bail → génération des échéances de loyers

### 7.3 Actions sur un bail

- **Générer le contrat PDF**
- **Renouveler** (+12 mois par défaut)
- **Résilier**

### 7.4 Générer un contrat PDF (interface)

1. **Contrats** → menu du bail → **Générer le contrat PDF**  
2. Vérifier identité, loyers, blocs signature avant usage

### 7.5 Générer un contrat PDF (via Intelligence ITC)

1. Onglet **IA** → « Génère le contrat PDF de [nom locataire] »
2. ITC **propose** l’action (bail ACTIVE le plus pertinent)
3. Répondre **« oui »** ou **« confirme »** → PDF créé + lien **Ouvrir le PDF**

> Toute génération PDF passe par **proposition → confirmation**. Jamais de PDF automatique sans votre accord.

---

## 8. Paiements et loyers

### 8.1 Statuts de paiement

| Statut | Signification |
|--------|---------------|
| **PENDING** | En attente |
| **PAID** | Payé |
| **LATE** | Retard (échéance dépassée) |
| **PARTIAL** | Paiement partiel |
| **CANCELLED** | Annulé |

### 8.2 Règle importante

> **Bail ACTIVE ≠ loyers à jour.**  
> Un locataire peut avoir un contrat actif **et** des impayés.

### 8.3 Consulter les paiements

1. Menu → **Paiements**
2. Filtrer : **Impayés** / **En attente** / **Payés**
3. Ouvrir une échéance pour le détail

**Via IA :** « mes impayés », « qui n’a pas payé », « encaissements du mois ».

### 8.4 Marquer un loyer comme payé

1. **Paiements** → ouvrir l’échéance
2. **Marquer payé** : montant, mode de paiement, référence
3. Enregistrer

Les indicateurs du **dashboard** et de l’**IA** utilisent ces données.

### 8.5 Reçu / quittance PDF

**Interface :**

1. **Paiements** → paiement **déjà encaissé** → générer le reçu

**Via IA :**

1. « Génère un reçu de paiement pour [locataire] »
2. Confirmer → PDF reçu

### 8.6 Avis de paiement (rappel)

Pour un loyer **en attente** ou **en retard** :

1. « Génère un avis de paiement pour … »
2. Confirmer → PDF avis

---

## 9. Maintenance

### 9.1 Cycle de vie d’un ticket

```
OPEN → ASSIGNED → IN_PROGRESS → COMPLETED / CLOSED
```

Priorités : **LOW**, **MEDIUM**, **HIGH**, **CRITICAL**.

### 9.2 Qui crée un ticket ?

| Origine | Comment |
|---------|---------|
| **Locataire** | Portail → SAV → signaler un problème |
| **Gestionnaire / propriétaire** | Menu Maintenance |
| **Intelligence ITC** | Photo dégât + confirmation |

### 9.3 Desk maintenance (gestionnaire)

1. Menu → **Maintenance**
2. Filtrer : ouvertes / assignées / clôturées
3. Ouvrir un ticket → **assigner** un agent terrain ou **clôturer**

### 9.4 Espace agent terrain

1. **Espace terrain** → **Interventions**
2. Voir uniquement les missions **assignées**
3. Accepter → démarrer → terminer

### 9.5 Maintenance via Intelligence ITC (photo)

**Scénario complet (Phase K) :**

| Étape | Action | Résultat attendu |
|-------|--------|------------------|
| 1 | Envoyer une **photo** (fuite, dégât) + préciser le logement (ex. « Appt 3B ») | Constat + **proposition de ticket** |
| 2 | Répondre **« oui »** / **« confirme »** | Ticket créé (statut OPEN) |
| 3 | « Assigne le ticket à [Nom Agent] » | Proposition d’assignation |
| 4 | **« oui »** | Statut **ASSIGNED** + nom de l’agent |

**Si le logement est inconnu :** l’IA demande le libellé — elle **n’invente pas** de ticket.

---

## 10. Équipe et agents

### 10.1 Créer un collaborateur

1. Connecté en **Propriétaire**
2. Menu → **Équipe (Agents)** → **+**
3. Choisir le rôle :
   - **Gestionnaire (MANAGER)** — ops locatives complètes
   - **Terrain (AGENT)** — interventions seulement
4. Remplir identité → **Créer**
5. **Noter immédiatement** LoginId + mot de passe temporaire

### 10.2 Où voir le LoginId d’un agent

1. Menu → **Équipe**
2. Ouvrir la **fiche** de l’agent
3. Section **Compte / Identité** : LoginId (ex. `ITC-XXXX`) et statut **Actif**

**Via IA :** « mes agents » → liste avec LoginId.

### 10.3 Mot de passe agent — rappel

| Moment | Visible ? |
|--------|-----------|
| À la **création** | Oui, **une seule fois** |
| Sur la fiche ensuite | **Non** (LoginId + statut seulement) |
| Après perte | Propriétaire → **Régénérer** sur la fiche |

### 10.4 Se connecter en agent

1. Écran de connexion ITC
2. Saisir **LoginId** (ou e-mail) + mot de passe
3. Changer le mot de passe si demandé au 1er login

---

## 11. Tableau de bord et rapports

### 11.1 Dashboard (Tableau)

- Taux d’**occupation**
- **Encaissements** du mois
- **Impayés** (nombre et montant XAF)
- Alertes et notifications

### 11.2 Rapports

- Menu **Rapports** / **Vue globale** (surtout **propriétaire**)
- Exports selon abonnement et permissions

### 11.3 Via Intelligence ITC — Analyser

Onglet ou questions du type :

- « Résumé de mon parc »
- « Qui n’a pas payé ? »
- « Combien de logements vacants ? »
- « Pourquoi baisse les encaissements ? »

L’IA s’appuie sur les **données Prisma** (pas d’invention de chiffres).

---

## 12. Paramètres, sécurité et compte

### 12.1 Paramètres / Profil

- Identité, préférences notifications
- **Mot de passe**, **MFA**, **Sessions**
- **Abonnement** (plan — propriétaire)
- **Équipe** — créer gestionnaire ou terrain

### 12.2 Visibilité des menus

| Rôle | Menus CRM (immeubles, équipe, finances globales) |
|------|--------------------------------------------------|
| OWNER / MANAGER | Oui |
| AGENT terrain | Non (interventions seulement) |
| TENANT | Non (portail limité) |

---

## 13. Intelligence ITC (IA)

### 13.1 Onglets et fonctions

| Fonction | Description |
|----------|-------------|
| **Chat** | Questions données + « comment faire » dans l’app |
| **Analyser** | LIA — vue d’ensemble, revenus, occupation, impayés |
| **Micro** | Dictée vocale puis envoi |
| **Image (+)** | Photo → vision (OCR, dégâts, documents) |
| **Lire la réponse** | Synthèse vocale (TTS) |

Indicateur **« IA connectée »** : le service backend répond (clé OpenAI configurée côté serveur).

### 13.2 Types de questions

| Type | Exemples |
|------|----------|
| **Données** | « mes impayés », « mes logements », « mes contrats », « mes agents » |
| **Mode d’emploi** | « comment ajouter un locataire ? », « comment changer le prix d’un logement ? » |
| **Actions** | « génère le contrat PDF de … », « crée le ticket », « envoie WhatsApp à … » |
| **Confirmation** | « oui », « confirme », « annule » |

### 13.3 Règle propose → confirm

Actions **sensibles** (toujours avec confirmation) :

- Génération **PDF** (contrat, reçu, avis)
- **Création de bail**
- **Ticket maintenance** et **assignation**
- **Message locataire** / **WhatsApp**
- **Automatisations** (relances impayés, etc.)

Quand une action est en attente, l’IA rappelle : *« Répondez oui pour confirmer, ou annule »*.

### 13.4 Vision (envoi d’image)

**Formats recommandés :** JPG, PNG, WebP — photo nette, idéalement **< 4 Mo**.

| Type de photo | Comportement |
|---------------|--------------|
| **Dégât** (fuite, fissure…) | Constat + gravité + plan maintenance + proposition ticket |
| **Document / reçu** | Extraction texte + résumé |
| **Pièce d’identité** | Lecture prudente (IDENTITY) |
| **Photo de bien** | Description état apparent |

En cas d’échec : message clair + invitation à décrire en texte ou renvoyer une photo plus légère.

### 13.5 Exemples de phrases utiles

```
Comment ajouter un locataire ?
Où voir les identifiants des agents ?
Mes impayés
Génère le contrat PDF de [Nom Prénom]
Génère un reçu pour le paiement de …
[Photo fuite] fuite sous l'évier Appt 3B
Oui, crée le ticket
Assigne le ticket à Jean
Oui
À quoi sert le MFA ?
Comment changer le prix d'un logement ?
```

---

## 14. WhatsApp et messages

### 14.1 WhatsApp texte (supporté)

1. « Prépare une relance WhatsApp pour l’impayé de [locataire] »
2. ITC **propose** le message
3. **Confirmer** → envoi via **Meta Cloud API**
4. Succès : ID fournisseur Meta + statut **SENT**

Erreur token Meta : message explicite *« Token Meta invalide… »* (pas de faux succès).

### 14.2 Non supporté

- WhatsApp **audio**
- WhatsApp **image / média**

### 14.3 Message locataire in-app

« Envoie un message au locataire … » → proposition → confirmation.

---

## 15. Documents PDF

| Document | Déclencheur | Confirmation |
|----------|-------------|--------------|
| **Contrat de location** | UI Contrats ou IA | Oui |
| **Reçu de paiement** | UI Paiements ou IA | Oui |
| **Avis de paiement** | UI ou IA | Oui |

**Stockage :** Cloudinary (recommandé) ou disque serveur `/uploads` si Cloudinary absent.

**Non générable aujourd’hui par l’IA :** état des lieux, rapport d’inspection, lettre locataire (templates futurs).

**OCR clause PDF fichier :** non supporté — utiliser les **faits du bail** en base ou une **photo** du document.

---

## 16. Automatisations

Relances et tâches automatisées (ex. impayés, échéances de bail) :

1. L’IA **propose** un plan d’automatisation
2. Vous **approuvez** (`APPROVE_AUTOMATION_RUN`)
3. Exécution via n8n / moteur automation (si activé org)

> Distinct du flux **ticket maintenance** photo → confirm (Phase K).

---

## 17. Règles métier importantes

1. **Périmètre** = votre organisation uniquement (JWT).
2. **Monnaie** = **XAF** (Franc CFA).
3. **Mémoire IA** = préférences utilisateur ; **jamais** source des montants ou statuts.
4. **Prisma / services backend** = vérité pour loyers, impayés, baux.
5. **Pas de création silencieuse** : ticket, PDF, WhatsApp = toujours confirmés.
6. **Logement OCCUPIED** ↔ bail ACTIVE en principe ; **AVAILABLE** = vacant.
7. **Comparaison de baux** : possible par identifiants lease ; pas d’OCR inventé.

---

## 18. Limites actuelles (honnêteté produit)

| Demande | Statut |
|---------|--------|
| OCR / extraire une clause d’un **PDF fichier** | **NOT_SUPPORTED** — photo ou faits bail |
| WhatsApp audio / image | **NOT_SUPPORTED** — texte seulement |
| État des lieux PDF | **NOT_SUPPORTED** (template prévu) |
| Modifier le loyer **directement par l’IA** | **Non** — écran Logements / Contrats |
| Vision sur PDF upload chat | Bridge **faits Prisma** ; pas OCR fichier |

L’IA répond **honnêtement** plutôt que d’inventer ou de lister tout le parc sans rapport.

---

## 19. Référence technique rapide

### 19.1 Application mobile (référence)

| Élément | Valeur |
|---------|--------|
| Package production (Flutter) | `cg.immo.tec.immo_tec` |
| Label | ITC / Intelligence ITC |
| Backend | Railway `/api/v1` |

### 19.2 Endpoints IA principaux

| Méthode | Route | Usage |
|---------|-------|-------|
| POST | `/ai/chat` | Conversation texte |
| POST | `/ai/vision` | Upload image |
| POST | `/ai/confirm` | Confirmer action pending |
| POST | `/ai/speak` | Synthèse vocale |
| POST | `/ai/transcribe` | Dictée → texte |

### 19.3 Modules API (backend)

Auth, Buildings, Apartments, Tenants, Leases, Payments, Maintenance, Dashboard, AI, Agents, Portal, Notifications, Documents, Automations, Subscriptions.

### 19.4 Documentation complémentaire (dépôt)

| Fichier | Sujet |
|---------|-------|
| `docs/BUSINESS_HIERARCHY.md` | Hiérarchie rôles |
| `docs/identity-tenant-provisioning-v1.md` | Portail locataire |
| `docs/feature-access-control.md` | Permissions features |
| `qa-e2e/PHASE_J_AI_INTELLIGENCE_2.0.md` | Intelligence 2.0 |
| `qa-e2e/PHASE_K_REAL_ACTIONS.md` | Tickets / assignation |
| `src/modules/ai/ai.app-guide.ts` | Réponses « comment faire » (source code) |

---

## Annexe A — Checklist démarrage organisation

- [ ] Compte **propriétaire** actif  
- [ ] Au moins un **immeuble** + **logements**  
- [ ] **Gestionnaire** créé (LoginId + mdp temporaire notés)  
- [ ] Premier **locataire** + **bail ACTIVE**  
- [ ] Vérifier **échéances** dans Paiements  
- [ ] Tester **Intelligence ITC** : « mes logements », « mes impayés »  
- [ ] (Optionnel) Agent **terrain** + test maintenance  

---

## Annexe B — Glossaire

| Terme | Définition |
|-------|------------|
| **LoginId** | Identifiant `ITC-XXXXXXXX` |
| **Pending action** | Action IA en attente de confirmation |
| **Desk** | Interface gestionnaire maintenance |
| **SAV** | Service après-vente locataire |
| **LIA** | Analyses IA sur le parc |
| **XAF** | Franc CFA (monnaie) |

---

*Document généré à partir du code et de la documentation produit ITC (imo-backend). Pour toute évolution fonctionnelle, se référer aux releases et à `qa-e2e/`.*
