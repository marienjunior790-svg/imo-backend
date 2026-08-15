# Distribution Apple — ITC iOS

Environnement actuel (cloud agent Linux) : **pas de Xcode, pas d’Apple Team, pas de certificats**.  
Rien ci-dessous n’est « publié ».

## Identité à confirmer dans `ITC-mobile` (source Flutter)

| Champ | Valeur | Statut |
|-------|--------|--------|
| Display Name | `ITC` | Confirmé (label APK) |
| Bundle ID proposé | `cg.immo.tec.immotec` | **PROPOSÉ** — si `ios/Runner.xcodeproj` a déjà un ID, le garder |
| Version | à définir au 1er archive | non publiée |
| Build | `1` au premier TestFlight | — |
| Icon | `docs/ios/branding/itc_logo.png` (extrait APK) | READY asset |
| URL scheme | `itc` / host `reset-password` | Confirmé APK |
| Orientation | portrait (à confirmer dans le projet Flutter) | — |
| iPad | à confirmer (`ios.supportsTablet` Expo ≠ Flutter) | — |
| Min iOS | **celui des plugins du pubspec** (ML Kit / speech souvent ≥ 13 ou 15) | à mesurer sur source |

## Manquant pour signer

1. Compte Apple Developer (payant) — Team ID
2. Certificat Apple Distribution (ou Automatic signing Xcode)
3. App ID `cg.immo.tec.immotec` (ou l’ID déjà dans le projet) créé dans le developer portal
4. Profil provisioning App Store / Ad Hoc
5. Mac + Xcode (version compatible Flutter)
6. `ios/Runner.xcodeproj` généré depuis **le** projet Flutter officiel
7. Privacy Nutrition Labels + Privacy Manifest (`PrivacyInfo.xcprivacy`) selon plugins
8. Compte App Store Connect + app créée (sku, catégorie, âge)

## Procédure build iOS (quand la source Flutter est dans le workspace)

```bash
# Sur macOS, dans ITC-mobile (PAS dans imo-backend/mobile Expo)
flutter --version
flutter pub get
flutter doctor -v          # Xcode, CocoaPods, signing
cd ios && pod install && cd ..
flutter build ios --release --no-codesign   # compile seulement
# Archive signée :
flutter build ipa --release \
  --export-options-plist=ios/exportOptions.plist
```

Vérifications : `flutter analyze`, `flutter test`, install simulateur `flutter run -d iPhone`, puis device.

## Procédure TestFlight

1. Xcode → Product → Archive (ou `flutter build ipa`)
2. Organizer → Distribute App → App Store Connect → Upload
3. App Store Connect → TestFlight → build processed
4. Internal testers (App Store Connect users) puis External (Beta Review si besoin)
5. **Ne pas** mettre `ios.released=true` pour un build TestFlight interne seulement, sauf décision produit explicite

## Procédure App Store

1. Fiche app : nom **ITC**, sous-titre, description FR, keywords, support URL, privacy URL
2. Screenshots **réels** iPhone 6.7" / 6.1" (et iPad si `UIDeviceFamily` 2) — pas de maquettes Expo
3. Privacy : photos, micro, speech — uniquement si les usages Info.plist sont vrais
4. Submit for Review
5. Après **Ready for Sale** : renseigner `storeUrl` + `released: true` dans `platform-catalog.ts`

## Associated Domains (plus tard)

Fichier `apple-app-site-association` sur le domaine API / `PUBLIC_APP_URL` :

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.cg.immo.tec.immotec",
        "paths": ["/reset-password"]
      }
    ]
  }
}
```

`TEAMID` est inconnu ici → **ne pas servir** un AASA inventé en production.
