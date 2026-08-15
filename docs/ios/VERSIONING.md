# Versioning ITC — Android / iOS / Web

Les versions **ne se fusionnent pas**. Chaque surface a son triplet.

| Surface | Identifiant | Version marketing | Build | Min. supporté | Canal |
|---------|-------------|-------------------|-------|---------------|--------|
| **ITC Android** | `cg.immo.tec.immo_tec` | `1.0.39` | `70` (`versionCode`) | API 24 | Sideload debug — pas Play Store |
| **ITC iOS** | `cg.immo.tec.immotec` (proposé, non enregistré) | *aucune* | *aucun* | *à caler sur pubspec* | Non publié |
| **ITC Web / API** | `immo-tec-backend` | `0.8.0` | git SHA / Railway | Node 20 | API |
| Expo Intelligence | `cg.itc.intelligence` | `1.0.0` | `1` | — | **Hors store ITC** |

## Règles

1. Un bump Android (`versionCode` > 70) n’incrémente pas iOS.
2. Le premier IPA réel : `CFBundleShortVersionString` = version produit iOS **propre** (ex. `1.0.0` iOS, même si Android est `1.0.39`) **ou** alignement marketing volontaire documenté dans les notes de version iOS — jamais un silencieux « 1.0.39 iOS » sans binaire.
3. `CFBundleVersion` iOS commence à `1` au premier archive TestFlight.
4. Les notes de version App Store ≠ notes Play ≠ changelog API.
5. Source de vérité runtime : `GET /api/v1/public/platforms`.

## Quand iOS existera vraiment

Mettre à jour `src/modules/public/platform-catalog.ts` **après** :

1. Archive Xcode signée
2. Build visible dans App Store Connect / TestFlight
3. (Store) statut Ready for Sale **ou** au minimum lien TestFlight public décidé produit

Avant cela : `ios.released = false`, `storeUrl = null`.
