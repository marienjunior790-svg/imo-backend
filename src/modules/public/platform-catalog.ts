/**
 * Catalogue public des plateformes ITC.
 *
 * Source de vérité pour le site et l’API : ne jamais afficher « Disponible
 * sur l’App Store » tant que `ios.released` n’est pas true.
 *
 * Identités vérifiées (APK Flutter 1.0.39 + repo) :
 * - Android officiel : cg.immo.tec.immo_tec (Flutter, label ITC)
 * - Expo `cg.itc.intelligence` : copilote Intelligence uniquement — PAS le store ITC
 * - iOS officiel : source Flutter absente de ce dépôt → non publié
 */

export type PlatformReleaseStatus =
  | 'released'
  | 'sideload_only'
  | 'not_released'
  | 'api_only';

export type StoreKind = 'app_store' | 'play_store' | 'sideload' | 'web' | 'none';

export interface PlatformRelease {
  id: 'android' | 'ios' | 'web';
  productName: string;
  displayName: 'ITC';
  version: string | null;
  build: string | null;
  /** Marketing version séparée par plateforme — ne pas fusionner. */
  minSupported: string | null;
  status: PlatformReleaseStatus;
  /** true seulement si une release store réelle existe. */
  released: boolean;
  store: StoreKind;
  storeUrl: string | null;
  downloadLabel: string | null;
  applicationId?: string;
  bundleIdentifier?: string | null;
  notes: string;
}

export const ITC_PRODUCT = {
  name: 'ITC',
  tagline: 'Votre patrimoine. Votre intelligence.',
  legalName: 'IMMO • TEC • CONSEIL',
  backend: {
    version: process.env.APP_VERSION ?? process.env.npm_package_version ?? '0.8.0',
    apiBaseUrl: 'https://imo-backend-production-d2d1.up.railway.app/api/v1',
    apiPrefix: '/api/v1',
  },
  /** Deep link déjà utilisé par l’APK Flutter et l’API reset-password. */
  urlScheme: 'itc',
  resetPasswordHost: 'reset-password',
} as const;

/**
 * Bundle iOS proposé — aucun Info.plist Flutter n’existe dans ce repo.
 * Apple n’accepte pas `_` dans un bundle ID ; l’applicationId Android
 * `cg.immo.tec.immo_tec` n’est donc pas recopiable tel quel.
 * Statut : PROPOSÉ, non enregistré sur App Store Connect.
 */
export const PROPOSED_IOS_BUNDLE_ID = 'cg.immo.tec.immotec';

export const ANDROID_APPLICATION_ID = 'cg.immo.tec.immo_tec';

/** Copilote Expo — identité distincte, ne pas publier comme ITC store. */
export const EXPO_INTELLIGENCE_PACKAGE = 'cg.itc.intelligence';

export const PLATFORM_CATALOG: PlatformRelease[] = [
  {
    id: 'android',
    productName: 'ITC',
    displayName: 'ITC',
    version: '1.0.39',
    build: '70',
    minSupported: 'Android 7.0 (API 24)',
    status: 'sideload_only',
    released: true,
    store: 'sideload',
    storeUrl: null,
    downloadLabel: 'Télécharger',
    applicationId: ANDROID_APPLICATION_ID,
    notes:
      'APK Flutter officiel (label ITC), signature Android Debug — pas de fiche Play Store.',
  },
  {
    id: 'ios',
    productName: 'ITC',
    displayName: 'ITC',
    version: null,
    build: null,
    minSupported: null,
    status: 'not_released',
    released: false,
    store: 'none',
    storeUrl: null,
    downloadLabel: null,
    bundleIdentifier: null,
    notes:
      'Source Flutter ITC absente de ce dépôt. Aucun build iOS signé, TestFlight ni App Store.',
  },
  {
    id: 'web',
    productName: 'ITC',
    displayName: 'ITC',
    version: ITC_PRODUCT.backend.version,
    build: null,
    minSupported: 'navigateurs modernes',
    status: 'api_only',
    released: false,
    store: 'web',
    storeUrl: process.env.PUBLIC_APP_URL ?? null,
    downloadLabel: null,
    notes:
      'Ce dépôt est l’API. Aucun frontend web store n’est versionné ici. PUBLIC_APP_URL optionnel.',
  },
];

export function getPlatformCatalog() {
  return {
    product: {
      name: ITC_PRODUCT.name,
      tagline: ITC_PRODUCT.tagline,
      legalName: ITC_PRODUCT.legalName,
      apiBaseUrl: ITC_PRODUCT.backend.apiBaseUrl,
    },
    platforms: PLATFORM_CATALOG.map((p) => ({ ...p })),
    ios: {
      released: false,
      showAppStoreCta: false,
      proposedBundleIdentifier: PROPOSED_IOS_BUNDLE_ID,
      proposedBundleIdentifierStatus: 'proposed_unregistered' as const,
      blockedReason:
        'Le projet Flutter officiel (ITC-mobile, package immo_tec) n’est pas dans ce dépôt GitHub.',
    },
    android: {
      released: true,
      showPlayStoreCta: false,
      applicationId: ANDROID_APPLICATION_ID,
      version: '1.0.39',
      build: '70',
    },
    warnings: [
      'Ne pas afficher « Disponible sur l’App Store » tant que ios.released !== true.',
      `Ne pas publier le package Expo ${EXPO_INTELLIGENCE_PACKAGE} comme application ITC officielle.`,
    ],
  };
}
