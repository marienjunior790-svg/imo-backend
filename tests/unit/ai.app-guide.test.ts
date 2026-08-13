import { isAppHowtoIntent, resolveAppHowtoReply } from '../../src/modules/ai/ai.app-guide.js';

describe('AI app guide (howto)', () => {
  it('détecte les questions mode d’emploi', () => {
    expect(isAppHowtoIntent('Comment marche l’application ?')).toBe(true);
    expect(isAppHowtoIntent('Comment ajouter un locataire ?')).toBe(true);
    expect(isAppHowtoIntent('Comment créer un agent ?')).toBe(true);
    expect(isAppHowtoIntent('Voir mes impayés')).toBe(false);
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
