# Intelligence ITC — App Android

APK debug : `dist/Intelligence-ITC-debug.apk`  
API : `https://imo-backend-production-d2d1.up.railway.app/api/v1`

## Installer sur téléphone

1. Copiez `Intelligence-ITC-debug.apk` sur le téléphone (Drive, WhatsApp, câble).
2. Android → autoriser **sources inconnues** pour le fichier / le navigateur.
3. Ouvrir l’APK → Installer.
4. Connexion avec votre compte org ITC (email / login + mot de passe).

## Fonctions

- Chat copilote (`POST /ai/chat`)
- Confirmer / annuler actions pending (PDF, ticket, WhatsApp, assignation…)
- Envoi photo → vision / ticket maintenance (`POST /ai/vision`)

## Rebuild local

```bash
cd mobile
npm ci
npx expo prebuild --platform android
# ANDROID_HOME configuré
cd android && ./gradlew assembleDebug
# APK → android/app/build/outputs/apk/debug/app-debug.apk
```

Package id : `cg.itc.intelligence` (build debug, signature debug — pas Play Store).
