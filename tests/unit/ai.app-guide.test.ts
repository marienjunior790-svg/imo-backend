import { isAppHowtoIntent, resolveAppHowtoReply } from '../../src/modules/ai/ai.app-guide.js';
import {
  APP_MANUAL,
  MANUAL_CATEGORIES,
  manualPromptFor,
  resolveManualAnswer,
  searchAppManual,
} from '../../src/modules/ai/ai.app-manual.js';

/** Routes réellement ouvertes par l'application mobile (HomeScreen.navigate). */
const APP_ROUTES = [
  '/dashboard', '/settings', '/assistant', '/properties', '/properties/create', '/tenants', '/tenants/new',
  '/leases', '/leases/new', '/payments', '/maintenance', '/maintenance/new', '/team', '/team/agents/new',
  '/notifications', '/reports',
];

describe('Guide officiel de l’application', () => {
  it('a des fiches cohérentes (id unique, catégorie connue, route ouverte par l’app)', () => {
    const ids = APP_MANUAL.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of APP_MANUAL) {
      expect((MANUAL_CATEGORIES as readonly string[]).includes(s.category)).toBe(true);
      expect(s.keywords.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(80);
      if (s.route) expect(APP_ROUTES).toContain(s.route);
    }
  });

  it.each([
    ['À quoi sert l’onglet Biens ?', 'properties', /immeuble/i],
    ['Que signifie la couleur orange ?', 'colors', /ORANGE, attention/],
    ['Comment encaisser un loyer ?', 'payment-record', /Valider l’encaissement/],
    ['Que veut dire le statut Partiel ?', 'status-catalogue', /Partiel/],
    ['Pourquoi la fenêtre clignote dans la maquette 3D ?', 'building-detail', /clignote/],
    ['Comment changer le thème en mode sombre ?', 'themes', /Noir/],
    ['Les relances sont-elles automatiques ? comment ça marche', 'reminders', /J\+15/],
    ['Comment confier une intervention à un prestataire ?', 'ticket-assign', /Assigner le prestataire/],
    ['Combien coûte la formule Pro ?', 'subscription', /45 000/],
    ['À quoi sert le taux de recouvrement ?', 'dashboard-month', /encaissé ÷ attendu/],
  ])('« %s » → fiche %s', (question, id, expected) => {
    const answer = resolveManualAnswer(question, { requireCue: false });
    expect(answer?.sectionIds[0]).toBe(id);
    expect(answer?.reply).toMatch(expected);
  });

  it('laisse passer les demandes de données et les ordres d’action', () => {
    expect(resolveManualAnswer('Voir mes impayés')).toBeNull();
    expect(resolveManualAnswer('Crée un ticket pour la fuite chez Jean')).toBeNull();
    expect(resolveManualAnswer('Qui n’a pas encore payé ce mois-ci ?')).toBeNull();
  });

  it('propose le bouton vers l’écran concerné', () => {
    const answer = resolveManualAnswer('Comment ajouter un locataire ?');
    expect(answer?.actions[0]).toEqual({ label: 'Nouveau locataire', route: '/tenants/new' });
  });

  it('fournit au modèle OpenAI la carte des écrans et les extraits pertinents', () => {
    const prompt = manualPromptFor('Comment encaisser un loyer ?');
    expect(prompt).toContain('GUIDE OFFICIEL');
    expect(prompt).toContain('Onglets du bas');
    expect(prompt).toContain('Valider l’encaissement');
    expect(searchAppManual('bonjour', 3)).toEqual([]);
  });
});

