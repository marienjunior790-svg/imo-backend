/**
 * Phase J2 — Pack de connaissance métier ITC (un seul endroit).
 * Source : prisma/schema.prisma + parcours réels app (roles, leases, payments, maintenance).
 * Injecté dans le prompt système ; ne remplace JAMAIS Prisma/tools pour les faits chiffrés.
 */

export const ITC_KNOWLEDGE_PROMPT = `
## Architecture métier ITC (Knowledge Layer)

### Rôles (UserRole)
- OWNER : supervision org, équipe, abonnement, rapports, config. Peut tout consulter.
- MANAGER : ops locatives (locataires, biens, baux, paiements, maintenance desk, candidatures).
- AGENT : interventions terrain assignées uniquement (pas le CRM complet).
- TENANT : portail personnel (bail, loyers, SAV) — hors chat copilote CRM propriétaire.
- Legacy : ORG_ADMIN ≈ OWNER, TECHNICIAN ≈ AGENT.
- Autres (ACCOUNTANT, SUPPORT, …) : hors copilote ops standard.

### Graphe d’entités
Organization
  → Building (immeuble)
    → Apartment (logement : status AVAILABLE | OCCUPIED | MAINTENANCE | UNAVAILABLE)
      → Lease (bail : DRAFT | ACTIVE | EXPIRED | TERMINATED) lié à Tenant
        → Payment (loyer périodique : PENDING | PAID | LATE | PARTIAL | CANCELLED)
        → Document (LEASE_CONTRACT, …)
        → MaintenanceTicket (OPEN → ASSIGNED → IN_PROGRESS → COMPLETED/CLOSED)
      → Document (APARTMENT_PHOTO, …)
  → User (OWNER/MANAGER/AGENT) + notifications in-app
  → AiPendingAction (propose → confirm pour PDF / WhatsApp / bail / automations)

### Règles métier critiques
1. Bail ACTIVE ≠ loyers à jour. Impayé = Payment en PENDING / PARTIAL / LATE (dueDate dépassée pour LATE).
2. Un logement OCCUPIED a en principe un bail ACTIVE ; AVAILABLE = vacant commercialisable.
3. PDF contrat / reçu / avis : génération via LeaseService / PaymentService après confirmation explicite (AiPendingAction). Jamais d’envoi silencieux.
4. WhatsApp texte : propose → confirm → Meta Cloud API → providerMessageId. Audio/image WhatsApp = NOT_SUPPORTED.
5. Documents IA aujourd’hui = métadonnées Prisma + faits structurés (loyer, dates, locataire). OCR PDF / extraction de clauses = NOT_SUPPORTED — proposer photo (vision) ou faits bail.
6. Maintenance : locataire signale (SAV) ; desk MANAGER/OWNER assigne ; AGENT exécute. Priorités LOW|MEDIUM|HIGH|CRITICAL.
7. Relances loyers : DUE_SOON, DUNNING_L1/L2/L3, OWNER_ALERT (RentFollowUpType) — automatisations = propose + APPROVE_AUTOMATION_RUN.
8. Périmètre = organisation du JWT uniquement. Monnaie = XAF.
9. Mémoire utilisateur = préférences explicites ; jamais source de loyers / montants / statuts.

### Raisonnement attendu (exemples)
- « Pourquoi ce locataire est en retard alors que son contrat est actif ? »
  → bail ACTIVE + au moins un Payment LATE/PENDING/PARTIAL ; expliquer la distinction statut bail vs statut paiement ; outiller getOutstandingPayments / getContracts.
- « Génère le reçu de Yannick » → résoudre locataire → paiement PAID pertinent → proposeGeneratePaymentReceipt → confirm.
- « Compare ces deux contrats » → compareDocuments si deux leaseId ; sinon demander les IDs ; pas d’OCR inventé.
`.trim();

function normalizeFr(message: string): string {
  return message
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’']/g, "'")
    .trim();
}

/**
 * Clarifications locales honnêtes (limites produit) — avant dump patrimoine / faux succès.
 * Retourne null si le message n’est pas une demande de capacité non supportée / raisonnement guidé.
 */
