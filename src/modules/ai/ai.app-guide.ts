/**
 * Guide d’utilisation de l’application ITC (réponses locales + prompt OpenAI).
 * Couvre la hiérarchie Owner / Manager / Terrain / Locataire et les parcours UI.
 */

function normalizeQuery(message: string): string {
  return message
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’']/g, "'")
    .trim();
}

/** Questions « comment faire / où aller / à quoi sert » l’app. */
export function isAppHowtoIntent(message: string): boolean {
  const q = normalizeQuery(message);
  if (q.length < 4) return false;

  const howtoVerb =
    q.includes('comment') ||
    q.includes('ou ') ||
    q.startsWith('ou ') ||
    q.includes('ouvrir') ||
    q.includes('acceder') ||
    q.includes('accéder') ||
    q.includes('utiliser') ||
    q.includes('fonctionne') ||
    q.includes('marche') ||
    q.includes('explique') ||
    q.includes('etape') ||
    q.includes('étape') ||
    q.includes('tutoriel') ||
    q.includes('guide') ||
    q.includes('aide') ||
    q.includes('que faire') ||
    q.includes('c\'est quoi') ||
    q.includes('c est quoi') ||
    q.includes('a quoi sert') ||
    q.includes('role de') ||
    q.includes('rôle de') ||
    q.includes('difference') ||
    q.includes('différence');

  const appTopic =
    q.includes('app') ||
    q.includes('application') ||
    q.includes('itc') ||
    q.includes('ecran') ||
    q.includes('écran') ||
    q.includes('menu') ||
    q.includes('bouton') ||
    q.includes('module') ||
    q.includes('dashboard') ||
    q.includes('tableau de bord') ||
    q.includes('parametre') ||
    q.includes('paramètre') ||
    q.includes('espace') ||
    q.includes('portail') ||
    q.includes('hierarchie') ||
    q.includes('hiérarchie') ||
    q.includes('proprietaire') ||
    q.includes('propriétaire') ||
    q.includes('gestionnaire') ||
    q.includes('agent') ||
    q.includes('locataire') ||
    q.includes('immeuble') ||
    q.includes('logement') ||
    q.includes('bien') ||
    q.includes('contrat') ||
    q.includes('bail') ||
    q.includes('paiement') ||
    q.includes('loyer') ||
    q.includes('maintenance') ||
    q.includes('intervention') ||
    q.includes('equipe') ||
    q.includes('équipe') ||
    q.includes('analyse') ||
    q.includes('intelligence') ||
    q.includes('ia ') ||
    q.startsWith('ia') ||
    q.includes('rece') ||
    q.includes('avis') ||
    q.includes('ajouter') ||
    q.includes('creer') ||
    q.includes('créer') ||
    q.includes('retirer') ||
    q.includes('enregistrer') ||
    q.includes('changer') ||
    q.includes('modifier') ||
    q.includes('prix') ||
    q.includes('mfa') ||
    q.includes('2fa') ||
    q.includes('authentif') ||
    q.includes('securite') ||
    q.includes('sécurité') ||
    q.includes('session') ||
    q.includes('mot de passe') ||
    q.includes('password') ||
    q.includes('temporaire') ||
    q.includes('loginid') ||
    q.includes('identifiant');

  if (howtoVerb && appTopic) return true;

  // Formulations courtes type « ajouter un locataire » / « créer un agent »
  if (
    (q.includes('ajouter') || q.includes('creer') || q.includes('créer') || q.includes('enregistrer')) &&
    (q.includes('locataire') ||
      q.includes('agent') ||
      q.includes('immeuble') ||
      q.includes('contrat') ||
      q.includes('paiement') ||
      q.includes('logement'))
  ) {
    return true;
  }

  // Catalogue produit (pas un dump de logements)
  if (/\btypes?\s+de\s+(biens?|logements?|appartements?)\b/.test(q)) return true;
  if (q.includes('mfa') || q.includes('2fa') || (q.includes('authentif') && q.includes('multi'))) {
    return true;
  }
  // Mot de passe perdu / temporaire (souvent sans verbe « comment »)
  if (
    (q.includes('mot de passe') || q.includes('password') || q.includes('temporaire')) &&
    (q.includes('plus') ||
      q.includes('perdu') ||
      q.includes('oubli') ||
      q.includes('que faire') ||
      q.includes('comment') ||
      q.includes('retrouver') ||
      q.includes('reset') ||
      q.includes('reinitial') ||
      q.includes('réinitial'))
  ) {
    return true;
  }

  return false;
}

