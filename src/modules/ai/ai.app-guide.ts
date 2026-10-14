/**
 * Mode d'emploi de l'application ITC pour l'assistant IA.
 * Le contenu vit dans `ai.app-manual.ts` (guide officiel) ; ce module décide quand l'utiliser.
 */
import {
  APP_MANUAL_OVERVIEW,
  hasHowtoCue,
  normalizeForManual,
  resolveManualAnswer,
  searchAppManual,
} from './ai.app-manual.js';

/** Questions « comment faire / où aller / à quoi sert / que signifie » sur l'application. */
export function isAppHowtoIntent(message: string): boolean {
  const q = normalizeForManual(message);
  if (q.trim().length < 4) return false;

  // Catalogue produit (pas un dump des logements du parc)
  if (/ types? de (biens?|logements?|appartements?) /.test(q)) return true;
  if (/ (mfa|2fa) /.test(q) || (q.includes(' authentif') && (q.includes(' multi') || q.includes(' double')))) {
    return true;
  }
  // Mot de passe perdu / provisoire (souvent sans « comment »)
  if (
    / (mot de passe|password|temporaire|provisoire)/.test(q) &&
    / (plus|perdu|oubli|que faire|comment|retrouver|reset|reinitial|regener)/.test(q)
  ) {
    return true;
  }

  return hasHowtoCue(message) && searchAppManual(message, 1).length > 0;
}

/** Réponse du guide officiel, ou `null` pour laisser la main aux outils de données / au LLM. */
export function resolveAppHowtoReply(message: string): string | null {
  return resolveManualAnswer(message, { requireCue: false })?.reply ?? null;
}

/** Bloc injecté dans le system prompt OpenAI (les extraits détaillés sont ajoutés par question). */
export const APP_GUIDE_PROMPT = `
Tu connais l'application mobile ITC (gestion immobilière). Rôles :
- Propriétaire (OWNER) : supervision, équipe, abonnement, rapports ; mêmes écrans de gestion que le gestionnaire.
- Gestionnaire (MANAGER) : gestion quotidienne (locataires, contrats, paiements, maintenance).
- Agent terrain (AGENT) : uniquement ses missions de maintenance (onglet Missions).
- Locataire (TENANT) : son contrat, ses loyers, ses demandes.

${APP_MANUAL_OVERVIEW}

Quand l'utilisateur demande comment faire, où trouver, à quoi sert un écran ou ce que signifie une couleur ou un statut, réponds avec le chemin exact (ex. « Accueil › Paiements › ouvrez l'échéance › Valider l'encaissement ») en t'appuyant sur le GUIDE OFFICIEL fourni. N'invente jamais d'écran, de bouton ou de couleur.
Ne confonds pas « gestionnaire » (MANAGER) et « agent terrain » (AGENT).
Pour les données (impayés, vacants…), utilise les outils. Pour le mode d'emploi, utilise le guide.`;