export function resolveKnowledgeClarification(message: string): string | null {
  const q = normalizeFr(message);

  // OCR / lecture clause PDF fichier — laisse passer les questions de faits structurés (J4 pipeline)
  const wantsStructuredDocFacts =
    q.includes('loyer') ||
    q.includes('montant') ||
    q.includes('echeance') ||
    q.includes('duree') ||
    q.includes('depot') ||
    q.includes('caution') ||
    q.includes('debut') ||
    q.includes('date de fin') ||
    q.includes('resume') ||
    q.includes('anomal') ||
    q.includes('incoher');
  if (
    !q.includes('photo') &&
    !wantsStructuredDocFacts &&
    (q.includes('ocr') ||
      (q.includes('clause') && (q.includes('contrat') || q.includes('pdf') || q.includes('document'))) ||
      (q.includes('lis') && q.includes('pdf') && (q.includes('contrat') || q.includes('document'))) ||
      (q.includes('extrait') && q.includes('pdf')) ||
      (q.includes('texte') && q.includes('pdf') && (q.includes('contrat') || q.includes('document'))))
  ) {
    return (
      `Lecture OCR / extraction de clauses depuis un PDF fichier : pas encore disponible (NOT_SUPPORTED).\n\n` +
      `Ce que je peux faire maintenant :\n` +
      `• faits structurés du bail (loyer, dates, durée, locataire, statut) via les données ITC\n` +
      `• comparaison de deux baux par leaseId / anomalies de cohérence\n` +
      `• analyse d’une **photo** nette du document (vision)\n\n` +
      `Exemples : « quel est le loyer du bail de Yannick ? », « durée du contrat de … », « compare les baux <idA> et <idB> », ou envoyez une photo du contrat.`
    );
  }

  // WhatsApp média
  if (
    (q.includes('whatsapp') || q.includes('wa ')) &&
    (q.includes('audio') ||
      q.includes('image') ||
      q.includes('photo') ||
      q.includes('media') ||
      q.includes('média') ||
      q.includes('voix') ||
      q.includes('vocal'))
  ) {
    return (
      `WhatsApp audio / image : non disponible (NOT_SUPPORTED).\n\n` +
      `Parcours réel supporté : message **texte** → proposition → votre confirmation → envoi Meta → ID fournisseur.\n` +
      `Demandez par ex. : « prépare une relance WhatsApp pour l’impayé de … ».`
    );
  }

  // Pourquoi retard + bail actif (deep reasoning guide — facts via tools côté chat)
  if (
    (q.includes('pourquoi') || q.includes('comment se fait')) &&
    (q.includes('retard') || q.includes('impay') || q.includes('en retard')) &&
    (q.includes('contrat') || q.includes('bail') || q.includes('actif'))
  ) {
    return (
      `Un bail ACTIVE signifie que la relation locative est en cours — pas que tous les loyers sont soldés.\n\n` +
      `En retard = au moins un paiement en statut LATE, PENDING ou PARTIAL (échéance dépassée pour LATE).\n` +
      `Demandez « mes impayés » ou « qui doit encore payer » pour la liste réelle issue de la base.\n` +
      `Ensuite on peut préparer une relance (message / WhatsApp texte) avec confirmation.`
    );
  }

  // Rapport inspection / état des lieux / synthèse PDF non encore générable
  if (
    (q.includes('etat des lieux') ||
      q.includes('état des lieux') ||
      q.includes('rapport d\'inspection') ||
      q.includes('rapport inspection') ||
      q.includes('fiche logement') ||
      q.includes('lettre locataire')) &&
    (q.includes('gener') || q.includes('cree') || q.includes('creer') || q.includes('pdf') || q.includes('prepa'))
  ) {
    return (
      `Ce type de document (état des lieux / inspection / fiche / lettre) n’est pas encore générable par l’IA (template prévu).\n\n` +
      `Disponibles aujourd’hui après confirmation : contrat PDF, reçu de paiement, avis de paiement.\n` +
      `Demandez par ex. « génère le contrat PDF de … » ou « génère le reçu du paiement de … ».`
    );
  }

  return null;
}
