import type { AiOrganizationContext } from './ai.context.service.js';

export interface AiActionHint {
  label: string;
  /** Navigation in-app */
  route?: string;
  /** Lien externe (PDF contrat, etc.) */
  url?: string;
}

/** Déduit des actions de navigation à partir de la question (pas de données inventées). */
export function resolveChatActions(message: string): AiActionHint[] {
  const q = message.toLowerCase();
  const actions: AiActionHint[] = [];

  if (q.includes('impay') || q.includes('retard') || q.includes('relanc')) {
    actions.push({ label: 'Voir les impayés', route: '/payments?tab=unpaid' });
  }
  if (q.includes('vacant') || q.includes('disponib') || q.includes('libre') || q.includes('occupation')) {
    actions.push({ label: 'Voir les biens', route: '/properties' });
  }
  if (q.includes('contrat') || q.includes('bail') || q.includes('échéanc') || q.includes('expir')) {
    actions.push({ label: 'Voir les contrats', route: '/leases' });
  }
  if (q.includes('revenu') || q.includes('encaiss') || q.includes('loyer') || q.includes('paiement')) {
    actions.push({ label: 'Voir les paiements', route: '/payments' });
  }
  if (q.includes('locataire') && (q.includes('ajout') || q.includes('cré') || q.includes('comment'))) {
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
    (q.includes('génér') || q.includes('gener') || q.includes('crée') || q.includes('cree')) &&
    (q.includes('contrat') || q.includes('bail'))
  ) {
    actions.unshift({ label: 'Voir les contrats', route: '/leases' });
  }

  // Dédupliquer par route/url
  const seen = new Set<string>();
  return actions.filter((a) => {
    const key = a.url ?? a.route ?? a.label;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}

/** Réponses rule-based si OpenAI indisponible — basées uniquement sur le contexte org. */
export function buildLocalFallbackReply(message: string, ctx: AiOrganizationContext): string {
  const q = message.toLowerCase();
  const s = ctx.summary;

  if (q.includes('retard') || q.includes('impayé') || q.includes('impaye')) {
    if (s.latePayments === 0) {
      return `Aucun loyer en retard pour ${ctx.organization.name}. ${s.pendingPayments} paiement(s) en attente.`;
    }
    const list = ctx.latePayments
      .map((p) => `• ${p.tenantName} (${p.apartmentLabel}) : ${p.amountXaf.toLocaleString('fr-FR')} XAF — échéance ${p.dueDate}`)
      .join('\n');
    const totalLate = ctx.latePayments.reduce((sum, p) => sum + p.amountXaf, 0);
    return `Vous avez ${s.latePayments} loyer(s) impayé(s)${totalLate > 0 ? ` (échantillon listé : ${totalLate.toLocaleString('fr-FR')} XAF)` : ''} :\n${list || 'Consultez le module Paiements pour le détail complet.'}`;
  }

  if (q.includes('vacant') || q.includes('disponib') || q.includes('libre')) {
    if (s.availableApartments === 0) {
      return `Aucun logement vacant. Occupation : ${s.occupancyRate} % (${s.occupiedApartments}/${s.totalApartments}).`;
    }
    const list = ctx.availableApartments
      .map((a) => `• ${a.label}${a.buildingName ? ` — ${a.buildingName}` : ''} — ${a.rentXaf.toLocaleString('fr-FR')} XAF/mois`)
      .join('\n');
    return `${s.availableApartments} logement(s) vacant(s) :\n${list}`;
  }

  if (q.includes('occupation') || q.includes('occup')) {
    return `Taux d'occupation actuel : ${s.occupancyRate} % (${s.occupiedApartments} occupés / ${s.totalApartments} biens). ${s.availableApartments} vacant(s).`;
  }

  if (q.includes('revenu') || q.includes('encaiss') || q.includes('collect')) {
    return `Encaissements ce mois : ${s.collectedThisMonthXaf.toLocaleString('fr-FR')} XAF.\nPotentiel loyer mensuel du parc : ${s.potentialMonthlyRentXaf.toLocaleString('fr-FR')} XAF.\n${s.latePayments} retard(s), ${s.pendingPayments} en attente.`;
  }

  if (q.includes('expir') || q.includes('échéanc') || q.includes('echeanc') || (q.includes('contrat') && !q.includes('comment'))) {
    if (ctx.expiringLeases.length === 0) {
      return `Aucun contrat actif n'expire dans les 30 prochains jours. Contrats actifs : ${s.activeLeases}.`;
    }
    const list = ctx.expiringLeases
      .map((l) => `• ${l.tenantName} — ${l.apartmentLabel} (fin : ${l.endDate})`)
      .join('\n');
    return `Contrats arrivant à échéance sous 30 jours :\n${list}`;
  }

  if (q.includes('immeuble') && (q.includes('plus') || q.includes('revenu') || q.includes('génère') || q.includes('genere'))) {
    if (ctx.buildings.length === 0) {
      return 'Aucun immeuble enregistré pour le moment.';
    }
    const sorted = [...ctx.buildings].sort((a, b) => b.potentialRentXaf - a.potentialRentXaf);
    const top = sorted[0]!;
    const list = sorted
      .slice(0, 5)
      .map((b) => `• ${b.name} — potentiel ${b.potentialRentXaf.toLocaleString('fr-FR')} XAF/mois (${b.occupiedCount}/${b.apartmentCount} occupés)`)
      .join('\n');
    return `Classement par potentiel de loyers (données parc) :\n${list}\n\nEn tête : ${top.name}.`;
  }

  if (q.includes('risque')) {
    const risks: string[] = [];
    if (s.latePayments > 0) risks.push(`${s.latePayments} paiement(s) en retard`);
    if (s.availableApartments > 0) risks.push(`${s.availableApartments} logement(s) vacant(s)`);
    if (ctx.expiringLeases.length > 0) risks.push(`${ctx.expiringLeases.length} contrat(s) à échéance ≤ 30 j`);
    if (risks.length === 0) {
      return `Aucun risque critique détecté sur les indicateurs disponibles pour ${ctx.organization.name}.`;
    }
    return `Risques actuels (données réelles) :\n${risks.map((r) => `• ${r}`).join('\n')}`;
  }

  if (q.includes('comment') && q.includes('locataire')) {
    return `Pour ajouter un locataire : ouvrez Locataires → bouton +, renseignez identité et contacts, puis liez un contrat depuis Contrats.`;
  }
  if (q.includes('comment') && q.includes('paiement')) {
    return `Pour enregistrer un paiement : ouvrez Paiements, sélectionnez l'échéance, puis « Marquer payé ».`;
  }
  if (q.includes('comment') && q.includes('contrat')) {
    return `Pour créer / gérer un contrat : module Contrats — activation, renouvellement (+12 mois) ou résiliation depuis le menu d'actions.`;
  }

  if (q.includes('résum') || q.includes('resum') || q.includes('patrimoine') || q.includes('parc')) {
    return `Résumé ${ctx.organization.name} (${ctx.organization.city}) :
• ${s.totalBuildings} immeuble(s), ${s.totalApartments} biens (${s.availableApartments} vacants, ${s.occupiedApartments} occupés)
• Occupation ${s.occupancyRate} % · ${s.activeLeases} contrats · ${s.totalTenants} locataires
• Encaissé ce mois : ${s.collectedThisMonthXaf.toLocaleString('fr-FR')} XAF
• Impayés : ${s.latePayments} · En attente : ${s.pendingPayments}`;
  }

  return `Voici ce que je vois pour ${ctx.organization.name} :
• ${s.totalApartments} biens · occupation ${s.occupancyRate} %
• ${s.collectedThisMonthXaf.toLocaleString('fr-FR')} XAF encaissés ce mois
• ${s.latePayments} impayé(s)

Posez une question précise (impayés, vacants, contrats, revenus) ou lancez une analyse LIA.`;
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
  list.push('Quels sont les risques actuels ?');
  return list.slice(0, 6);
}
