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
});
