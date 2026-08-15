# Intelligence ITC — copilote Expo (≠ app ITC officielle)

> **Ce dossier n’est pas l’application ITC store.**  
> L’ITC officielle est **Flutter**, package Android `cg.immo.tec.immo_tec`, label **ITC**, version **1.0.39** (70).  
> Source attendue : projet `ITC-mobile` (`package:immo_tec`) — absent de `imo-backend`.  
> Ne pas publier `cg.itc.intelligence` sur l’App Store comme « ITC ».

APK debug Expo : `dist/Intelligence-ITC-debug.apk`  
API : `https://imo-backend-production-d2d1.up.railway.app/api/v1`

## Installer sur téléphone (Android, copilote)

1. Copiez `Intelligence-ITC-debug.apk` sur le téléphone (Drive, WhatsApp, câble).
2. Android → autoriser **sources inconnues** pour le fichier / le navigateur.
3. Ouvrir l’APK → Installer.
4. Connexion avec votre compte org ITC (email / login + mot de passe).

## Fonctions (Expo)

- Chat copilote (`POST /ai/chat`)
- Confirmer / annuler actions pending (PDF, ticket, WhatsApp, assignation…)
- Envoi photo → vision / ticket maintenance (`POST /ai/vision`)

Pas de dashboard, immeubles, locataires, contrats, paiements, agents.

## Rebuild local (Android copilote)

```bash
cd mobile
npm ci
npx expo prebuild --platform android
# ANDROID_HOME configuré
cd android && ./gradlew assembleDebug
# APK → android/app/build/outputs/apk/debug/app-debug.apk
```

Package id : `cg.itc.intelligence` (build debug — pas Play Store, pas App Store ITC).

## iOS

`expo run:ios` produirait une **autre** app (`cg.itc.intelligence`).  
La version iOS officielle se construit depuis le Flutter ITC, voir `docs/ios/`.
