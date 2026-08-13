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
});
