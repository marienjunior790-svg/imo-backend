/**
 * ITC Mobile — versions configurables.
 * Branchez ici l’APK réel (chemin public ou URL) sans toucher au reste du site.
 * iOS : available false jusqu’à l’App Store / TestFlight.
 */
export const RELEASES = {
  android: {
    label: 'Android',
    version: '1.0.0',
    build: '1',
    versionCode: 1,
    packageId: 'cg.itc.intelligence',
    size: '—',
    date: '2026-08',
    compatibility: 'Android 8+',
    downloadUrl: '',
    available: false,
    note: 'L’APK se publie ici dès qu’un artefact de release est déposé.',
  },
  ios: {
    label: 'iOS',
    version: '—',
    build: '—',
    downloadUrl: '',
    available: false,
    compatibility: 'iPhone & iPad',
    note: 'Disponible prochainement.',
  },
} as const;

export type ReleasePlatform = keyof typeof RELEASES;
