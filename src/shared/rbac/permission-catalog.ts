/**
 * Catalogue RBAC — source unique pour le seed DB.
 */

export interface PermissionDef {
  key: string;
  label: string;
  category: string;
  module: string;
  description?: string;
}

function crud(
  module: string,
  label: string,
  opts?: { export?: boolean; extra?: PermissionDef[] },
): PermissionDef[] {
  const base: PermissionDef[] = [
    { key: `${module}_VIEW`, label: `Consulter ${label}`, category: 'read', module },
    { key: `${module}_CREATE`, label: `Créer ${label}`, category: 'write', module },
    { key: `${module}_EDIT`, label: `Modifier ${label}`, category: 'write', module },
    { key: `${module}_DELETE`, label: `Supprimer ${label}`, category: 'delete', module },
  ];
  if (opts?.export !== false) {
    base.push({ key: `${module}_EXPORT`, label: `Exporter ${label}`, category: 'export', module });
  }
  return [...base, ...(opts?.extra ?? [])];
}

const LEASE = crud('LEASE', 'baux', {
  extra: [
    { key: 'LEASE_SIGN', label: 'Signer un bail', category: 'write', module: 'LEASE' },
    { key: 'LEASE_RENEW', label: 'Renouveler un bail', category: 'write', module: 'LEASE' },
    { key: 'LEASE_TERMINATE', label: 'Résilier un bail', category: 'write', module: 'LEASE' },
    { key: 'LEASE_EXPORT_PDF', label: 'Exporter bail PDF', category: 'export', module: 'LEASE' },
  ],
});

const PAYMENT = crud('PAYMENT', 'paiements', {
  extra: [
    { key: 'PAYMENT_VALIDATE', label: 'Valider un paiement', category: 'write', module: 'PAYMENT' },
    { key: 'PAYMENT_EXPORT_EXCEL', label: 'Exporter paiements Excel', category: 'export', module: 'PAYMENT' },
    { key: 'PAYMENT_EXPORT_PDF', label: 'Exporter reçu PDF', category: 'export', module: 'PAYMENT' },
  ],
});

const APPLICATION = [
  ...crud('APPLICATION', 'candidatures', { export: false }),
  { key: 'APPLICATION_SUBMIT', label: 'Soumettre candidature', category: 'write', module: 'APPLICATION' },
  { key: 'APPLICATION_WITHDRAW', label: 'Annuler candidature', category: 'write', module: 'APPLICATION' },
  { key: 'APPLICATION_APPROVE', label: 'Approuver candidature', category: 'write', module: 'APPLICATION' },
  { key: 'APPLICATION_REJECT', label: 'Refuser candidature', category: 'write', module: 'APPLICATION' },
  { key: 'APPLICATION_SCORE', label: 'Scorer candidature IA', category: 'write', module: 'APPLICATION' },
];

const MAINTENANCE = [
  ...crud('MAINTENANCE', 'maintenance', { export: false }),
  { key: 'MAINTENANCE_ASSIGN', label: 'Assigner maintenance', category: 'write', module: 'MAINTENANCE' },
  { key: 'MAINTENANCE_CLOSE', label: 'Clôturer maintenance', category: 'write', module: 'MAINTENANCE' },
];

const ORG = [
  ...crud('ORG', 'organisation', { export: false }),
  { key: 'ORG_ACTIVATE', label: 'Activer organisation', category: 'admin', module: 'ORG' },
  { key: 'ORG_DEACTIVATE', label: 'Désactiver organisation', category: 'admin', module: 'ORG' },
  { key: 'ORG_VALIDATE', label: 'Valider organisation', category: 'admin', module: 'ORG' },
];

const USER = [
  ...crud('USER', 'utilisateurs', { export: false }),
  { key: 'USER_ROLE_CHANGE', label: 'Modifier rôle utilisateur', category: 'admin', module: 'USER' },
  { key: 'USER_ACTIVATE', label: 'Activer utilisateur', category: 'admin', module: 'USER' },
  { key: 'USER_DEACTIVATE', label: 'Désactiver utilisateur', category: 'admin', module: 'USER' },
];

