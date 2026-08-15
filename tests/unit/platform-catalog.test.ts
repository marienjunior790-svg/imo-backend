import { getPlatformCatalog, PLATFORM_CATALOG, PROPOSED_IOS_BUNDLE_ID } from '../../src/modules/public/platform-catalog.js';

describe('platform catalog — vérité store ITC', () => {
  it('ne déclare pas iOS comme disponible sur l’App Store', () => {
    const catalog = getPlatformCatalog();
    const ios = catalog.platforms.find((p) => p.id === 'ios');
    expect(ios).toBeDefined();
    expect(ios!.released).toBe(false);
    expect(ios!.storeUrl).toBeNull();
    expect(ios!.downloadLabel).toBeNull();
    expect(ios!.version).toBeNull();
    expect(catalog.ios.released).toBe(false);
    expect(catalog.ios.showAppStoreCta).toBe(false);
  });

  it('conserve l’identité Android Flutter officielle', () => {
    const android = PLATFORM_CATALOG.find((p) => p.id === 'android');
    expect(android?.applicationId).toBe('cg.immo.tec.immo_tec');
    expect(android?.version).toBe('1.0.39');
    expect(android?.build).toBe('70');
    expect(android?.store).toBe('sideload');
  });

  it('propose un bundle iOS sans underscore (règle Apple)', () => {
    expect(PROPOSED_IOS_BUNDLE_ID).toBe('cg.immo.tec.immotec');
    expect(PROPOSED_IOS_BUNDLE_ID).toMatch(/^[A-Za-z0-9.-]+$/);
    expect(PROPOSED_IOS_BUNDLE_ID).not.toContain('_');
    expect(getPlatformCatalog().ios.proposedBundleIdentifierStatus).toBe(
      'proposed_unregistered',
    );
  });
});
