# Handoff — brancher le vrai projet Flutter ITC

Dès que `ITC-mobile` (package Dart `immo_tec`, `applicationId cg.immo.tec.immo_tec`) est disponible dans le workspace :

## 0. Vérifications d’identité (obligatoires)

```bash
grep applicationId android/app/build.gradle*
grep CFBundleIdentifier ios/Runner.xcodeproj/project.pbxproj ios/Runner/Info.plist
grep version pubspec.yaml
```

Attendu Android : `cg.immo.tec.immo_tec`, version proche de `1.0.39` / `70`.  
Si iOS a déjà un bundle ID : **ne pas le remplacer** par `cg.immo.tec.immotec`.

## 1. iOS — générer / compléter le dossier natif

```bash
flutter create --platforms=ios .     # seulement si ios/ absent
# sinon : garder ios/ existant
```

Appliquer `docs/ios/templates/Info.plist.permissions.xml` (permissions **réellement** utilisées).  
Display name : `ITC`.  
URL Types : scheme `itc`, host reset-password (plugin `app_links`).

## 2. Ne pas toucher

- Backend URL production
- Contrats API
- Rôles / homePath
- Intelligence ITC (mêmes routes `/ai/*`)
- applicationId Android
- Logo `assets/branding/itc_logo.png` (copie : `docs/ios/branding/itc_logo.png`)

## 3. Adaptations Cupertino / safe area

Travailler **dans** `package:immo_tec` (thème `itc_theme.dart`, shells owner/agent/tenant).  
Pas de fork Expo.

## 4. Catalogue store

Après le **premier** IPA signé visible dans App Store Connect :

- Mettre à jour `src/modules/public/platform-catalog.ts`
- Déployer l’API
- Le site lit `/public/platforms`

## 5. Tests min. (sur Mac)

Login, dashboard, immeubles, logements, locataires, contrats, paiements, agents, Intelligence (chat + photo + micro), notifications in-app, paramètres, logout, `itc://reset-password`, clavier, safe area iPhone compact + Pro Max.