describe('AI app guide (howto)', () => {
  it('détecte les questions mode d’emploi', () => {
    expect(isAppHowtoIntent('Comment marche l’application ?')).toBe(true);
    expect(isAppHowtoIntent('Comment ajouter un locataire ?')).toBe(true);
    expect(isAppHowtoIntent('Comment créer un agent ?')).toBe(true);
    expect(isAppHowtoIntent('Voir mes impayés')).toBe(false);
    expect(isAppHowtoIntent('Que signifie la couleur rouge ?')).toBe(true);
    expect(isAppHowtoIntent('À quoi sert l’onglet Biens ?')).toBe(true);
  });

  it('explique la hiérarchie', () => {
    const reply = resolveAppHowtoReply('Comment marche l’application ITC ?');
    expect(reply).toBeTruthy();
    expect(reply!.toLowerCase()).toMatch(/propriétaire|gestionnaire|terrain|locataire/);
  });

  it('guide la création de locataire', () => {
    const reply = resolveAppHowtoReply('Comment ajouter un locataire ?');
    expect(reply).toContain('Locataires');
    expect(reply!.toLowerCase()).toMatch(/portail|mot de passe|identifiant/);
  });

  it('guide la création d’agent', () => {
    const reply = resolveAppHowtoReply('Comment créer un agent gestionnaire ?');
    expect(reply).toMatch(/MANAGER|Gestionnaire|terrain/i);
  });

  it('explique où voir les LoginId agents (pas le menu générique)', () => {
    const reply = resolveAppHowtoReply('où voir les identifiants des agents ?');
    expect(reply).toBeTruthy();
    expect(reply!.toLowerCase()).toMatch(/loginid|équipe|equipe|fiche/);
    expect(reply!).not.toMatch(/Précisez l’action/);
  });

  it('explique comment se connecter en agent', () => {
    const reply = resolveAppHowtoReply('comment me connecter à mon compte agent ?');
    expect(reply).toBeTruthy();
    expect(reply!.toLowerCase()).toMatch(/loginid|mot de passe|connexion|connecter/);
    expect(reply!).not.toMatch(/Précisez l’action/);
  });

  it('ne renvoie plus le menu générique pour une question howto non couverte', () => {
    // Phrase howto vague mais sans fiche dédiée → null pour laisser outils/LLM
    const reply = resolveAppHowtoReply('comment faire avec le truc ITC ?');
    expect(reply).toBeNull();
  });

  it('explique où voir l’équipe', () => {
    const reply = resolveAppHowtoReply('où voir mon équipe ?');
    expect(reply).toBeTruthy();
    expect(reply!.toLowerCase()).toMatch(/équipe|equipe|agents/);
  });

  it('explique le MFA (pas un dump patrimoine)', () => {
    expect(isAppHowtoIntent('à quoi sert l\'authentification MFA ?')).toBe(true);
    const reply = resolveAppHowtoReply('à quoi sert l\'authentification MFA ?');
    expect(reply).toBeTruthy();
    expect(reply!.toLowerCase()).toMatch(/mfa|multi-facteurs|2ᵉ|mot de passe/);
    expect(reply!).not.toMatch(/encaiss|occupation|vacant/i);
    expect(reply!).not.toMatch(/Contexte mémoire|Prisma|USER\/FACT/);
  });

  it('explique les types de biens ITC (catalogue, pas liste logements)', () => {
    expect(isAppHowtoIntent('combien de types de biens existent au sein de ITC ?')).toBe(true);
    const reply = resolveAppHowtoReply('combien de types de biens existent au sein de ITC ?');
    expect(reply).toBeTruthy();
    expect(reply!.toLowerCase()).toMatch(/pièces|statut|libellé|label|vacant|occup/);
    expect(reply!).not.toMatch(/Contexte mémoire|Prisma|USER\/FACT|GATE-BLUE/);
  });

  it('explique que faire si mot de passe temporaire perdu (pas dump patrimoine)', () => {
    const q = 'mais si nous n\'avons plus le mot de passe temporaire que faire ?';
    expect(isAppHowtoIntent(q)).toBe(true);
    const reply = resolveAppHowtoReply(q);
    expect(reply).toBeTruthy();
    expect(reply!.toLowerCase()).toMatch(/temporaire|régénér|reinitial|équipe|locataire|oubli/);
    expect(reply!).not.toMatch(/Voici ce que confirment|encaiss|371/);
  });
});
