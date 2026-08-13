# APPLICATION ITC EXISTANTE — analyse complète

Date: 2026-08-13  
APK: `qa-e2e/recovered/immo_tec.apk` (90.42 Mo)  
Source pull: device `1441315585023943`

## Identité confirmée (aapt + apksigner + contenu)

| Champ | Valeur |
|--------|--------|
| PACKAGE | `cg.immo.tec.immo_tec` |
| VERSION NAME | `1.0.39` |
| VERSION CODE | `70` |
| MAIN ACTIVITY | `cg.immo.tec.immo_tec/.MainActivity` |
| LABEL | `ITC` |
| APK | `qa-e2e/recovered/immo_tec.apk` |
| ARCHITECTURE | `arm64-v8a` (+ armeabi-v7a, x86_64 dans le bundle) |
| FRAMEWORK | **Flutter** (`libflutter.so` + `libapp.so` + `assets/flutter_assets/`) |
| BACKEND | `https://imo-backend-production-d2d1.up.railway.app/api/v1` |
| SIGNATURE | **Android Debug** — CN=Android Debug |
| SHA-1 | `ba133b1ec088dd2b32306cab63fa716536338292` |
| SHA-256 | `76d20d6722d049889beb61d4d55f63fdfd02b0c5555fc45a50a19f993af80f4a` |
| minSdk / targetSdk | 24 / 36 |

## ≠ APK Expo (à ne pas utiliser)

| | Existante | Expo greenfield |
|--|-----------|-----------------|
| Package | `cg.immo.tec.immo_tec` | `cg.itc.intelligence` |
| Framework | Flutter | Expo / React Native |
| Version | 1.0.39 (70) | 1.0.0 (1) |

## Projet source

**Non trouvé** dans les repos GitHub publics accessibles (`imo-backend`, `backend-api`, `loyala-ai`).  
Chercher localement un projet Flutter avec :

- `android/app/build.gradle` → `applicationId "cg.immo.tec.immo_tec"`
- `pubspec.yaml` + `lib/`
- branding `assets/branding/itc_logo.png`

## Prochaine intégration J1 (quand le projet Flutter est fourni)

1. Ouvrir **ce** projet Flutter (pas `mobile/` Expo).
2. Garder `applicationId` / signing debug ou release **inchangés**.
3. Brancher les appels IA déjà sur Railway ; activer parcours propose→confirm / capability router côté app si besoin UI.
4. Bump `versionCode` > 70 et `versionName` (ex. 1.0.40).
5. Rebuild APK → installer **par-dessus** ITC existante (même package + même signature debug).
