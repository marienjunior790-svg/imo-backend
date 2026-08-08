import type { AiOrganizationContext } from './ai.context.service.js';

export interface AiActionHint {
  label: string;
  /** Navigation in-app */
  route?: string;
  /** Lien externe (PDF contrat, etc.) */
  url?: string;
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR');
}

function normalizeQuery(message: string): string {
  return message
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’']/g, "'")
    .trim();
}

function isGreeting(q: string): boolean {
  const compact = q.replace(/[!?.…,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (compact.length > 40) return false;
  return /^(bonjour|bonsoir|salut|hey|hello|hi|coucou|yo|bjr|bsr|salu|bonne\s+journee|bonne\s+soiree)(\s|$)/.test(
    compact,
  );
}

function isThanks(q: string): boolean {
  return /^(merci|thanks|thank you|nickel|parfait|top|ok|d['']accord)\b/.test(q) && q.length < 40;
}

function isHelp(q: string): boolean {
  return (
    /^(aide|help|menu|que peux[- ]tu|que peux tu|c['']est quoi|comment ca marche)\b/.test(q) ||
    q.includes('que peux-tu faire') ||
    q.includes('que peux tu faire') ||
    q.includes('tes capacites') ||
    q.includes('tes capacités')
  );
}

/** Déduit des actions de navigation à partir de la question (pas de données inventées). */
export function resolveChatActions(message: string): AiActionHint[] {
  const q = normalizeQuery(message);
  const actions: AiActionHint[] = [];

  if (isGreeting(q) || isHelp(q)) {
    actions.push({ label: 'Résumé du patrimoine', route: '/buildings' });
    actions.push({ label: 'Voir les paiements', route: '/payments' });
    actions.push({ label: 'Ajouter un locataire', route: '/tenants' });
    actions.push({ label: 'Voir les contrats', route: '/leases' });
    return actions;
  }

  if (q.includes('impay') || q.includes('retard') || q.includes('relanc')) {
    actions.push({ label: 'Voir les impayés', route: '/payments?tab=unpaid' });
  }
  if (q.includes('vacant') || q.includes('disponib') || q.includes('libre') || q.includes('occupation')) {
    actions.push({ label: 'Voir les biens', route: '/properties' });
  }
  if (q.includes('contrat') || q.includes('bail') || q.includes('echeanc') || q.includes('expir')) {
    actions.push({ label: 'Voir les contrats', route: '/leases' });
  }
  if (q.includes('revenu') || q.includes('encaiss') || q.includes('loyer') || q.includes('paiement')) {
    actions.push({ label: 'Voir les paiements', route: '/payments' });
  }
  if (
    (q.includes('retirer') || q.includes('evincer') || q.includes('expulser') || q.includes('depart')) &&
    q.includes('locataire')
  ) {
    actions.push({ label: 'Fiches locataires', route: '/tenants' });
  } else if (q.includes('locataire') && (q.includes('ajout') || q.includes('cre') || q.includes('comment'))) {
    actions.push({ label: 'Ajouter un locataire', route: '/tenants' });
  } else if (q.includes('locataire')) {
    actions.push({ label: 'Voir les locataires', route: '/tenants' });
  }
  if (q.includes('immeuble') || q.includes('patrimoine') || q.includes('parc')) {
    actions.push({ label: 'Voir les immeubles', route: '/buildings' });
  }
  if (q.includes('enregistr') && q.includes('paiement')) {
    actions.push({ label: 'Enregistrer un paiement', route: '/payments' });
  }
  if (q.includes('rapport')) {
    actions.push({ label: 'Ouvrir les rapports', route: '/reports' });
  }

  if (
    (q.includes('gener') || q.includes('cree') || q.includes('créer') || q.includes('creer')) &&
    (q.includes('contrat') || q.includes('bail'))
  ) {
    actions.unshift({ label: 'Voir les contrats', route: '/leases' });
  }

  const seen = new Set<string>();
  return actions
    .filter((a) => {
      const key = a.url ?? a.route ?? a.label;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function portfolioSnapshot(ctx: AiOrganizationContext): string {
  const s = ctx.summary;
  return `• ${s.totalApartments} biens · occupation ${s.occupancyRate} %
• ${fmt(s.collectedThisMonthXaf)} XAF encaissés ce mois
• ${s.latePayments} impayé(s) · ${s.availableApartments} vacant(s)`;
}

function capabilitiesBlurb(): string {
  return `Je peux vous aider sur :
• Résumé patrimoine, impayés, vacants, revenus
• Contrats (générer PDF, échéances)
• Locataires (ajouter / retirer)
• Risques et analyses LIA`;
}

/** Réponses rule-based si OpenAI indisponible — basées uniquement sur le contexte org. */
export function buildLocalFallbackReply(message: string, ctx: AiOrganizationContext): string {
  const q = normalizeQuery(message);
  const s = ctx.summary;
  const org = ctx.organization.name;

  if (isGreeting(q)) {
    const alert =
      s.latePayments > 0
        ? `Attention : ${s.latePayments} impayé(s) à traiter.`
        : s.availableApartments > 0
          ? `${s.availableApartments} logement(s) vacant(s) disponibles.`
          : 'Parc stable côté impayés / vacance.';
    return `Bonjour — Intelligence ITC pour « ${org} ».

${portfolioSnapshot(ctx)}
${alert}

${capabilitiesBlurb()}

Posez une question précise, ou choisissez une suggestion ci-dessous.`;
  }

  if (isThanks(q)) {
    return `Avec plaisir. Dites-moi la suite : impayés, vacants, contrat PDF, ou retirer un locataire.`;
  }

  if (isHelp(q)) {
    return `Je suis le copilote immobilier d’ITC pour « ${org} ».

${capabilitiesBlurb()}

Exemples : « Voir mes impayés », « Quels logements sont vacants ? », « Générer un contrat », « Comment retirer un locataire ? ».`;
  }

  if (q.includes('retard') || q.includes('impaye') || q.includes('impayé')) {
    if (s.latePayments === 0) {
      return `Aucun loyer en retard pour « ${org} ». ${s.pendingPayments} paiement(s) en attente.`;
    }
    const list = ctx.latePayments
      .map((p) => `• ${p.tenantName} (${p.apartmentLabel}) : ${fmt(p.amountXaf)} XAF — échéance ${p.dueDate}`)
      .join('\n');
    const totalLate = ctx.latePayments.reduce((sum, p) => sum + p.amountXaf, 0);
    return `Vous avez ${s.latePayments} loyer(s) impayé(s)${totalLate > 0 ? ` (échantillon : ${fmt(totalLate)} XAF)` : ''} :
${list || 'Consultez le module Paiements pour le détail complet.'}`;
  }

  if (q.includes('vacant') || q.includes('disponib') || q.includes('libre')) {
    if (s.availableApartments === 0) {
      return `Aucun logement vacant. Occupation : ${s.occupancyRate} % (${s.occupiedApartments}/${s.totalApartments}).`;
    }
    const list = ctx.availableApartments
      .map((a) => `• ${a.label}${a.buildingName ? ` — ${a.buildingName}` : ''} — ${fmt(a.rentXaf)} XAF/mois`)
      .join('\n');
    return `${s.availableApartments} logement(s) vacant(s) :
${list}`;
  }

  if (q.includes('occupation') || q.includes('occup')) {
    return `Taux d'occupation actuel : ${s.occupancyRate} % (${s.occupiedApartments} occupés / ${s.totalApartments} biens). ${s.availableApartments} vacant(s).`;
  }

  if (q.includes('revenu') || q.includes('encaiss') || q.includes('collect')) {
    return `Encaissements ce mois : ${fmt(s.collectedThisMonthXaf)} XAF.
Potentiel loyer mensuel du parc : ${fmt(s.potentialMonthlyRentXaf)} XAF.
${s.latePayments} retard(s), ${s.pendingPayments} en attente.`;
  }

  if (q.includes('expir') || q.includes('echeanc') || (q.includes('contrat') && !q.includes('comment') && !q.includes('gener') && !q.includes('cree'))) {
    if (ctx.expiringLeases.length === 0) {
      return `Aucun contrat actif n'expire dans les 30 prochains jours. Contrats actifs : ${s.activeLeases}.`;
    }
    const list = ctx.expiringLeases
      .map((l) => `• ${l.tenantName} — ${l.apartmentLabel} (fin : ${l.endDate})`)
      .join('\n');
    return `Contrats arrivant à échéance sous 30 jours :
${list}`;
  }

  if (q.includes('immeuble') && (q.includes('plus') || q.includes('revenu') || q.includes('genere') || q.includes('génère'))) {
    if (ctx.buildings.length === 0) {
      return 'Aucun immeuble enregistré pour le moment.';
    }
    const sorted = [...ctx.buildings].sort((a, b) => b.potentialRentXaf - a.potentialRentXaf);
    const top = sorted[0]!;
    const list = sorted
      .slice(0, 5)
      .map(
        (b) =>
          `• ${b.name} — potentiel ${fmt(b.potentialRentXaf)} XAF/mois (${b.occupiedCount}/${b.apartmentCount} occupés)`,
      )
      .join('\n');
    return `Classement par potentiel de loyers (données parc) :
${list}

En tête : ${top.name}.`;
  }

  if (q.includes('risque')) {
    const risks: string[] = [];
    if (s.latePayments > 0) risks.push(`${s.latePayments} paiement(s) en retard`);
    if (s.availableApartments > 0) risks.push(`${s.availableApartments} logement(s) vacant(s)`);
    if (ctx.expiringLeases.length > 0) risks.push(`${ctx.expiringLeases.length} contrat(s) à échéance ≤ 30 j`);
    if (risks.length === 0) {
      return `Aucun risque critique détecté sur les indicateurs disponibles pour « ${org} ».`;
    }
    return `Risques actuels (données réelles) :
${risks.map((r) => `• ${r}`).join('\n')}`;
  }

  if (
    (q.includes('retirer') || q.includes('evincer') || q.includes('expulser') || q.includes('liberer')) &&
    (q.includes('locataire') || q.includes('bail'))
  ) {
    return `Pour retirer un locataire (départ, décision propriétaire, fin de bail…) :
1. Ouvrez Locataires → fiche du locataire
2. Appuyez sur « Retirer le locataire »
3. Choisissez le motif (départ / décision proprio / fin de bail / impayés / autre)

ITC résilie le(s) bail(s) actif(s), libère le logement et archive l’accès portail. Le dossier reste en historique.`;
  }

  if (q.includes('comment') && q.includes('locataire')) {
    return `Pour ajouter un locataire : Locataires → +, identité (N° pièce), contacts, puis associez un logement / contrat.
Pour le retirer : fiche locataire → « Retirer le locataire » (motif + confirmation).`;
  }
  if (q.includes('comment') && q.includes('paiement')) {
    return `Pour enregistrer un paiement : ouvrez Paiements, sélectionnez l'échéance, puis « Marquer payé ».`;
  }
  if (q.includes('comment') && q.includes('contrat')) {
    return `Pour créer / gérer un contrat : module Contrats — activation, PDF, renouvellement (+12 mois) ou résiliation depuis le menu d'actions.`;
  }

  if (
    (q.includes('gener') || q.includes('cree') || q.includes('créer')) &&
    (q.includes('contrat') || q.includes('bail'))
  ) {
    return `Pour générer un contrat PDF : ouvrez Contrats → menu du bail → « Générer le contrat PDF ».
Le document inclut identité, loyers et clauses. Vous pouvez aussi me demander un bail précis si OpenAI est actif côté serveur.`;
  }

  if (q.includes('resum') || q.includes('résum') || q.includes('patrimoine') || q.includes('parc') || q.includes('situation')) {
    return `Résumé « ${org} » (${ctx.organization.city}) :
• ${s.totalBuildings} immeuble(s), ${s.totalApartments} biens (${s.availableApartments} vacants, ${s.occupiedApartments} occupés)
• Occupation ${s.occupancyRate} % · ${s.activeLeases} contrats · ${s.totalTenants} locataires
• Encaissé ce mois : ${fmt(s.collectedThisMonthXaf)} XAF
• Impayés : ${s.latePayments} · En attente : ${s.pendingPayments}`;
  }

  if (q.includes('combien') && (q.includes('contrat') || q.includes('bail'))) {
    return `Contrats actifs : ${s.activeLeases}. Locataires : ${s.totalTenants}.`;
  }

  // Question floue : répondre utilement sans dump générique froid
  const focus =
    s.latePayments > 0
      ? `Priorité suggérée : traiter les ${s.latePayments} impayé(s).`
      : s.availableApartments > 0
        ? `Priorité suggérée : commercialiser ${s.availableApartments} vacant(s).`
        : `Priorité suggérée : suivre les ${s.activeLeases} contrat(s) actifs.`;

  return `Je n’ai pas reconnu une demande précise, mais voici l’état de « ${org} » :

${portfolioSnapshot(ctx)}
${focus}

Reformulez par ex. : « mes impayés », « logements vacants », « résumé patrimoine », « comment retirer un locataire ».`;
}

/** Suggestions contextuelles (toujours basées sur les compteurs réels). */
export function buildContextualSuggestions(ctx: AiOrganizationContext): string[] {
  const s = ctx.summary;
  const list: string[] = ['Résumer mon patrimoine'];
  if (s.latePayments > 0) list.push('Voir mes impayés');
  else list.push('Quels sont mes revenus ce mois-ci ?');
  if (s.availableApartments > 0) list.push('Quels logements sont vacants ?');
  else list.push('Quel est mon taux d\'occupation ?');
  if (ctx.expiringLeases.length > 0) list.push('Contrats à échéance');
  else list.push('Combien de contrats actifs ?');
  list.push('Générer un contrat de location');
  list.push('Comment retirer un locataire ?');
  return list.slice(0, 6);
}
