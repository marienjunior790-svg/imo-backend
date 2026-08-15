# ITC iOS

Préparation de la version iOS **officielle** (même produit Flutter qu’Android).

| Doc | Contenu |
|-----|---------|
| [ITC_IOS_READINESS_AUDIT.md](./ITC_IOS_READINESS_AUDIT.md) | Audit READY / NEEDS ADAPTATION / BLOCKED / NOT IMPLEMENTED |
| [LIVRABLE.md](./LIVRABLE.md) | Réponses aux 14 points du livrable |
| [VERSIONING.md](./VERSIONING.md) | Versions Android / iOS / Web séparées |
| [APPLE_DISTRIBUTION.md](./APPLE_DISTRIBUTION.md) | Build, TestFlight, App Store — prérequis manquants |
| [SITE_INTEGRATION.md](./SITE_INTEGRATION.md) | CTA site selon `/api/v1/public/platforms` |
| [E2E_CHECKLIST.md](./E2E_CHECKLIST.md) | Parcours iOS (BLOCKED sans binaire) |
| [FLUTTER_IOS_HANDOFF.md](./FLUTTER_IOS_HANDOFF.md) | Que faire quand `ITC-mobile` est fourni |
| [templates/Info.plist.permissions.xml](./templates/Info.plist.permissions.xml) | Permissions iOS alignées sur l’APK |
| [branding/itc_logo.png](./branding/itc_logo.png) | Icône officielle extraite de l’APK 1.0.39 |

**iOS n’est pas publié.** `GET /api/v1/public/platforms` → `ios.released: false`.
