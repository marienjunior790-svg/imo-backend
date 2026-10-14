# ITC — Guide complet de l’application

Ce document décrit chaque onglet, écran, section, bouton, statut et couleur de l’application mobile ITC, avec le but précis de chacun.
Il est généré automatiquement depuis le guide intégré à l’assistant IA d’ITC (`src/modules/ai/ai.app-manual.ts`) : l’IA répond aux clients avec exactement ces informations.

## Sommaire

**Prise en main**

- [ITC en bref : à quoi sert l’application et qui fait quoi](#fiche-overview)
- [Navigation : la barre d’onglets en bas de l’écran](#fiche-navigation)
- [Se connecter (propriétaire, agent, locataire)](#fiche-login)
- [Mot de passe oublié ou mot de passe provisoire perdu](#fiche-forgot-password)
- [Changer son mot de passe et règles de sécurité](#fiche-change-password)
- [Double authentification (MFA)](#fiche-mfa)
- [Créer mon entreprise (inscription)](#fiche-signup)

**Accueil**

- [Accueil : le tableau de bord, section par section](#fiche-dashboard)
- [Accueil › « À traiter »](#fiche-dashboard-todo)
- [Accueil › « Situation du mois » et « Indicateurs » : définitions](#fiche-dashboard-month)
- [Accueil › « Gestion » et « Actions rapides »](#fiche-dashboard-shortcuts)

**Biens**

- [Onglet Biens : la liste des immeubles](#fiche-properties)
- [Créer ou modifier un immeuble](#fiche-building-form)
- [Fiche immeuble et maquette 3D](#fiche-building-detail)
- [Fiche logement : actions et changement de statut](#fiche-unit-panel)
- [Types de biens et caractéristiques d’un logement](#fiche-unit-types)
- [Ajouter des logements dans un immeuble](#fiche-add-units)
- [Dépenses d’un immeuble](#fiche-expenses)

**Locataires**

- [Locataires : la liste](#fiche-tenants)
- [Ajouter un locataire (avec son contrat)](#fiche-tenant-new)
- [Fiche locataire et accès à l’application](#fiche-tenant-detail)
- [Départ d’un locataire, modification ou suppression](#fiche-tenant-leave)

**Contrats**

- [Contrats (baux) : la liste](#fiche-leases)
- [Créer un contrat](#fiche-lease-new)
- [Fiche contrat : PDF, activer, renouveler, résilier](#fiche-lease-detail)

**Paiements**

- [Paiements : suivre les loyers](#fiche-payments)
- [Encaisser un loyer](#fiche-payment-record)
- [Annuler un encaissement saisi par erreur](#fiche-payment-cancel)
- [Reçu et avis de paiement (PDF)](#fiche-payment-documents)

**Maintenance**

- [Maintenance : la liste des tickets](#fiche-maintenance)
- [Créer un ticket et choisir la priorité](#fiche-ticket-new)
- [Suivi d’un ticket : étapes et statuts](#fiche-ticket-workflow)
- [Confier une intervention à un agent ou à un prestataire](#fiche-ticket-assign)

**Équipe**

- [Équipe : vos agents terrain](#fiche-team)
- [Créer un agent terrain (et le cas du gestionnaire)](#fiche-agent-new)
- [Fiche agent : identifiant, mot de passe, suspension](#fiche-agent-detail)

**Notifications et relances**

- [Notifications (la cloche)](#fiche-notifications)
- [Relances et rappels automatiques des loyers](#fiche-reminders)

**Rapports et assistant IA**

- [Rapports](#fiche-reports)
- [Assistant IA « Intelligence ITC » (onglet IA)](#fiche-assistant)

**Paramètres et sécurité**

- [Paramètres : vue d’ensemble](#fiche-settings)
- [Modifier mon profil](#fiche-profile)
- [Apparence : les thèmes de l’application](#fiche-themes)
- [Préférences de notifications](#fiche-notification-settings)
- [Appareils connectés et activité du compte](#fiche-devices)
- [Aide et support](#fiche-support)

**Abonnement**

- [Abonnement : formules, limites et blocage](#fiche-subscription)

**Espace agent terrain**

- [Espace agent terrain : missions](#fiche-agent-space)

**Espace locataire**

- [Espace locataire : ce que voit le locataire](#fiche-tenant-space)

**Couleurs et statuts**

- [Code couleur : signification et niveau d’importance](#fiche-colors)
- [Catalogue complet des statuts, par module](#fiche-status-catalogue)
- [Identité visuelle ITC](#fiche-brand)

**Limites, glossaire**

- [Ce que l’application ne fait pas encore](#fiche-limits)
- [Glossaire](#fiche-glossary)

---

## Prise en main

<a id="fiche-overview"></a>

### ITC en bref : à quoi sert l’application et qui fait quoi

ITC (Immo · Tec · Conseil) est l’application de gestion locative : immeubles, logements, locataires, contrats, loyers, maintenance et équipe terrain, au même endroit.  
  
Quatre profils, chacun avec son propre espace :  
• Propriétaire / dirigeant : il crée l’entreprise, supervise tout le parc, gère l’équipe, l’abonnement et consulte les rapports.  
• Gestionnaire : mêmes écrans de gestion que le propriétaire (locataires, contrats, paiements, maintenance) pour le travail quotidien.  
• Agent terrain : il ne voit que ses missions de maintenance (accepter, démarrer, terminer, compte rendu).  
• Locataire : il voit son contrat, ses loyers et signale ses problèmes (fuite, panne…).  
  
Le parcours type :  
1. Créer l’entreprise (écran de connexion › « Créer mon entreprise »).  
2. Créer les immeubles puis les logements (onglet Biens).  
3. Ajouter les locataires avec leur contrat (Accueil › Locataires › « Nouveau locataire »).  
4. Encaisser les loyers chaque mois (Accueil › Paiements).  
5. Suivre les pannes (Accueil › Maintenance) et les confier aux agents terrain (Accueil › Équipe).  
6. Piloter avec l’Accueil, les Rapports et l’assistant IA.  
  
Les agents et les locataires ne s’inscrivent pas eux-mêmes : c’est vous qui créez leurs accès, ITC génère leur identifiant et un mot de passe provisoire.

*Questions reconnues par l’IA : comment ca marche, comment marche, comment fonctionne, aide, marche l application, fonctionne l application, utiliser l application, utiliser itc, c est quoi itc, qu est ce que itc, presentation, hierarchie…*

<a id="fiche-navigation"></a>

### Navigation : la barre d’onglets en bas de l’écran

La navigation se fait par la barre d’onglets en bas de l’écran. Il n’y a pas de menu latéral.  
  
Propriétaire et gestionnaire (4 onglets) :  
• Accueil : le tableau de bord, et l’accès à tous les écrans de gestion (Locataires, Contrats, Paiements, Maintenance, Équipe, Rapports, Notifications) par les tuiles et les « Actions rapides ».  
• Biens : les immeubles, leur maquette 3D et leurs logements.  
• IA : l’assistant « Intelligence ITC » (Discussion et Analyses).  
• Paramètres : profil, thème, abonnement, sécurité, aide.  
  
Agent terrain (3 onglets) : Accueil, Missions, Paramètres.  
Locataire (4 onglets) : Accueil, Loyers, Demandes, Paramètres.  
  
Astuces :  
• La flèche en haut à gauche (ou le bouton retour du téléphone) revient à l’écran précédent.  
• Tirez l’écran vers le bas pour actualiser une liste ou le tableau de bord.  
• Les messages de confirmation (« Locataire enregistré », « Ticket créé »…) s’affichent brièvement en bas de l’écran.

*Questions reconnues par l’IA : onglet, onglets, barre du bas, barre d onglets, menu principal, navigation, naviguer, ou se trouve, ou trouver, revenir en arriere, bouton retour, menu…*

<a id="fiche-login"></a>

### Se connecter (propriétaire, agent, locataire)

Écran de connexion :  
1. Champ « E-mail ou n° client » :  
   • propriétaire : l’e-mail utilisé à l’inscription ;  
   • agent terrain et locataire : l’identifiant ITC remis par l’agence (format ITC-XXXX), ou leur e-mail s’ils en ont donné un.  
2. Champ « Mot de passe », puis « Se connecter ».  
3. Si la double authentification est activée, un champ « Code MFA (6 chiffres) » apparaît : saisissez le code de votre application d’authentification puis « Valider MFA ».  
  
Première connexion d’un agent ou d’un locataire : il utilise le mot de passe provisoire reçu, puis l’application lui demande immédiatement de choisir son mot de passe personnel (8 caractères minimum, une majuscule, une minuscule, un chiffre).  
  
Où trouver l’identifiant d’un agent : Accueil › Équipe › fiche de l’agent › section « Compte ». D’un locataire : Accueil › Locataires › fiche › section « Espace locataire ITC ».  
  
Après plusieurs mots de passe erronés, le compte est « verrouillé temporairement » : patientez quelques minutes avant de réessayer.

*Questions reconnues par l’IA : se connecter, connexion, me connecter, connecter, ecran de connexion, n client, numero client, login, compte agent, compte locataire, premiere connexion, compte verrouille…*

<a id="fiche-forgot-password"></a>

### Mot de passe oublié ou mot de passe provisoire perdu

Le mot de passe provisoire n’est affiché qu’une seule fois, à la création du compte : ITC ne le conserve pas en clair. S’il est perdu, on en génère un nouveau.  
  
• Agent terrain : Accueil › Équipe › ouvrez la fiche de l’agent › « Nouveau mot de passe provisoire » › Confirmer. Une carte affiche l’identifiant et le nouveau mot de passe provisoire, avec un bouton « Envoyer par SMS ».  
• Locataire : Accueil › Locataires › ouvrez sa fiche › section « Espace locataire ITC » › « Nouveau mot de passe provisoire » › Confirmer.  
• Propriétaire : sur l’écran de connexion, saisissez votre e-mail puis touchez « Mot de passe oublié » ; suivez le lien de réinitialisation reçu par e-mail.  
  
Conséquences : l’ancien mot de passe cesse de fonctionner et les appareils de la personne sont déconnectés. À sa prochaine connexion, elle choisit son propre mot de passe.

*Questions reconnues par l’IA : mot de passe oublie, oublie mon mot de passe, oublie son mot de passe, oublie le mot de passe, mot de passe perdu, mot de passe temporaire, mot de passe provisoire, plus le mot de passe, reinitialiser, reinitialisation, regenerer, nouveau mot de passe provisoire…*

<a id="fiche-change-password"></a>

### Changer son mot de passe et règles de sécurité

Paramètres › Sécurité › « Mot de passe » : saisissez le mot de passe actuel puis le nouveau.  
  
Règles (vérifiées en direct, chaque règle passe au vert quand elle est respectée) :  
• 8 caractères minimum ;  
• une majuscule ;  
• une minuscule ;  
• un chiffre.  
  
Conseil : choisissez un mot de passe que vous n’utilisez nulle part ailleurs, et activez la double authentification.

*Questions reconnues par l’IA : changer mon mot de passe, changer le mot de passe, changer son mot de passe, modifier le mot de passe, modifier mon mot de passe, regles du mot de passe, mot de passe valide, majuscule, minuscule, mot de passe refuse*

<a id="fiche-mfa"></a>

### Double authentification (MFA)

La double authentification (MFA, authentification multi-facteurs) ajoute un code à 6 chiffres en plus du mot de passe. Même si votre mot de passe est volé, personne ne peut ouvrir votre compte sans votre téléphone. Elle est fortement recommandée pour le propriétaire, car le compte donne accès aux contrats et aux données des locataires.  
  
Activer : Paramètres › Sécurité › « Double authentification » (indique « Désactivée · recommandée » en orange) › « Commencer » :  
1. « Ouvrir l’application d’authentification » (Google Authenticator, Microsoft Authenticator…) ou saisissez la clé affichée.  
2. Notez les codes de secours : chacun permet une connexion si vous perdez votre téléphone. Ils ne seront plus affichés.  
3. Saisissez le code à 6 chiffres affiché par l’application › « Activer la double authentification ». La ligne passe à « Activée » en vert.  
  
Ensuite, chaque connexion demande le code. Pour désactiver : même écran, mot de passe + code actuel › « Désactiver la double authentification ».

*Questions reconnues par l’IA : mfa, 2fa, double authentification, authentification, multi facteur, code a 6 chiffres, google authenticator, authenticator, codes de secours, code de secours, totp*

<a id="fiche-signup"></a>

### Créer mon entreprise (inscription)

Écran de connexion › « Créer mon entreprise » (rubrique « Vous gérez des biens immobiliers ? »).  
  
Formulaire :  
• Dirigeant : prénom, nom, e-mail (il servira d’identifiant), téléphone (facultatif).  
• Entreprise : nom de l’entreprise ou de l’agence, mot de passe et confirmation (8 caractères, une majuscule, une minuscule, un chiffre).  
  
« Comment ça marche » :  
1. Vous créez l’entreprise : compte dirigeant, supervision de tout le parc.  
2. Vous ajoutez vos agents terrain : identifiant et mot de passe générés, espace agent.  
3. Vous ajoutez vos locataires : identifiant et mot de passe générés, espace locataire.  
  
L’abonnement démarre pour 30 jours. Les agents et les locataires ne passent jamais par cette inscription : ils utilisent les identifiants remis par l’agence.

*Questions reconnues par l’IA : creer mon entreprise, creer une entreprise, creer son entreprise, inscription, s inscrire, creer un compte, ouvrir un compte, nouvelle agence, essai gratuit, periode d essai*

---

## Accueil

<a id="fiche-dashboard"></a>

### Accueil : le tableau de bord, section par section

L’Accueil donne en un coup d’œil l’état de votre gestion. De haut en bas :  
1. En-tête : logo ITC et cloche des notifications (pastille rouge = nombre de notifications non lues).  
2. Salutation : votre prénom, le nom de l’organisation et votre rôle.  
3. Bandeau orange « Abonnement … » : seulement si l’abonnement n’est plus actif (consultation possible, ajouts et modifications bloqués).  
4. « À traiter » : les urgences du moment (impayés en rouge, tickets de maintenance en orange) ou « Rien d’urgent pour le moment » en vert.  
5. « Situation du mois » : attendu, encaissé, impayés, taux d’occupation et barre de recouvrement.  
6. « Gestion » : 4 tuiles Locataires, Contrats, Paiements, Maintenance.  
7. « Indicateurs » : 6 chiffres clés (loyers du mois, recouvrement, occupation, maintenance, contrats actifs, biens gérés).  
8. « Actions rapides » : raccourcis à faire défiler (Locataire, Encaisser, Contrat, Ticket, Bien, Équipe, Agent, Rapports).  
9. « Parc immobilier » : immeubles et logements occupés, puis la carte Contrats.  
  
Tirez vers le bas pour actualiser les chiffres.

*Questions reconnues par l’IA : accueil, tableau de bord, dashboard, page d accueil, ecran d accueil, premier ecran, sections de l accueil, vue globale*

<a id="fiche-dashboard-todo"></a>

### Accueil › « À traiter »

« À traiter » liste ce qui demande votre action, par ordre d’importance :  
• Ligne rouge « Impayés · montant XAF » : total des loyers non réglés. Touchez-la pour ouvrir Paiements.  
• Ligne orange « N ticket(s) maintenance » : interventions encore ouvertes, assignées ou en cours. Touchez-la pour ouvrir Maintenance.  
• Ligne verte « Rien d’urgent pour le moment » : aucun impayé ni ticket actif.  
  
Pour une liste de priorités détaillée, demandez à l’assistant IA : « Quelles sont mes priorités du jour ? ».

*Questions reconnues par l’IA : a traiter, rien d urgent, urgences, quoi faire en priorite, priorites*

<a id="fiche-dashboard-month"></a>

### Accueil › « Situation du mois » et « Indicateurs » : définitions

« Situation du mois » :  
• Attendu : total des loyers dus pour le mois en cours.  
• Encaissé (vert) : sommes réellement reçues ce mois-ci.  
• Impayés (rouge) : reste à encaisser, retards compris.  
• Occupation (doré) : logements occupés ÷ total des logements, en %.  
• Barre verte « Recouvrement » : encaissé ÷ attendu, en %. 100 % = tous les loyers du mois sont payés.  
  
« Indicateurs » (6 tuiles) :  
• Loyers du mois (XAF) : montant encaissé ce mois.  
• Taux de recouvrement : voir ci-dessus.  
• Occupation : voir ci-dessus.  
• Maintenance : nombre de tickets actifs.  
• Contrats actifs : baux en cours.  
• Biens gérés : nombre total de logements.  
  
Repères : un recouvrement sous 80 % ou une occupation sous 70 % méritent une action (relances, commercialisation).

*Questions reconnues par l’IA : situation du mois, attendu, encaisse, taux de recouvrement, recouvrement, taux d occupation, occupation, indicateurs, loyers du mois, biens geres, contrats actifs, chiffres…*

<a id="fiche-dashboard-shortcuts"></a>

### Accueil › « Gestion » et « Actions rapides »

« Gestion » : 4 tuiles qui ouvrent les écrans de travail.  
• Locataires : nombre de locataires.  
• Contrats : nombre de contrats actifs.  
• Paiements : montant impayé (rouge) ou « Tout est à jour » (vert).  
• Maintenance : nombre de tickets ouverts (orange).  
  
« Actions rapides » (faites défiler horizontalement) :  
• Locataire : formulaire « Nouveau locataire ».  
• Encaisser : liste des paiements pour enregistrer un loyer.  
• Contrat : formulaire « Nouveau contrat ».  
• Ticket : formulaire « Nouveau ticket » de maintenance.  
• Bien : formulaire « Nouvel immeuble ».  
• Équipe : liste des agents terrain.  
• Agent : formulaire « Nouvel agent terrain ».  
• Rapports : synthèse financière.  
  
« Parc immobilier » : carte « Immeubles & logements » (occupés sur total, barre bleue) qui ouvre l’onglet Biens, et carte « Contrats ».

*Questions reconnues par l’IA : actions rapides, raccourcis, raccourci, tuiles, tuile, gestion, parc immobilier, boutons de l accueil*

---

## Biens

<a id="fiche-properties"></a>

### Onglet Biens : la liste des immeubles

L’onglet Biens regroupe votre patrimoine.  
  
Chaque carte d’immeuble affiche : une mini maquette 3D, le nom, le quartier et la ville, le nombre de logements, le pourcentage occupé et une barre dorée d’occupation.  
• Bouton « Nouvel immeuble » en haut de la liste.  
• Touchez un immeuble pour ouvrir sa fiche : maquette 3D interactive, logements, chiffres, dépenses.  
  
Un immeuble contient des logements (appartements, studios, portes…). Les locataires et les contrats sont toujours rattachés à un logement.

*Questions reconnues par l’IA : biens, onglet biens, immeubles, immeuble, mes immeubles, liste des immeubles, mes biens, patrimoine, residence*

<a id="fiche-building-form"></a>

### Créer ou modifier un immeuble

Créer : onglet Biens › « Nouvel immeuble » (ou Accueil › Actions rapides › « Bien »).  
Champs : nom (ex. Résidence Les Palmiers), adresse, quartier ou arrondissement (facultatif), ville (Brazzaville par défaut), nombre d’étages (facultatif), description (facultatif). Puis « Créer l’immeuble ».  
Contrôles : nom d’au moins 2 caractères, adresse d’au moins 3.  
  
Modifier : ouvrez l’immeuble › « Modifier » (nom, adresse, quartier, ville, étages) › « Enregistrer ».  
  
Étape suivante : « Ajouter des logements » dans la fiche de l’immeuble. La suppression d’un immeuble n’est pas proposée dans l’application.

*Questions reconnues par l’IA : creer un immeuble, ajouter un immeuble, nouvel immeuble, modifier l immeuble, modifier un immeuble, ajouter un bien, creer un bien, nouveau bien, enregistrer un immeuble*

<a id="fiche-building-detail"></a>

### Fiche immeuble et maquette 3D

En haut, la maquette 3D de l’immeuble : chaque fenêtre est un logement.  
• Glissez pour tourner, pincez pour zoomer, touchez une fenêtre pour sélectionner le logement.  
• Légende des couleurs : Libre (bleu), Occupé (ambre / jaune doré), En maintenance (orange, la fenêtre clignote), Indisponible (gris). Le logement sélectionné s’éclaire en doré pâle.  
  
Sous la maquette :  
• Le panneau du logement sélectionné (loyer, pièces, surface, locataire, tickets, actions, statut).  
• « Ajouter des logements » (bouton doré), « Dépenses » et « Modifier ».  
• Chiffres de l’immeuble : Occupation (%), Logements occupés (x/y), En maintenance, Loyers attendus, Encaissé ce mois (vert), Impayés (rouge).  
• « Logements par étage » : une pastille de couleur par logement, du dernier étage au rez-de-chaussée. Touchez-en une pour la situer dans la maquette.

*Questions reconnues par l’IA : maquette, 3d, maquette 3d, fiche immeuble, detail immeuble, legende, fenetre, fenetres, etage, etages, logements par etage, clignote…*

<a id="fiche-unit-panel"></a>

### Fiche logement : actions et changement de statut

Dans la fiche d’un immeuble, touchez un logement (maquette ou pastille) pour ouvrir son panneau :  
• Nom, étage et statut (étiquette de couleur).  
• Loyer mensuel, nombre de pièces, surface, locataire et téléphone, tickets de maintenance ouverts.  
  
Actions :  
• Logement libre : « Installer un nouveau locataire » (crée le locataire et son contrat sur ce logement) ou « Contrat pour un locataire existant ».  
• Toujours : « Signaler une intervention » (crée un ticket de maintenance sur ce logement).  
  
« Statut du logement » :  
• Logement avec locataire : Occupé ou En maintenance.  
• Logement sans locataire : Libre, En maintenance ou Indisponible (travaux, usage personnel, hors location).  
Le statut passe automatiquement à Occupé quand un contrat est activé et redevient Libre quand le contrat est résilié.

*Questions reconnues par l’IA : logement, logements, appartement, statut du logement, changer le statut, mettre en maintenance, indisponible, logement libre, installer un nouveau locataire, contrat pour un locataire existant, louer un logement, logement vacant…*

<a id="fiche-unit-types"></a>

### Types de biens et caractéristiques d’un logement

ITC n’impose pas de catalogue fermé du type « Studio / F2 / F3 ». Un bien s’organise en deux niveaux :  
• l’immeuble (nom, adresse, quartier, ville, étages) ;  
• le logement, défini par :  
  – un libellé libre (ex. Porte 3, Appt B2, Studio RDC) ;  
  – un étage ;  
  – un nombre de pièces et une surface en m² (facultatifs) ;  
  – un loyer mensuel en XAF ;  
  – un statut : Libre, Occupé, En maintenance ou Indisponible.  
  
Pour décrire un studio ou un F3, utilisez le libellé et le nombre de pièces. Pour connaître votre parc réel, ouvrez l’onglet Biens ou demandez « combien de logements ai-je ? ».

*Questions reconnues par l’IA : types de biens, type de bien, types de logement, types de logements, type de logement, studio, f2, f3, categorie de logement, categories de biens, pieces, surface…*

<a id="fiche-add-units"></a>

### Ajouter des logements dans un immeuble

Onglet Biens › ouvrez l’immeuble › « Ajouter des logements ». Deux modes :  
• « Un logement » : nom (ex. Porte 3, Appt B2), étage (0 = rez-de-chaussée), pièces et surface (facultatifs), loyer mensuel › « Ajouter le logement ».  
• « Plusieurs d’un coup » : nombre de logements (1 à 200), pièces, surface, loyer › « Générer les logements ». Ils sont nommés « Porte 1 », « Porte 2 »… et répartis par 4 par étage.  
  
Le loyer mensuel est obligatoire. Les nouveaux logements sont Libres (bleu).  
Limite : la formule Starter est plafonnée à 10 logements (« Limite atteinte ») ; les formules Pro et Enterprise sont illimitées.

*Questions reconnues par l’IA : ajouter des logements, ajouter un logement, creer un logement, creer des logements, nouveau logement, generer les logements, plusieurs logements, porte 1, ajouter un appartement, creer un appartement, d un coup, en une fois*

<a id="fiche-expenses"></a>

### Dépenses d’un immeuble

Onglet Biens › ouvrez l’immeuble › « Dépenses ».  
• En haut : total « Ce mois (XAF) » (orange) et « Cette année ».  
• « Ajouter une dépense » : catégorie, montant, date, prestataire ou fournisseur (facultatif), détail (facultatif) › « Enregistrer ».  
• Chaque dépense peut être supprimée (« Supprimer », avec confirmation).  
  
Catégories : Entretien, Réparation, Électricité, Eau, Nettoyage, Gardiennage, Assurance, Impôts et taxes, Travaux, Autre.

*Questions reconnues par l’IA : depense, depenses, charges, frais, facture, ajouter une depense, categorie de depense, gardiennage, electricite, assurance, impots*

---

## Locataires

<a id="fiche-tenants"></a>

### Locataires : la liste

Accueil › tuile « Locataires ».  
• Bouton « Nouveau locataire ».  
• Recherche par nom, téléphone ou e-mail.  
• Chaque carte : nom, téléphone, adresse et une pastille d’accès à l’application :  
  – Pas de compte (gris) : aucun accès créé ;  
  – Compte créé (bleu) : identifiants générés, jamais connecté ;  
  – Compte actif (vert) : le locataire utilise l’application ;  
  – Suspendu (orange) : accès bloqué temporairement ;  
  – Archivé (gris) : ancien locataire.  
Touchez une carte pour ouvrir la fiche du locataire.

*Questions reconnues par l’IA : locataires, liste des locataires, mes locataires, rechercher un locataire, chercher un locataire, trouver un locataire, voir les locataires*

<a id="fiche-tenant-new"></a>

### Ajouter un locataire (avec son contrat)

Accueil › Locataires › « Nouveau locataire » (ou Actions rapides › « Locataire », ou depuis un logement libre › « Installer un nouveau locataire »).  
  
1. Identité : prénom, nom, téléphone (8 chiffres minimum), e-mail, n° de pièce d’identité et adresse actuelle (facultatifs).  
2. « Créer le contrat maintenant » (activé par défaut) : choisissez le logement libre, les dates de début et de fin (12 mois par défaut), le loyer mensuel (pré-rempli avec celui du logement), le dépôt de garantie (facultatif).  
3. « Activer le contrat maintenant » : les échéances mensuelles sont générées tout de suite ; sinon le contrat reste en brouillon.  
4. « Enregistrer le locataire ».  
  
ITC crée automatiquement l’accès du locataire à l’application : une carte affiche son identifiant et son mot de passe provisoire, avec le bouton « Envoyer par SMS ». Notez-les : le mot de passe provisoire ne sera plus affiché. Le locataire choisira son propre mot de passe à la première connexion.  
  
S’il n’y a aucun logement libre, ajoutez-en d’abord un depuis l’onglet Biens.

*Questions reconnues par l’IA : ajouter un locataire, nouveau locataire, creer un locataire, enregistrer un locataire, inscrire un locataire, installer un locataire, installer un nouveau locataire, nouvel occupant*

<a id="fiche-tenant-detail"></a>

### Fiche locataire et accès à l’application

Accueil › Locataires › touchez un locataire.  
• En-tête : nom, téléphone, pastille d’accès, boutons « Appeler » et « SMS ».  
• « Coordonnées » : téléphone, e-mail, pièce d’identité, adresse.  
• « Espace locataire ITC » : statut d’accès, identifiant (en doré), dernière connexion, et selon le cas :  
  – « Créer son accès » (s’il n’a pas de compte) ;  
  – « Nouveau mot de passe provisoire » (mot de passe oublié) ;  
  – « Suspendre l’accès » / « Réactiver l’accès ».  
• « Contrats » : ses baux avec loyer et statut (touchez pour ouvrir).  
• « Derniers paiements » : ses échéances récentes (touchez pour ouvrir).  
• « Notes », si renseignées.

*Questions reconnues par l’IA : fiche locataire, fiche du locataire, espace locataire itc, acces locataire, creer son acces, suspendre l acces, reactiver l acces, pas de compte, compte cree, compte actif, appeler le locataire, contacter le locataire…*

<a id="fiche-tenant-leave"></a>

### Départ d’un locataire, modification ou suppression

Quand un locataire part :  
1. Accueil › Contrats › ouvrez son contrat › « Résilier le contrat » › Confirmer. Le logement redevient Libre.  
2. Sur sa fiche (Accueil › Locataires), section « Espace locataire ITC » › « Suspendre l’accès » si vous voulez couper son accès à l’application.  
  
L’historique (contrats, paiements, tickets) est conservé. La suppression d’un locataire et la modification de sa fiche (nom, téléphone…) ne sont pas encore disponibles dans l’application.

*Questions reconnues par l’IA : retirer un locataire, supprimer un locataire, depart du locataire, locataire part, expulser, faire partir, va partir, veut partir, doit partir, modifier un locataire, modifier la fiche du locataire, liberer le logement…*

---

## Contrats

<a id="fiche-leases"></a>

### Contrats (baux) : la liste

Accueil › tuile « Contrats ». Un contrat (bail) lie un locataire à un logement, avec des dates et un loyer.  
• Bouton « Nouveau contrat ».  
• Filtres : Actifs, Brouillons, Expirés, Résiliés, Tous.  
• Statuts :  
  – Brouillon (bleu) : préparé, pas encore en vigueur, aucune échéance générée ;  
  – Actif (vert) : en vigueur, les loyers sont générés chaque mois ;  
  – Expiré (orange) : la date de fin est passée, à renouveler ;  
  – Résilié (gris) : terminé, le logement a été libéré.

*Questions reconnues par l’IA : contrats, baux, bail, liste des contrats, mes contrats, voir les contrats, brouillon, brouillons, expire, expires, resilie, resilies…*

<a id="fiche-lease-new"></a>

### Créer un contrat

Accueil › Contrats › « Nouveau contrat » (ou Actions rapides › « Contrat », ou depuis un logement libre › « Contrat pour un locataire existant »).  
1. Locataire : choisissez un locataire existant (sinon créez-le d’abord dans Locataires).  
2. Logement libre.  
3. Début et fin du bail (12 mois par défaut ; la fin doit être après le début).  
4. Loyer mensuel (pré-rempli avec celui du logement), dépôt de garantie (facultatif).  
5. « Activer le contrat maintenant » : actif tout de suite avec échéances mensuelles, ou brouillon.  
6. Clauses particulières (facultatif) › « Créer le contrat ».  
  
Pour un nouveau locataire, le plus simple est « Nouveau locataire », qui crée la fiche et le contrat en une fois.

*Questions reconnues par l’IA : creer un contrat, nouveau contrat, faire un contrat, ajouter un contrat, rediger un contrat, activer le contrat maintenant, depot de garantie, caution, clauses particulieres, creer un bail*

<a id="fiche-lease-detail"></a>

### Fiche contrat : PDF, activer, renouveler, résilier

Accueil › Contrats › touchez un contrat.  
• En-tête : loyer mensuel, statut, barre de progression du bail (« Du … au … · reste N jour(s) »).  
• « Détails » : locataire (touchez pour sa fiche), téléphone, logement, dépôt de garantie, date de signature.  
• « Clauses particulières », si renseignées.  
• « Échéances » : chaque mois avec montant et statut (touchez pour ouvrir le paiement).  
  
Actions :  
• « Contrat PDF » : génère le contrat et l’ouvre (toutes formules).  
• « Activer le contrat » (brouillon) : met le bail en vigueur et génère les échéances.  
• « Renouveler pour 12 mois » (actif ou expiré) : prolonge la fin du bail de 12 mois.  
• « Résilier le contrat » (actif ou brouillon, avec confirmation) : le logement redevient Libre.  
  
Le contenu d’un contrat (dates, loyer) ne se modifie pas après création : résiliez puis recréez si nécessaire.

*Questions reconnues par l’IA : activer le contrat, activer un contrat, renouveler, renouvellement, prolonger, resilier, resiliation, contrat pdf, pdf du contrat, imprimer le contrat, telecharger le contrat, generer le contrat…*

---

## Paiements

<a id="fiche-payments"></a>

### Paiements : suivre les loyers

Accueil › tuile « Paiements » (ou Actions rapides › « Encaisser »). Chaque ligne est l’échéance mensuelle d’un contrat actif.  
• Filtres : Tous, En retard, À payer, Partiels, Payés.  
• Résumé : Attendu, Encaissé (vert), Reste dû (rouge) et barre de progression.  
• Regroupement par mois, avec « payé / dû » pour chaque mois.  
• Carte : locataire, logement, montant, statut, et « Payé le … · mode », « Payé X · reste Y » ou « Échéance le … ».  
  
Statuts :  
• À payer (bleu) : échéance à venir ou du jour.  
• En retard (rouge) : date d’échéance dépassée sans paiement complet.  
• Partiel (orange) : une partie seulement a été encaissée.  
• Payé (vert) : réglé en totalité.  
• Annulé (gris) : échéance annulée.  
  
Les échéances sont créées automatiquement pour chaque contrat actif (échéance le 5 du mois) : on ne crée pas de paiement à la main.

*Questions reconnues par l’IA : paiement, loyer, impaye, en retard, a payer, partiel, payes, reste du, liste des paiements, voir les impayes, echeance, qui n a pas paye*

<a id="fiche-payment-record"></a>

### Encaisser un loyer

1. Accueil › Paiements (ou Actions rapides › « Encaisser »).  
2. Ouvrez l’échéance concernée (filtre « En retard » ou « À payer » pour aller plus vite).  
3. Section « Enregistrer un encaissement » :  
   • montant reçu (pré-rempli avec le reste dû, modifiable) ;  
   • mode : Espèces, Mobile Money (par défaut), Virement, Chèque, Autre ;  
   • référence (facultatif, ex. n° de transaction Mobile Money).  
4. « Valider l’encaissement ».  
  
Si le montant est inférieur au reste dû, l’échéance passe en Partiel (orange) ; vous encaisserez le solde plus tard sur la même fiche. Quand tout est payé, elle passe en Payé (vert).  
  
Le locataire ne paie pas dans l’application : c’est l’agence qui enregistre chaque encaissement.

*Questions reconnues par l’IA : encaisser, encaissement, enregistrer un paiement, enregistrer un loyer, marquer paye, marquer comme paye, valider l encaissement, paiement partiel, mobile money, especes, virement, cheque…*

<a id="fiche-payment-cancel"></a>

### Annuler un encaissement saisi par erreur

Accueil › Paiements › ouvrez le paiement (Payé ou Partiel) › « Annuler l’encaissement » › Confirmer.  
L’échéance repasse en impayé (À payer ou En retard selon la date). Vous pouvez ensuite saisir le bon encaissement.

*Questions reconnues par l’IA : annuler un encaissement, annuler l encaissement, annuler un paiement, erreur d encaissement, remettre en impaye, corriger un paiement, mauvais montant*

<a id="fiche-payment-documents"></a>

### Reçu et avis de paiement (PDF)

Sur la fiche d’un paiement (Accueil › Paiements › touchez la ligne) :  
• « Reçu PDF » : pour un paiement Payé ou Partiel. C’est la quittance à remettre au locataire.  
• « Avis de paiement PDF » : pour une échéance À payer, En retard ou Partielle. C’est le rappel du montant dû.  
Le document s’ouvre dans le navigateur ou le lecteur PDF du téléphone, d’où vous pouvez le partager.  
  
Formules : le reçu et l’avis de paiement sont réservés aux formules Pro et Enterprise (message « Quittances PDF réservées au plan Pro et Enterprise » en Starter). Le contrat PDF est inclus dans toutes les formules.  
  
Vous pouvez aussi demander à l’assistant IA : « Génère un reçu de paiement » ; il propose le document et vous confirmez.

*Questions reconnues par l’IA : recu, recus, quittance, quittances, avis de paiement, recu pdf, document pdf, pdf, justificatif, facture de loyer*

---

## Maintenance

<a id="fiche-maintenance"></a>

### Maintenance : la liste des tickets

Accueil › tuile « Maintenance ». Un ticket = un problème à réparer dans un logement.  
• Bouton « Nouveau ticket ».  
• Compteurs : Actifs (orange), Urgents (priorité haute ou critique, rouge s’il y en a), Résolus (vert).  
• Filtres : Actifs, Ouverts, Assignés, En cours, Terminés, Tous.  
• Carte : titre, logement, statut, priorité, date, technicien. L’icône prend la couleur de la priorité.  
  
Les tickets viennent de vous (« Nouveau ticket »), d’un logement (« Signaler une intervention »), de l’assistant IA ou des locataires (« Signaler un problème » dans leur espace).

*Questions reconnues par l’IA : maintenance, tickets, ticket, interventions, intervention, reparation, reparations, panne, pannes, urgents, resolus, tickets ouverts*

<a id="fiche-ticket-new"></a>

### Créer un ticket et choisir la priorité

Accueil › Maintenance › « Nouveau ticket » (ou Actions rapides › « Ticket », ou depuis un logement › « Signaler une intervention »).  
1. Logement concerné.  
2. Problème en quelques mots (ex. fuite salle de bain, 3 caractères minimum).  
3. Détails utiles pour le technicien (facultatif).  
4. Priorité :  
   • Basse (gris) : peut attendre ;  
   • Moyenne (bleu, par défaut) : à planifier ;  
   • Haute (orange) : à traiter rapidement ;  
   • Critique (rouge) : urgence (eau, électricité, sécurité).  
5. « Créer le ticket » : la fiche du ticket s’ouvre pour le confier à quelqu’un.

*Questions reconnues par l’IA : creer un ticket, nouveau ticket, ouvrir un ticket, signaler une panne, declarer une panne, signaler une intervention, priorite, priorites, critique, basse, moyenne, haute*

<a id="fiche-ticket-workflow"></a>

### Suivi d’un ticket : étapes et statuts

Un ticket suit 5 étapes, visibles dans la frise de sa fiche :  
1. Ouvert (orange) : signalé, personne n’est encore désigné. Action : le confier.  
2. Assigné (bleu) : un agent ou un prestataire est désigné. Action : « Démarrer l’intervention ».  
3. En cours (doré) : l’intervention a commencé. Action : « Marquer comme terminée ».  
4. Terminé (vert) : travail fait, en attente de confirmation du locataire. Action : « Clôturer le ticket ».  
5. Clôturé (gris) : dossier fermé. (Annulé, gris : abandonné.)  
  
Sur la fiche : « Informations » (logement, locataire, technicien, type « Prestataire externe », dates, coûts), « Ajouter une note » (ex. pièce commandée) tant que le ticket est actif, et « Historique » de tous les événements. Les messages du locataire sont marqués « Locataire » avec un point bleu.  
  
L’agent terrain fait les mêmes étapes depuis son espace, et le locataire peut confirmer la réparation depuis le sien.

*Questions reconnues par l’IA : etapes, workflow, ouvert, assigne, en cours, termine, cloture, cloturer, clotures, demarrer l intervention, marquer comme terminee, historique du ticket…*

<a id="fiche-ticket-assign"></a>

### Confier une intervention à un agent ou à un prestataire

Sur un ticket Ouvert, section « Confier l’intervention » :  
• Agent terrain : la liste de vos agents s’affiche avec leur charge (« disponible » ou « N en cours ») › « Confier ». L’agent reçoit la mission dans son espace ITC et la suit jusqu’à la clôture.  
• Prestataire externe sans compte ITC : saisissez le nom du prestataire ou de l’entreprise › « Assigner le prestataire ». Vous ferez alors avancer le ticket vous-même.  
• Aucun agent ? Bouton « Créer un agent terrain ».  
  
Vous pouvez aussi demander à l’assistant IA : « Assigne ce ticket à … » ; il propose l’assignation et vous confirmez.

*Questions reconnues par l’IA : assigner, confier, attribuer, affecter, prestataire, prestataire externe, technicien, assigner un agent, confier l intervention, plombier, electricien*

---

## Équipe

<a id="fiche-team"></a>

### Équipe : vos agents terrain

Accueil › Actions rapides › « Équipe ».  
• Bouton « Nouvel agent terrain ».  
• Chaque carte : nom, rôle et identifiant, charge de travail (« Disponible » en vert ou « N mission(s) en cours » en doré), boutons « Appeler » et « SMS ».  
• Touchez un agent pour sa fiche : identifiant, missions, mot de passe provisoire, suspension.  
  
L’équipe sert à confier les tickets de maintenance : un agent terrain voit uniquement ses missions dans son espace.

*Questions reconnues par l’IA : equipe, mon equipe, agents, agent, agents terrain, liste des agents, voir l equipe, collaborateurs, techniciens, missions en cours*

<a id="fiche-agent-new"></a>

### Créer un agent terrain (et le cas du gestionnaire)

Accueil › Actions rapides › « Agent » (ou Équipe › « Nouvel agent terrain »).  
1. Prénom, nom, téléphone (facultatif, 8 chiffres minimum), e-mail (facultatif).  
2. « Créer le compte ».  
3. Une carte affiche son identifiant (créé automatiquement s’il n’a pas d’e-mail, format ITC-XXXX) et son mot de passe provisoire, avec « Envoyer par SMS ». Notez-les : le mot de passe ne sera plus affiché.  
4. L’agent se connecte avec ces accès et choisit son propre mot de passe.  
  
Agent terrain = interventions uniquement (onglet Missions). Les comptes gestionnaire (MANAGER), qui ont accès à la gestion complète, ne se créent pas depuis l’application mobile : contactez le support ITC.

*Questions reconnues par l’IA : creer un agent, ajouter un agent, nouvel agent, nouvel agent terrain, creer un compte agent, agent gestionnaire, gestionnaire, manager, recruter, ajouter un collaborateur, creer un collaborateur, ajouter un technicien*

<a id="fiche-agent-detail"></a>

### Fiche agent : identifiant, mot de passe, suspension

Accueil › Équipe › touchez l’agent.  
• En-tête : nom, téléphone, « Compte actif » (vert) ou « Compte suspendu » (orange), boutons « Appeler » et « SMS ».  
• Compteurs : À démarrer (bleu), En cours (doré), Terminées (vert).  
• « Compte » : identifiant de connexion (LoginId ITC-XXXX ou e-mail, en doré), e-mail, dernière connexion, date de création.  
• « Modifier la fiche » : prénom, nom, téléphone.  
• « Nouveau mot de passe provisoire » : si l’agent a perdu ses accès.  
• « Suspendre le compte » : il ne peut plus se connecter ni recevoir de missions. « Réactiver le compte » pour revenir en arrière.  
  
Le mot de passe actuel n’est jamais affiché, seul un nouveau mot de passe provisoire peut être généré.

*Questions reconnues par l’IA : fiche agent, fiche de l agent, identifiant de l agent, identifiants des agents, identifiant agent, loginid, login id, suspendre le compte, suspendre un agent, reactiver le compte, modifier la fiche, compte suspendu…*

---

## Notifications et relances

<a id="fiche-notifications"></a>

### Notifications (la cloche)

Accueil › cloche en haut à droite. La pastille rouge indique le nombre de notifications non lues.  
• Filtres : Tous, Non lus, Loyer, Impayé, Paiement, Maintenance.  
• Une notification non lue est en gras avec un point doré.  
• Couleur par type : Impayé (rouge), Loyer : rappels et échéances (orange), Paiement reçu (vert), Maintenance (bleu), autres (doré).  
• Touchez une notification pour la marquer comme lue et ouvrir l’élément lié (« Ouvrir › ») : paiement, contrat ou ticket.  
• « Tout marquer comme lu » en haut de la liste.  
  
Pour recevoir aussi les alertes par e-mail : Paramètres › Notifications.

*Questions reconnues par l’IA : notification, notifications, cloche, alertes, alerte, badge rouge, non lues, non lus, tout marquer comme lu, point dore*

<a id="fiche-reminders"></a>

### Relances et rappels automatiques des loyers

Chaque jour, le serveur ITC suit les loyers à votre place :  
• il crée les échéances du mois pour chaque contrat actif (échéance le 5 du mois) ;  
• 3 jours avant l’échéance : notification « Rappel loyer à venir » ;  
• dès que l’échéance est dépassée : le paiement passe « En retard » (rouge) et vous recevez « Loyer en retard » ;  
• relances progressives « Relance loyer (J+1) », « (J+7) » et « (J+15) » ;  
• à J+15 : « Alerte impayé — action requise ».  
  
Ces alertes vous sont adressées, à vous et à votre équipe de gestion (notifications, et e-mail si activé). Le locataire voit ses loyers en retard dans son espace, mais ITC ne lui envoie pas de SMS automatique : appelez-le ou envoyez un SMS depuis sa fiche, ou générez un avis de paiement PDF (formules Pro et Enterprise).

*Questions reconnues par l’IA : relance, rappel, automatique, j 1, j 7, j 15, retard de paiement, date d echeance, relancer, relancer un locataire, alerte impaye, relances automatiques*

---

## Rapports et assistant IA

<a id="fiche-reports"></a>

### Rapports

Accueil › Actions rapides › « Rapports ».  
• « Ce mois-ci » : Attendu, Encaissé (vert), Impayés (rouge), Recouvrement (%) et sa barre.  
• « Parc immobilier » : immeubles, logements, occupés (%). Un message orange apparaît si l’occupation est sous 70 % (« pensez à relancer la commercialisation »).  
• « Activité » : locataires, contrats actifs, tickets ouverts, paiements (chaque ligne ouvre l’écran correspondant).  
• Prévisions : indicateurs et tendances calculés sur vos données.  
• « Analyse détaillée avec l’assistant IA » : ouvre l’onglet IA.  
• « Copier le résumé » : copie un résumé texte (mois, encaissé, impayés, occupation…) à coller dans WhatsApp ou un e-mail.

*Questions reconnues par l’IA : rapports, rapport, synthese, bilan, copier le resume, resume, previsions, prevision, statistiques, stats*

<a id="fiche-assistant"></a>

### Assistant IA « Intelligence ITC » (onglet IA)

Onglet IA, deux volets :  
  
« Discussion » :  
• Posez vos questions en français : données (« Qui n’a pas encore payé ce mois-ci ? », « Quels contrats arrivent à échéance ? », « Résume l’état de mon parc ») ou mode d’emploi (« Comment encaisser un loyer ? », « Que veut dire la couleur orange ? »).  
• Des suggestions sont proposées sous la zone de saisie ; les boutons dorés « … › » ouvrent directement l’écran concerné.  
• Pour les actions (contrat PDF, reçu, avis de paiement, ticket, assignation), l’assistant prépare l’action et affiche « Confirmer » / « Annuler » : rien n’est fait sans votre accord. Un document généré s’ouvre avec « Ouvrir le document ».  
  
« Analyses » :  
• Prévisions calculées automatiquement.  
• « Analyses détaillées » : Vue d’ensemble, Revenus, Occupation, Impayés › « Lancer l’analyse ». Le rapport affiche les indicateurs (vert = en hausse, rouge = en baisse), les constats et les « Recommandations ».  
  
L’assistant travaille uniquement sur les données de votre organisation.

*Questions reconnues par l’IA : assistant, ia, intelligence, intelligence itc, chatbot, discussion, analyses, lancer l analyse, que peut faire l ia, que sais tu faire, que peux tu faire, poser une question*

---

## Paramètres et sécurité

<a id="fiche-settings"></a>

### Paramètres : vue d’ensemble

Onglet Paramètres, de haut en bas :  
• Profil : avatar, nom, rôle (badge doré), organisation, « Membre depuis », bouton « Modifier le profil ».  
• Apparence : 4 thèmes (Auto, Clair, Noir, Bleu ITC).  
• Abonnement (propriétaire) : formule, échéance, statut, limites.  
• Compte : e-mail ou identifiant, téléphone, adresse, organisation.  
• Notifications : « Alertes par e-mail » et « Notifications dans l’application ».  
• Sécurité : Mot de passe, Double authentification, Appareils connectés, Activité du compte.  
• À propos : Aide et support, Version, Serveur (« ITC Cloud · production » en vert), Site officiel.  
• Bouton rouge « Se déconnecter ».

*Questions reconnues par l’IA : parametres, reglages, onglet parametres, mon compte, se deconnecter, deconnexion, version, serveur, site officiel, deconnecter*

<a id="fiche-profile"></a>

### Modifier mon profil

Paramètres › « Modifier le profil » : prénom, nom, téléphone et adresse (quartier, rue, ville). Ces informations sont visibles par votre organisation.  
L’e-mail ou l’identifiant de connexion ne se modifie pas depuis l’application.

*Questions reconnues par l’IA : modifier le profil, modifier mon profil, mon profil, profil, mon nom, mon telephone, mon adresse, changer mon nom, changer mon telephone*

<a id="fiche-themes"></a>

### Apparence : les thèmes de l’application

Paramètres › Apparence. Le thème s’applique à toute l’application :  
• Auto : clair de 7 h à 19 h, noir la nuit.  
• Clair : blanc nacré et paillettes dorées, pour la journée.  
• Noir : noir profond et paillettes blanches, pour la nuit.  
• Bleu ITC : le bleu nuit d’origine d’ITC, paillettes or et argent.  
  
Les couleurs de signification (vert, orange, rouge, bleu, doré, gris) gardent le même sens dans tous les thèmes.

*Questions reconnues par l’IA : theme, themes, apparence, mode sombre, mode clair, mode nuit, bleu itc, theme noir, theme clair, changer la couleur de l application, fond blanc, fond noir*

<a id="fiche-notification-settings"></a>

### Préférences de notifications

Paramètres › Notifications :  
• « Alertes par e-mail » : propriétaire = loyers, retards de paiement et maintenance ; agent = nouvelles missions et messages des locataires ; locataire = échéances de loyer et suivi de ses demandes.  
• « Notifications dans l’application » : rappels et alertes sur vos appareils.  
Chaque interrupteur s’active ou se coupe immédiatement.

*Questions reconnues par l’IA : alertes par e mail, notifications par e mail, recevoir des e mails, desactiver les notifications, notifications dans l application, ne plus recevoir, e mails*

<a id="fiche-devices"></a>

### Appareils connectés et activité du compte

Paramètres › Sécurité :  
• « Appareils connectés » : chaque téléphone ou navigateur où votre compte est ouvert, avec la dernière activité et l’adresse IP. « Cet appareil » est marqué en vert. Bouton « Déconnecter » par appareil, ou « Déconnecter les N autres appareils ».  
• « Activité du compte » : historique des connexions et changements de sécurité (date, IP). Les échecs apparaissent en rouge.  
  
Un appareil inconnu ? Déconnectez-le, changez votre mot de passe et activez la double authentification.

*Questions reconnues par l’IA : appareils connectes, appareil, appareils, sessions, deconnecter un appareil, activite du compte, historique des connexions, adresse ip, pirate, piratage, quelqu un utilise mon compte*

<a id="fiche-support"></a>

### Aide et support

Paramètres › À propos › « Aide et support » : questions fréquentes (ajouter un locataire, enregistrer un loyer, relances, mot de passe oublié…) et contacts de l’équipe ITC.  
Vous pouvez aussi poser n’importe quelle question sur l’application à l’assistant IA (onglet IA).

*Questions reconnues par l’IA : aide, support, faq, questions frequentes, contacter, nous contacter, assistance, whatsapp, service client, contacter itc*

---

## Abonnement

<a id="fiche-subscription"></a>

### Abonnement : formules, limites et blocage

Formules (par mois, cycle de 30 jours) :  
• Starter : 15 000 XAF, jusqu’à 10 logements, contrat PDF, assistant IA.  
• Pro : 45 000 XAF, logements illimités, contrat PDF, reçus et avis de paiement PDF, assistant IA.  
• Enterprise : 120 000 XAF, tout illimité, reçus et avis PDF, analytique avancée, assistant IA.  
  
Où le voir : Paramètres › Abonnement (formule, date d’échéance, statut, limites).  
Statuts : Actif (vert) ; Période de grâce (orange, 7 jours après l’échéance) ; Suspendu ; Résilié.  
  
Quand l’abonnement n’est plus actif, un bandeau orange apparaît sur l’Accueil : vos données restent consultables, mais les ajouts et modifications (encaissements, locataires, contrats, tickets, documents, assistant IA) sont bloqués jusqu’au renouvellement. Pour renouveler ou changer de formule, contactez l’équipe ITC (Paramètres › Aide et support).  
  
« Limite atteinte » à la création d’un logement = plafond de la formule Starter (10 logements).

*Questions reconnues par l’IA : abonnement, formule, formules, plan, starter, formule pro, plan pro, enterprise, formule entreprise, prix, tarif, tarifs…*

---

## Espace agent terrain

<a id="fiche-agent-space"></a>

### Espace agent terrain : missions

L’agent terrain a 3 onglets : Accueil, Missions, Paramètres.  
  
Accueil (« Espace agent terrain ») : compteurs À faire (bleu), En cours (doré), Terminées (vert), Urgentes (rouge), puis « Prochaines interventions » par ordre de priorité et « Voir toutes mes missions ».  
  
Missions : filtres Actives, À faire, En cours, Terminées, Toutes.  
  
Fiche d’une intervention :  
• Mission assignée : « Accepter la mission » ou « Refuser la mission » (motif facultatif ; la mission est rendue au gestionnaire).  
• Acceptée : « Démarrer l’intervention » (ou la refuser).  
• En cours : « Marquer comme terminée ».  
• Terminée : « Terminée · en attente de confirmation du locataire » et « Clôturer l’intervention ».  
• « Lieu et contact » : adresse, locataire, téléphone, date du signalement.  
• « Compte rendu » : diagnostic, pièce à commander, passage prévu › « Envoyer ».  
  
L’agent ne voit ni les loyers, ni les contrats, ni les autres locataires. L’ajout de photos n’est pas encore disponible.

*Questions reconnues par l’IA : espace agent, espace terrain, mission, accepte, refuse, accepter la mission, refuser la mission, compte rendu, cloturer l intervention, mes interventions, prochaines interventions, que voit l agent…*

---

## Espace locataire

<a id="fiche-tenant-space"></a>

### Espace locataire : ce que voit le locataire

Le locataire a 4 onglets : Accueil, Loyers, Demandes, Paramètres.  
  
Accueil (« Espace locataire ») : carte « Mon contrat » (« Contrat jusqu’au … », « Voir le contrat › »), « Mon loyer » (prochaine échéance, « En retard » en rouge, « À régler aujourd’hui », ou « Vous êtes à jour de vos loyers » en vert), « Mes demandes » et « Signaler un problème ».  
  
Loyers (« Mes loyers ») : reste à payer et historique des échéances enregistrées par l’agence. Le paiement en ligne n’existe pas : le locataire paie l’agence, qui enregistre l’encaissement.  
  
Demandes (« Mes demandes ») : filtres En cours, Clôturées, Toutes, et « Signaler un problème » :  
• type : Plomberie, Électricité, Serrurerie, Climatisation, Peinture, Autre ;  
• titre (ex. fuite sous l’évier) et description › « Envoyer la demande ». L’agence est prévenue immédiatement.  
Statuts côté locataire : Reçue, Technicien désigné, Intervention en cours, À confirmer, Résolue, Annulée.  
Quand c’est « À confirmer » : « Oui, confirmer la réparation », ou expliquer que le problème persiste. « Écrire à l’agence » permet d’ajouter une précision.  
  
« Mon contrat » : logement, statut, dates, loyer, dépôt de garantie, clauses particulières.  
  
Le locataire ne voit jamais les autres locataires ni les finances de l’agence.

*Questions reconnues par l’IA : espace locataire, portail, portail locataire, que voit le locataire, cote locataire, mes loyers, mes demandes, mon contrat, mon loyer, signaler un probleme, confirmer la reparation, payer en ligne…*

---

## Couleurs et statuts

<a id="fiche-colors"></a>

### Code couleur : signification et niveau d’importance

Les couleurs ont le même sens partout dans ITC, du plus urgent au plus neutre :  
  
• ROUGE, urgent : de l’argent ou la sécurité est en jeu. Impayés, paiement En retard, priorité Critique, « Alerte impayé », bouton « Se déconnecter » et confirmations sensibles (résilier, supprimer), erreurs.  
• ORANGE, attention, à surveiller : paiement Partiel, ticket Ouvert, priorité Haute, contrat Expiré, logement En maintenance (fenêtre clignotante), accès Suspendu, abonnement en période de grâce, double authentification désactivée, notifications « Loyer ».  
• BLEU, information, en attente normale : paiement À payer, contrat Brouillon, ticket Assigné, priorité Moyenne, accès « Compte créé », logement Libre, notifications « Maintenance ».  
• DORÉ, marque ITC et « en cours » : boutons principaux, ticket En cours, notification non lue (point doré), identifiants, logement Occupé (ambre).  
• VERT, tout va bien : Payé, contrat Actif, ticket Terminé, « Compte actif », « Rien d’urgent », encaissé, recouvrement, « Tout est à jour ».  
• GRIS, inactif ou archivé : Annulé, Résilié, Clôturé, priorité Basse, logement Indisponible, « Pas de compte », Archivé.  
  
Règle simple : rouge = agir maintenant, orange = agir bientôt, bleu = suivre, vert = rien à faire, gris = historique.

*Questions reconnues par l’IA : couleur, couleurs, rouge, orange, vert, verte, bleu, bleue, gris, grise, dore, doree…*

<a id="fiche-status-catalogue"></a>

### Catalogue complet des statuts, par module

Logements : Libre (bleu), Occupé (ambre), En maintenance (orange clignotant), Indisponible (gris).  
Contrats : Brouillon (bleu), Actif (vert), Expiré (orange), Résilié (gris).  
Paiements : À payer (bleu), Partiel (orange), En retard (rouge), Payé (vert), Annulé (gris).  
Modes de paiement : Espèces, Mobile Money, Virement, Chèque, Autre.  
Tickets : Ouvert (orange), Assigné (bleu), En cours (doré), Terminé (vert), Clôturé (gris), Annulé (gris).  
Priorités : Basse (gris), Moyenne (bleu), Haute (orange), Critique (rouge).  
Accès locataire : Pas de compte (gris), Compte créé (bleu), Compte actif (vert), Suspendu (orange), Archivé (gris).  
Compte agent : Compte actif (vert), Compte suspendu (orange).  
Demandes côté locataire : Reçue, Technicien désigné, Intervention en cours, À confirmer, Résolue, Annulée.  
Abonnement : Actif (vert), Période de grâce, Suspendu, Résilié (orange quand il n’est pas actif).  
Notifications : Impayé (rouge), Loyer (orange), Paiement (vert), Maintenance (bleu), autres (doré).  
Catégories de dépenses : Entretien, Réparation, Électricité, Eau, Nettoyage, Gardiennage, Assurance, Impôts et taxes, Travaux, Autre.

*Questions reconnues par l’IA : statut, statuts, liste des statuts, tous les statuts, catalogue, etat, etats, que veut dire le statut, que signifie le statut*

<a id="fiche-brand"></a>

### Identité visuelle ITC

ITC = Immo · Tec · Conseil. Le logo est un emblème doré animé, affiché en haut de l’Accueil.  
  
Palette de marque :  
• Or ITC #D4AF37 et or clair #E8C96A : boutons principaux, titres, éléments de marque.  
• Bleu nuit ITC #071A3A : fond du thème « Bleu ITC », ciel étoilé.  
Couleurs de signification (thèmes sombres) : vert #3DDC97, orange #F5A524, rouge #FF6B6B, bleu #5B9FFF, gris #8A96B0.  
Thème clair : versions plus soutenues (vert #16915F, orange #C77700, rouge #D63A3A, bleu #2667D1, or #B08A1E).  
Maquette 3D : fenêtre occupée #F6C65B (ambre), libre bleu, maintenance #F5A524, indisponible gris.

*Questions reconnues par l’IA : logo, identite visuelle, couleurs de la marque, charte, charte graphique, couleur de marque, bleu nuit, or itc, palette*

---

## Limites, glossaire

<a id="fiche-limits"></a>

### Ce que l’application ne fait pas encore

À ce jour, l’application mobile ne permet pas :  
• de supprimer un immeuble, un logement, un locataire, un contrat ou un ticket (on résilie un contrat, on suspend un accès, on clôture un ticket) ;  
• de modifier la fiche d’un locataire, un contrat déjà créé ou un ticket ;  
• de créer un paiement à la main (les échéances sont générées automatiquement par les contrats actifs) ;  
• au locataire de payer en ligne ;  
• d’ajouter des photos aux tickets ;  
• de créer un compte gestionnaire (seulement des agents terrain) ;  
• d’exporter vers Excel (utilisez « Copier le résumé » dans Rapports).  
  
Pour ces besoins, contactez l’équipe ITC via Paramètres › Aide et support.

*Questions reconnues par l’IA : limite, limites, ne fonctionne pas, impossible, pas possible, supprimer, suppression, modifier un contrat, modifier un ticket, photos, photo, exporter…*

<a id="fiche-glossary"></a>

### Glossaire

• Immeuble : bâtiment ou résidence, qui contient des logements.  
• Logement : unité louée (appartement, studio, porte), avec loyer et statut.  
• Contrat (bail) : accord entre un locataire et un logement, avec dates, loyer et dépôt de garantie.  
• Dépôt de garantie (caution) : somme versée à l’entrée, indiquée sur le contrat.  
• Échéance : loyer d’un mois donné (le 5 du mois), générée automatiquement.  
• Encaissement : enregistrement d’un loyer reçu (montant, mode, référence).  
• Reçu (quittance) : PDF prouvant le paiement. Avis de paiement : PDF rappelant un montant dû.  
• Recouvrement : part des loyers du mois réellement encaissée (encaissé ÷ attendu).  
• Taux d’occupation : logements occupés ÷ total des logements.  
• Ticket : demande de maintenance, suivie d’Ouvert à Clôturé.  
• Agent terrain : technicien de l’équipe, qui reçoit les missions.  
• Prestataire externe : intervenant sans compte ITC (plombier, entreprise).  
• Identifiant ITC : identifiant de connexion (ITC-XXXX) des agents et des locataires.  
• Mot de passe provisoire : mot de passe affiché une seule fois à la création, à changer à la première connexion.  
• Double authentification (MFA) : code à 6 chiffres en plus du mot de passe.  
• Période de grâce : 7 jours après l’échéance de l’abonnement, avant suspension.

*Questions reconnues par l’IA : glossaire, definition, vocabulaire, lexique, c est quoi un, c est quoi une, bail, echeance, quittance*