export function resolveAppHowtoReply(message: string): string | null {
  const q = normalizeQuery(message);

  // Mot de passe temporaire perdu / oublié (avant MFA générique)
  if (
    (q.includes('mot de passe') || q.includes('password') || q.includes('temporaire')) &&
    (q.includes('plus') ||
      q.includes('perdu') ||
      q.includes('oubli') ||
      q.includes('que faire') ||
      q.includes('retrouver') ||
      q.includes('reset') ||
      q.includes('reinitial') ||
      q.includes('réinitial') ||
      q.includes('regener') ||
      q.includes('régénér'))
  ) {
    return `Mot de passe temporaire perdu :

Le mot de passe temporaire n’est affiché qu’une seule fois à la création (sécurité). S’il n’est plus disponible :

• Agent / collaborateur :
  1. Menu → Équipe (Agents) → ouvrez la fiche
  2. Régénérez / réinitialisez le mot de passe depuis la fiche (propriétaire)
  3. Remettez le nouveau mot de passe à l’agent — il le change au prochain login

• Locataire :
  1. Menu → Locataires → fiche du locataire
  2. Régénérez l’accès portail / mot de passe
  3. Ou écran de connexion → « Mot de passe oublié » avec LoginId / e-mail

• Compte propriétaire : « Mot de passe oublié » sur l’écran de login.

Ne redemandez jamais l’ancien temporaire : il n’est plus stocké en clair.`;
  }

  // MFA / sécurité compte (avant le dump portfolio ou le bloc paramètres générique)
  if (
    q.includes('mfa') ||
    q.includes('2fa') ||
    (q.includes('authentif') &&
      (q.includes('multi') ||
        q.includes('double') ||
        q.includes('a quoi sert') ||
        q.includes('c est quoi') ||
        q.includes('c\'est quoi') ||
        q.includes('sert') ||
        q.includes('explique')))
  ) {
    return `Authentification MFA (multi-facteurs) :

Elle ajoute une 2ᵉ vérification après le mot de passe (code temporaire / application d’authentification). Même si le mot de passe fuit, un tiers ne peut pas ouvrir le compte facilement.

Dans ITC :
1. Réglages / Paramètres → sécurité du compte
2. Activez ou gérez le MFA
3. Consultez « Sessions » pour voir / révoquer les appareils connectés

Astuce : gardez le MFA actif sur les comptes propriétaire et gestionnaire.`;
  }

  // Types de biens = modèle produit ITC (pas la liste des logements du parc)
  if (/\btypes?\s+de\s+(biens?|logements?|appartements?)\b/.test(q)) {
    return `Types de biens dans ITC :

ITC ne classe pas les logements dans une liste fermée du type « Studio / F2 / F3 ».
Chaque bien est un logement avec :
• un libellé (ex. Appt 3B, Studio RDC)
• un nombre de pièces et une surface
• un statut : vacant, occupé, maintenance ou indisponible

Pour voir votre parc réel : « mes logements » ou menu → Immeubles / Logements.
Pour un décompte : « combien de logements ai-je ? ».`;
  }

  // Vue d’ensemble / comment marche l’app
  if (
    q.includes('application') ||
    q.includes('comment ca marche') ||
    q.includes('comment ça marche') ||
    q.includes('utiliser itc') ||
    q.includes('utiliser l\'app') ||
    q.includes('utiliser l app') ||
    (q.includes('aide') && (q.includes('app') || q.includes('itc') || q.length < 12)) ||
    q.includes('hierarchie') ||
    q.includes('hiérarchie') ||
    (q.includes('role') && (q.includes('agent') || q.includes('proprio') || q.includes('locataire'))) ||
    (q.includes('différence') && q.includes('agent'))
  ) {
    return `ITC est une entreprise de gestion immobilière dans l’app :

👑 Propriétaire (OWNER) — supervision
• Vue globale, rapports, équipe, abonnement, configuration
• Peut tout consulter ; n’est pas obligé de faire l’ops au quotidien

👨‍💼 Agent gestionnaire (MANAGER) — opérations
• Locataires, biens, contrats, paiements, maintenance (desk)
• C’est le centre de gravité quotidien

🔧 Agent terrain (AGENT) — interventions
• Espace terrain : missions assignées uniquement

👤 Locataire (TENANT) — portail
• Son logement, bail, loyers, demandes de maintenance

Demandez par ex. : « Comment ajouter un locataire ? », « Comment créer un agent ? », « Où voir les impayés ? ».`;
  }

  if (q.includes('agent') && (q.includes('creer') || q.includes('créer') || q.includes('ajout') || q.includes('provision'))) {
    return `Créer un collaborateur (compte + accès ITC) :

1. Connectez-vous en Propriétaire
2. Menu → Équipe (agents) — ou Paramètres → Équipe
3. Choisissez :
   • Gestionnaire (ops) → rôle MANAGER (locataires, contrats, paiements…)
   • Terrain (maintenance) → rôle AGENT (interventions seulement)
4. Remplissez identité → créer → notez l’identifiant + mot de passe temporaire

Le collaborateur change son mot de passe à la première connexion.`;
  }

  // Connexion compte agent (terrain / gestionnaire)
  if (
    q.includes('agent') &&
    (q.includes('connect') ||
      q.includes('connexion') ||
      q.includes('se connecter') ||
      q.includes('me connecter') ||
      (q.includes('compte') && (q.includes('login') || q.includes('acces') || q.includes('accès'))))
  ) {
    return `Se connecter avec un compte agent :

1. Propriétaire : menu → Équipe / Agents → ouvrez la fiche de l’agent
2. Notez l’identifiant (LoginId, ex. ITC-XXXX) affiché sur la fiche
3. À la création, un mot de passe temporaire est montré une seule fois — remettez-le à l’agent
4. Sur l’écran de connexion ITC : saisissez ce LoginId (ou e-mail s’il en a un) + le mot de passe
5. Au premier login, ITC exige souvent de changer le mot de passe

Agent terrain = interventions seulement. Gestionnaire = ops locatives. Ce n’est pas le même compte que le propriétaire.`;
  }

  // Où voir les identifiants / LoginId des agents
  if (
    (q.includes('agent') || q.includes('equipe') || q.includes('équipe')) &&
    (q.includes('identifiant') ||
      q.includes('loginid') ||
      q.includes('login id') ||
      q.includes('login') ||
      q.includes('credential') ||
      q.includes('mot de passe temporaire'))
  ) {
    return `Voir les identifiants des agents :

1. Menu → Équipe (Agents)
2. Ouvrez la fiche de l’agent
3. Section Compte / Identité : LoginId (ex. ITC-XXXX) et statut Actif

Le mot de passe n’est plus affiché après la création (sécurité). Pour un oubli : propriétaire → régénérer / réinitialiser depuis la fiche, ou « Mot de passe oublié » sur l’écran de login avec le LoginId.

Dans Intelligence ITC vous pouvez aussi demander : « mes agents » pour la liste avec LoginId.`;
  }

  if (
    (q.includes('gestionnaire') || (q.includes('manager') && !q.includes('terrain'))) &&
    (q.includes('comment') || q.includes('quoi') || q.includes('role') || q.includes('rôle') || q.includes('faire'))
  ) {
    return `L’agent gestionnaire opère au quotidien :
• Locataires (créer, fiche, retirer)
• Biens / contrats / paiements
• Maintenance (recevoir les demandes, assigner)
• Intelligence ITC (chat, analyses)

Le propriétaire supervise ; le terrain exécute les interventions.`;
  }

  if (q.includes('locataire') && (q.includes('ajout') || q.includes('creer') || q.includes('créer') || q.includes('nouve'))) {
    return `Ajouter un locataire (idéal : espace gestionnaire) :

1. Menu → Locataires → +
2. Identité (prénom, nom, N° pièce), contacts
3. Associez un logement / créez le contrat si proposé
4. ITC crée le compte portail + vous affiche identifiant et mot de passe temporaire
5. Remettez ces accès au locataire (il change le mot de passe au 1er login)

Le locataire n’a pas à s’inscrire seul.`;
  }

  if (
    q.includes('locataire') &&
    (q.includes('retir') || q.includes('evinc') || q.includes('expuls') || q.includes('liber') || q.includes('depart'))
  ) {
    return `Retirer un locataire :

1. Locataires → ouvrez la fiche
2. « Retirer le locataire »
3. Choisissez le motif (départ, décision proprio, fin de bail, impayés…)

ITC résilie le(s) bail(s), libère le logement et archive le portail. L’historique reste.`;
  }

  if (q.includes('immeuble') || (q.includes('bien') && (q.includes('ajout') || q.includes('creer') || q.includes('créer')))) {
    return `Parc immobilier :

• Immeubles : menu → Immeubles → créer / ouvrir un immeuble
• Logements : dans l’immeuble, ajoutez des unités (loyer, statut)
• Ou menu → Biens / Logements pour la liste transversale

Sans logement disponible, vous ne pouvez pas bien rattacher un nouveau locataire.`;
  }

  // Changer le prix / loyer d’un bien ou logement (avant le bloc paiement générique)
  if (
    (q.includes('prix') || q.includes('loyer') || q.includes('tarif') || q.includes('montant')) &&
    (q.includes('chang') ||
      q.includes('modif') ||
      q.includes('mettre a jour') ||
      q.includes('mettre à jour') ||
      q.includes('actualis') ||
      q.includes('augmenter') ||
      q.includes('baisser') ||
      q.includes('revoir')) &&
    (q.includes('bien') ||
      q.includes('logement') ||
      q.includes('appartement') ||
      q.includes('appt') ||
      q.includes('unite') ||
      q.includes('unité') ||
      q.includes('loyer'))
  ) {
    return `Changer le prix (loyer) d’un bien / logement :

1. Menu → Immeubles (ou Biens / Logements)
2. Ouvrez l’immeuble puis le logement concerné
3. Modifiez le champ « Loyer » / montant mensuel (XAF) → Enregistrer

Si un bail est déjà actif :
• Le loyer du contrat peut rester celui du bail jusqu’à renouvellement / avenant
• Menu → Contrats → ouvrez le bail → renouveler ou ajuster le loyer du bail si proposé
• Les prochaines échéances de Paiements suivent le bail actif

Astuce IA : « mes logements » pour retrouver le libellé, puis ouvrez la fiche pour éditer le montant.
L’IA ne modifie pas encore le prix toute seule : c’est une action dans l’écran Logements / Contrats.`;
  }

  if (q.includes('contrat') || q.includes('bail')) {
    if (q.includes('pdf') || q.includes('gener') || q.includes('génér')) {
      return `Générer un contrat PDF :

• Contrats → menu du bail → « Générer le contrat PDF »
• Ou dans Intelligence ITC : « Génère un contrat de location » puis Confirmer

Le PDF inclut identité, loyers et blocs signature. Vérifiez avant usage.`;
    }
    return `Contrats / baux :

1. Menu → Contrats
2. Créez / activez un bail (locataire + logement)
3. Actions : PDF, renouveler (+12 mois), résilier

Les échéances de loyers suivent le bail actif.`;
  }

  if (q.includes('paiement') || q.includes('loyer') || q.includes('impay')) {
    if (!(q.includes('comment') || q.includes('enregistr') || q.includes('marquer') || q.includes('ouvrir') || q.includes('ou ') || q.includes('recu') || q.includes('quittance') || q.includes('avis'))) {
      return null;
    }
    if (q.includes('recu') || q.includes('quittance')) {
      return `Reçu / quittance PDF :

• Paiements → un paiement déjà encaissé → générer le reçu
• Ou Intelligence ITC : « Génère un reçu de paiement » → Confirmer

Avis de paiement (rappel) : pour un loyer en attente / retard → « Génère un avis de paiement ».`;
    }
    return `Paiements & loyers :

1. Menu → Paiements
2. Filtrez impayés / en attente si besoin
3. Ouvrez une échéance → « Marquer payé » (montant, mode, référence)

Les indicateurs du dashboard et de l’IA utilisent ces données réelles.`;
  }

  if (q.includes('maintenance') || q.includes('intervention') || q.includes('reparation') || q.includes('réparation') || q.includes('fuite')) {
    return `Maintenance :

• Locataire : portail → SAV → signaler un problème
• Gestionnaire / propriétaire : menu → Maintenance (desk) pour suivre / assigner
• Agent terrain : Espace terrain → Interventions (accepter, démarrer, terminer)

Le propriétaire peut consulter l’historique sans traiter chaque ticket.`;
  }

  if (
    q.includes('intelligence') ||
    q.includes(' analyse') ||
    q.includes('onglet') ||
    (q.includes('ia') && (q.includes('comment') || q.includes('utiliser') || q.includes('faire'))) ||
    q.includes('dictée') ||
    q.includes('dictee') ||
    q.includes('vocal') ||
    q.includes('image')
  ) {
    return `Intelligence ITC :

• Onglet Chat — questions données + « comment faire » dans l’app
• Onglet Analyser — LIA (vue d’ensemble, revenus, occupation, impayés) + prévisions
• Micro — dictée (même sans clé OpenAI) puis Envoyer
• Image — OCR du texte sur documents / reçus
• « Lire la réponse » — voix du téléphone (ou TTS cloud si clé OpenAI)

Exemples utiles : « Voir mes impayés », « Comment ajouter un locataire ? », « Générer un avis de paiement ».`;
  }

  if (q.includes('dashboard') || q.includes('tableau de bord') || q.includes('vue globale') || q.includes('rapport')) {
    return `Pilot & rapports :

• Dashboard / Vue globale — KPIs occupation, encaissements, alertes
• Rapports — indicateurs / exports (surtout propriétaire)
• Notifications — alertes in-app

Le gestionnaire privilégie Locataires / Contrats / Paiements / Maintenance au quotidien.`;
  }

  if (q.includes('parametre') || q.includes('paramètre') || q.includes('profil') || q.includes('mot de passe') || q.includes('mfa')) {
    return `Compte & sécurité :

• Paramètres / Profil — identité, préférences notifications
• Mot de passe, MFA, Sessions — sécurité du compte
• Abonnement — plan (propriétaire)
• Équipe — créer gestionnaire ou terrain (propriétaire)

Les locataires et agents terrain ne voient pas les menus CRM (immeubles, équipe…).`;
  }

  if (q.includes('portail') || (q.includes('espace') && q.includes('locataire'))) {
    return `Espace locataire :

• Accueil — résumé
• Bail — son contrat
• Loyers — échéances / paiements
• SAV — créer et suivre une maintenance
• Notifications / Profil

Il ne voit jamais les autres locataires ni les finances de l’organisation.`;
  }

  // « Où voir / ouvrir » modules courants (réponses UI concrètes)
  if (
    (q.includes('ou ') || q.startsWith('ou') || q.includes('ouvrir') || q.includes('acceder') || q.includes('trouver')) &&
    (q.includes('equipe') || q.includes('équipe') || (q.includes('agent') && !q.includes('connect')))
  ) {
    return `Voir l’équipe / les agents :

1. Menu → Équipe (Agents)
2. Liste des collaborateurs (gestionnaires + terrain)
3. Ouvrez une fiche pour LoginId, statut, activité

Astuce IA : demandez « mes agents » pour la liste avec LoginId.`;
  }

  if (
    (q.includes('ou ') || q.startsWith('ou') || q.includes('ouvrir') || q.includes('trouver')) &&
    (q.includes('paiement') || q.includes('impay') || q.includes('loyer'))
  ) {
    return `Voir les paiements / impayés :

1. Menu → Paiements
2. Filtrez « Impayés » / « En attente » / « Payés »
3. Ouvrez une échéance pour détail, reçu ou marquage payé

Astuce IA : « mes impayés » ou « qui n’a pas payé ».`;
  }

  if (
    (q.includes('ou ') || q.startsWith('ou') || q.includes('ouvrir') || q.includes('trouver')) &&
    (q.includes('contrat') || q.includes('bail'))
  ) {
    return `Voir les contrats / baux :

1. Menu → Contrats
2. Ouvrez un bail (locataire + logement + statut)
3. Actions : PDF, renouveler, résilier

Astuce IA : « mes contrats » ou « génère le contrat ».`;
  }

  if (
    (q.includes('ou ') || q.startsWith('ou') || q.includes('ouvrir') || q.includes('trouver')) &&
    (q.includes('maintenance') || q.includes('ticket') || q.includes('intervention') || q.includes('sav'))
  ) {
    return `Voir la maintenance :

1. Menu → Maintenance / Demandes
2. Filtrez ouvertes / assignées / clôturées
3. Ouvrez un ticket pour assigner un agent terrain ou clôturer

Astuce IA : « tickets ouverts » ou « assigne cette intervention ».`;
  }

  // Pas de menu générique : null → le chat continue (outils / OpenAI / historique).
  return null;
}

/** Bloc injecté dans le system prompt OpenAI. */
export const APP_GUIDE_PROMPT = `
Tu connais l’app mobile ITC (gestion immobilière) :

Hiérarchie :
- OWNER = propriétaire / supervision (vue globale, équipe, rapports, config)
- MANAGER = agent gestionnaire / ops (locataires, biens, contrats, paiements, maintenance desk)
- AGENT = agent terrain (interventions assignées uniquement, espace /agent)
- TENANT = locataire (portail : son logement, bail, loyers, SAV)

Quand l’utilisateur demande COMMENT faire dans l’app (où cliquer, créer, ouvrir un module), réponds avec des étapes concrètes UI (menus, boutons), pas seulement des chiffres.
Ne confonds pas « agent gestionnaire » (MANAGER) et « agent terrain » (AGENT).
Pour les données (impayés, vacants…), utilise les outils. Pour le mode d’emploi, explique les parcours.`;