export const PERMISSION_CATALOG: PermissionDef[] = [
  { key: 'DASHBOARD_VIEW', label: 'Voir tableau de bord', category: 'read', module: 'DASHBOARD' },
  { key: 'DASHBOARD_GLOBAL_VIEW', label: 'Dashboard global plateforme', category: 'read', module: 'DASHBOARD' },
  { key: 'REVENUE_VIEW', label: 'Voir revenus', category: 'read', module: 'REVENUE' },
  { key: 'REVENUE_EXPORT', label: 'Exporter revenus', category: 'export', module: 'REVENUE' },
  ...crud('BUILDING', 'immeubles'),
  ...crud('APARTMENT', 'appartements'),
  ...crud('TENANT', 'locataires'),
  ...LEASE,
  ...PAYMENT,
  ...APPLICATION,
  ...MAINTENANCE,
  ...crud('INSPECTION', 'états des lieux', { export: false }).concat([
    { key: 'INSPECTION_SIGN', label: 'Signer état des lieux', category: 'write', module: 'INSPECTION' },
  ]),
  ...crud('REPORT', 'rapports'),
  ...crud('DOCUMENT', 'documents'),
  ...crud('LISTING', 'annonces'),
  { key: 'NOTIFICATION_VIEW', label: 'Voir notifications', category: 'notification', module: 'NOTIFICATION' },
  { key: 'NOTIFICATION_CENTER_VIEW', label: 'Centre de notifications', category: 'notification', module: 'NOTIFICATION' },
  { key: 'NOTIFICATION_SEND', label: 'Envoyer notification', category: 'notification', module: 'NOTIFICATION' },
  { key: 'MESSAGE_VIEW', label: 'Voir messages', category: 'message', module: 'MESSAGE' },
  { key: 'MESSAGE_SEND', label: 'Envoyer message', category: 'message', module: 'MESSAGE' },
  { key: 'REMINDER_VIEW', label: 'Voir relances', category: 'reminder', module: 'REMINDER' },
  { key: 'REMINDER_SEND', label: 'Envoyer relance', category: 'reminder', module: 'REMINDER' },
  { key: 'REMINDER_CONFIGURE', label: 'Configurer relances', category: 'reminder', module: 'REMINDER' },
  { key: 'TASK_VIEW', label: 'Voir tâches', category: 'task', module: 'TASK' },
  { key: 'TASK_CREATE', label: 'Créer tâche', category: 'task', module: 'TASK' },
  { key: 'TASK_COMPLETE', label: 'Terminer tâche', category: 'task', module: 'TASK' },
  ...ORG,
  ...USER,
  ...crud('SUBSCRIPTION', 'abonnements', { export: false }),
  ...crud('BILLING', 'facturation', { export: false }),
  ...crud('WORKFLOW', 'workflows', { export: false }),
  { key: 'AI_USE', label: 'Utiliser IA', category: 'ai', module: 'AI' },
  { key: 'AI_CHAT', label: 'Chat IA', category: 'ai', module: 'AI' },
  { key: 'AI_ANALYZE', label: 'Analyses LIA', category: 'ai', module: 'AI' },
  { key: 'AI_SCORE', label: 'Scoring IA', category: 'ai', module: 'AI' },
  { key: 'AI_CONFIGURE', label: 'Configurer IA', category: 'admin', module: 'AI' },
  { key: 'PLATFORM_DASHBOARD_VIEW', label: 'Dashboard plateforme', category: 'platform', module: 'PLATFORM' },
  { key: 'PLATFORM_ORG_VIEW', label: 'Voir organisations', category: 'platform', module: 'PLATFORM' },
  { key: 'PLATFORM_ORG_MANAGE', label: 'Gérer organisations', category: 'platform', module: 'PLATFORM' },
  { key: 'PLATFORM_AGENCY_VIEW', label: 'Voir agences', category: 'platform', module: 'PLATFORM' },
  { key: 'PLATFORM_USER_VIEW', label: 'Utilisateurs plateforme', category: 'platform', module: 'PLATFORM' },
  { key: 'PLATFORM_USER_MANAGE', label: 'Gérer utilisateurs plateforme', category: 'platform', module: 'PLATFORM' },
  { key: 'PLATFORM_STATS_VIEW', label: 'Statistiques plateforme', category: 'platform', module: 'PLATFORM' },
  { key: 'PLATFORM_SETTINGS', label: 'Paramètres système', category: 'platform', module: 'PLATFORM' },
  { key: 'PLATFORM_AUDIT_VIEW', label: 'Journaux audit plateforme', category: 'platform', module: 'PLATFORM' },
  { key: 'AUDIT_VIEW', label: 'Audit organisation', category: 'audit', module: 'AUDIT' },
  { key: 'AUDIT_EXPORT', label: 'Exporter audit', category: 'audit', module: 'AUDIT' },
  { key: 'SETTINGS_VIEW', label: 'Paramètres', category: 'settings', module: 'SETTINGS' },
  { key: 'SETTINGS_EDIT', label: 'Modifier paramètres', category: 'settings', module: 'SETTINGS' },
  { key: 'PROFILE_VIEW', label: 'Voir profil', category: 'settings', module: 'SETTINGS' },
  { key: 'SUBSCRIPTION_MANAGE', label: 'Gérer abonnement', category: 'settings', module: 'SETTINGS' },
  { key: 'WORKFLOW_EDIT', label: 'Modifier workflows', category: 'settings', module: 'SETTINGS' },
  { key: 'PORTAL_HOME_VIEW', label: 'Accueil locataire', category: 'portal', module: 'PORTAL' },
  { key: 'PORTAL_HOMES_VIEW', label: 'Mes logements', category: 'portal', module: 'PORTAL' },
  { key: 'PORTAL_LEASE_VIEW', label: 'Mon bail', category: 'portal', module: 'PORTAL' },
  { key: 'PORTAL_PAYMENTS_VIEW', label: 'Mes paiements', category: 'portal', module: 'PORTAL' },
  { key: 'PORTAL_MAINTENANCE_VIEW', label: 'Ma maintenance', category: 'portal', module: 'PORTAL' },
  { key: 'PORTAL_MAINTENANCE_CREATE', label: 'Signaler maintenance', category: 'portal', module: 'PORTAL' },
  { key: 'TENANT_PORTAL_PROVISION', label: 'Provisionner accès portail', category: 'write', module: 'TENANT' },
  { key: 'TENANT_PORTAL_REGENERATE', label: 'Régénérer mdp temporaire portail', category: 'write', module: 'TENANT' },
  { key: 'TENANT_PORTAL_VIEW_STATUS', label: 'Voir statut accès portail', category: 'read', module: 'TENANT' },
  { key: 'TENANT_PORTAL_RESET', label: 'Réinitialiser compte portail', category: 'admin', module: 'TENANT' },
  { key: 'TENANT_PORTAL_SUSPEND', label: 'Suspendre / réactiver / archiver portail', category: 'admin', module: 'TENANT' },
  { key: 'TECH_HOME_VIEW', label: 'Accueil technicien', category: 'tech', module: 'TECH' },
  { key: 'TECH_JOBS_VIEW', label: 'Interventions', category: 'tech', module: 'TECH' },
  { key: 'TECH_JOBS_MANAGE', label: 'Gérer interventions', category: 'tech', module: 'TECH' },
  { key: 'TECH_JOBS_COMMENT', label: 'Commenter une intervention', category: 'tech', module: 'TECH' },
  { key: 'TECH_PHOTO_UPLOAD', label: 'Joindre photos avant / après', category: 'tech', module: 'TECH' },
  { key: 'TECH_CALENDAR_VIEW', label: 'Calendrier', category: 'tech', module: 'TECH' },
  { key: 'TECH_HISTORY_VIEW', label: 'Historique', category: 'tech', module: 'TECH' },
];

export const P = Object.fromEntries(PERMISSION_CATALOG.map((d) => [d.key, d.key])) as Record<string, string>;

export type PermissionKey = string;

export const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map((d) => d.key);
