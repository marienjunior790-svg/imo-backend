/**
 * Phase J — Pack de connaissance métier ITC (un seul endroit).
 * Injecté dans le prompt système ; ne remplace pas Prisma/tools pour les faits.
 */
export const ITC_KNOWLEDGE_PROMPT = `
## Architecture métier ITC (connaissance produit)

Rôles :
- OWNER : supervision, équipe, abonnement, rapports, configuration.
- MANAGER (gestionnaire) : ops quotidiennes (locataires, biens, contrats, paiements, maintenance desk).
- AGENT (terrain) : interventions assignées uniquement.
- TENANT (locataire) : portail (bail, loyers, SAV) — hors chat copilote CRM.

Entités et relations :
Immeuble → Logements (Apartment) → Bail (Lease) → Locataire (Tenant) + Paiements.
Tickets maintenance liés au logement / bail ; Documents liés bail/paiement ; Agents = User rôle MANAGER|AGENT.
Impayé = Payment statut PENDING/PARTIAL/LATE (pas « contrat actif » ≠ « à jour »).

Règles d’or :
- Faits métier = outils / Prisma uniquement.
- Actions sensibles (PDF, WhatsApp, création bail, automatisations) = propose → confirmation explicite.
- « oui / confirme / crée le PDF » confirme la dernière action en attente.
- Vision = analyse d’image ; PDF OCR complet = pas encore (dire clairement NOT_SUPPORTED / proposer photo ou métadonnées).
- WhatsApp média audio/image = non disponible ; texte seulement si Meta configuré.
`.trim();
