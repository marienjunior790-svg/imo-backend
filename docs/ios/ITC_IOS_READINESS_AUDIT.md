# ITC iOS READINESS AUDIT

Date : 2026-08-15  
Dépôt inspecté : `marienjunior790-svg/imo-backend` (branche de travail)  
Règle : aucune fonctionnalité fictive. Aucune affirmation App Store.

---

## Verdict

| Chaîne cible | État |
|--------------|------|
| SOURCE Flutter officielle | **BLOCKED** — absente de ce dépôt |
| BUILD iOS | **BLOCKED** — pas de projet `ios/` Flutter |
| INSTALLATION | **BLOCKED** |
| TEST device / simulateur | **BLOCKED** |
| SIGNING Apple | **BLOCKED** — pas d’Apple Team, certificats, ni provisioning |
| DISTRIBUTION TestFlight / App Store | **BLOCKED** |
| Site « Télécharger sur l’App Store » | **READY (contrat honnête)** — CTA iOS **interdit** tant que `ios.released !== true` |

**ITC iOS n’est pas terminé.** Un dossier `ios/` Expo n’existerait pas non plus comme produit ITC officiel.

---

## 1. Framework

| Élément | Valeur | Statut |
|---------|--------|--------|
| Produit ITC officiel (APK device) | **Flutter** (`libflutter.so`, `package:immo_tec`, GoRouter) | READY (constat) |
| Ce dépôt GitHub | Backend Node/Express + Prisma | READY |
| Dossier `mobile/` | **Expo 57 / React Native 0.86** — copilote Intelligence seulement | ≠ produit ITC |
| `pubspec.yaml` | Absent | BLOCKED |

L’architecture cible demandée (une base Flutter → Android + iOS) est **la bonne**. Elle n’est pas réalisable depuis ce repo seul.

Candidat source (audit APK précédent) : `C:\Users\HP\Desktop\ITC-mobile` — **non fourni**, aucun miroir GitHub (`ITC-mobile`, `immo-tec`, etc. introuvables).

---

## 2. Projet Flutter

**BLOCKED** dans ce dépôt.

Reconstitution **identité** depuis l’APK `cg.immo.tec.immo_tec` 1.0.39 (70) — 55 fichiers Dart embarqués :

```
package:immo_tec/
  main.dart
  core/{api_client, api_exception, dashboard_stats, format_utils, home_path, router}
  core/theme/itc_theme.dart
  core/widgets/{itc_avatar, itc_widgets}
  features/auth/{splash, login, register, password_screens, auth_provider, auth_models}
  features/dashboard/{dashboard_screen, owner_shell}
  features/buildings/{buildings_screen, building_detail_screen}
  features/properties/{properties_screen, property_create_screen, property_models}
  features/tenants/{tenants_screen, tenant_onboard_flow, tenants_providers}
  features/leases/{leases_screen, leases_providers}
  features/payments/{payments_screen, payments_providers}
  features/maintenance/{maintenance_screen, maintenance_detail_screen, …}
  features/ai/{ai_screen, ai_provider, ai_models}
  features/notifications/{notifications_screen, notification_models}
  features/team/{agents_screen, agent_detail_screen, agent_provision_screen, …}
  features/agent/agent_shell.dart
  features/tenant/tenant_shell.dart
  features/portal/{portal_ui, portal_providers, portal_models}
  features/profile/profile_screen.dart
  features/settings/{settings_screen, mfa_settings_screen, sessions_screen}
  features/subscription/subscription_screen.dart
  features/reports/reports_screen.dart
  features/support/support_screen.dart
```

Plugins natifs **réellement liés** dans `libapp.so` :

`go_router`, `flutter_riverpod`, `dio`, `flutter_secure_storage`, `shared_preferences`, `image_picker`, `path_provider`, `url_launcher`, `app_links`, `share_plus`, `record`, `speech_to_text`, `flutter_tts`, `audioplayers`, `google_mlkit_text_recognition`

---

## 3. Structure Android

| | APK Flutter officiel | Expo `mobile/` |
|--|----------------------|----------------|
| applicationId | `cg.immo.tec.immo_tec` | `cg.itc.intelligence` |
| Label | **ITC** | Intelligence ITC |
| versionName / versionCode | **1.0.39 / 70** | 1.0.0 / 1 |
| minSdk / targetSdk | 24 / 36 | (prebuild gitignoré) |
| Signature | Android Debug | Debug (script APK) |
| Dossier `android/` versionné | Non (Flutter hors repo) | gitignoré |

---

## 4. Configuration iOS actuelle

| Élément | État | Statut |
|---------|------|--------|
| Projet Flutter `ios/` | Absent | BLOCKED |
| Bundle Identifier Flutter | **Aucun** dans l’APK Android | BLOCKED (à créer après source) |
| Expo `app.json` → `ios.bundleIdentifier` | `cg.itc.intelligence` | **ne pas utiliser** pour ITC store |
| Info.plist / entitlements | Absents | BLOCKED |
| Signing Team | Absent de l’environnement | BLOCKED |

---

## 5. Dépendances

### Backend (ce repo)

Express, Prisma/PostgreSQL, JWT, bcrypt, OpenAI, Cloudinary, PDFKit, Nodemailer/Resend, Sentry, WhatsApp Cloud API (optionnel), n8n (optionnel). Version npm : **0.8.0**.

### Mobile Expo (ce repo)

`expo ~57`, `expo-secure-store`, `expo-image-picker`, `expo-document-picker` (déclaré, **non utilisé** dans `App.tsx`), `expo-constants`, `expo-status-bar`.

### Flutter officiel (APK)

Voir §2. SDK Flutter exact non gravé dans l’APK ; AGP **9.0.1** + compileSdk **36** ⇒ toolchain 2026.

---

## 6. Fonctionnalités réellement implémentées

### A. App Flutter ITC (produit à porter iOS) — présentes dans le binaire

| Module | Preuve | iOS |
|--------|--------|-----|
| Authentification (login, register, mdp) | `login_screen`, `password_screens`, `register_screen` | NEEDS ADAPTATION (source) |
| Splash | `splash_screen.dart` | NEEDS ADAPTATION |
| Dashboard / owner shell | `dashboard_screen`, `owner_shell` | NEEDS ADAPTATION |
| Immeubles | `buildings_screen`, `building_detail_screen` | NEEDS ADAPTATION |
| Logements | `properties_screen`, `property_create_screen` | NEEDS ADAPTATION |
| Locataires + onboard | `tenants_screen`, `tenant_onboard_flow` | NEEDS ADAPTATION |
| Contrats / baux | `leases_screen` | NEEDS ADAPTATION |
| Paiements / loyers | `payments_screen` | NEEDS ADAPTATION |
| Agents / équipe | `agents_screen`, provision, detail | NEEDS ADAPTATION |
| Agent terrain | `agent_shell` | NEEDS ADAPTATION |
| Portail locataire | `tenant_shell`, `portal_ui` | NEEDS ADAPTATION |
| Intelligence ITC | `ai_screen` + `/ai/chat|vision|transcribe|speak` | NEEDS ADAPTATION |
| Notifications in-app | `notifications_screen` | NEEDS ADAPTATION |
| Paramètres, MFA, sessions | `settings_*` | NEEDS ADAPTATION |
| Abonnement, rapports, support, profil | fichiers dédiés | NEEDS ADAPTATION |
| Deep link reset | `itc://reset-password` (intent filter APK) | NEEDS ADAPTATION (URL Types iOS) |

**NEEDS ADAPTATION** = le module existe dans le produit Flutter ; il n’est pas portable tant que la source n’est pas dans le workspace. Ce n’est **pas** « à réécrire en Expo ».

### B. App Expo `mobile/` (ce repo) — réellement codée

Login, chat `/ai/chat`, confirm/cancel pending, photo → `/ai/vision`, logout, SecureStore.  
**Pas** de dashboard, immeubles, logements, locataires, contrats, paiements, agents, paramètres, forgot-password, refresh token, MFA, micro, TTS.

### C. Backend — réellement exposé (`/api/v1`)

Auth (login, refresh, logout, me, forgot/reset, MFA, sessions), onboarding, buildings, apartments, tenants, leases, payments, documents, dashboard, maintenance, listings, applications, AI, agents, portal, notifications, inspections, subscriptions, automation, platform admin, RBAC, features.

---

## 7. Backend / API réellement utilisé

```
https://imo-backend-production-d2d1.up.railway.app/api/v1
```

Vérifié dans : APK Flutter (`libapp.so`), `mobile/app.json` `extra.apiBaseUrl`, `mobile/src/api.ts`.  
**Aucune URL inventée.**

---

## 8. Variables d’environnement

Voir `.env.example`. Secrets IA (`OPENAI_API_KEY`) **backend uniquement**.  
Mobile : URL API dans `app.json` / client Dio Flutter — pas de secret OpenAI.

Auth lockout : `AUTH_LOCKOUT_THRESHOLD=5`, `AUTH_LOCKOUT_MINUTES=15`.  
Reset mdp : `PASSWORD_RESET_TTL_HOURS=1`. JWT access 15m / refresh 7d.

---

## 9. Assets et branding

| Source | Branding |
|--------|----------|
| APK Flutter `assets/branding/itc_logo.png` | Bleu nuit, or, « ITC » / « IMMO • TEC • CONSEIL » — **identité officielle** |
| Reset-password HTML API | `#152238` (bleu nuit) |
| Expo splash / UI | Vert `#0B3D2E` + logo chevron — **autre produit visuel** |

Logo officiel recopié : `docs/ios/branding/itc_logo.png`.

---

## 10–13. Versions et identifiants

| Plateforme | Version | Build | Identifiant | Statut |
|------------|---------|-------|-------------|--------|
| Android ITC | 1.0.39 | 70 | `cg.immo.tec.immo_tec` | READY (sideload debug) |
| iOS ITC | — | — | **aucun enregistré** | BLOCKED |
| iOS bundle **proposé** | — | — | `cg.immo.tec.immotec` | proposed, **non** App Store Connect |
| Expo Intelligence | 1.0.0 | 1 | `cg.itc.intelligence` | ≠ ITC store |
| API / Web | 0.8.0 | — | — | api_only |

Apple **interdit** `_` dans un bundle ID : on ne copie pas `cg.immo.tec.immo_tec` tel quel.  
Si `ITC-mobile/ios` contient déjà un ID, **il prime** sur la proposition.

---

## 14. URLs

| Usage | URL |
|-------|-----|
| API prod | `https://imo-backend-production-d2d1.up.railway.app/api/v1` |
| Health | `GET /api/v1/health` |
| Catalogue stores | `GET /api/v1/public/platforms` |
| Reset HTTPS → app | `{PUBLIC_API_URL}/reset-password?token=` → `itc://reset-password?token=` |
| Web fallback | `PUBLIC_APP_URL` (défaut doc `https://app.itc.cg`, non vérifié ici) |
| WhatsApp | `https://wa.me/242…` (plugin / tools) |

---

## 15. Authentification

Même backend Android / iOS / Web : `POST /auth/login` `{ identifier, password }`, JWT Bearer, refresh, lockout, MFA optionnel, `homePath` par rôle.

| Capacité | Flutter APK | Expo repo | iOS officiel |
|----------|-------------|-----------|--------------|
| Login identifier | READY | READY | BLOCKED (source) |
| Session persistante (secure storage) | `flutter_secure_storage` | `expo-secure-store` | NEEDS ADAPTATION Keychain |
| Refresh token | probable (`api_client` + dio) | **NOT IMPLEMENTED** | NEEDS ADAPTATION |
| Logout API | backend READY | clear local only | NEEDS ADAPTATION |
| Forgot / reset + `itc://` | APK intent + API | **NOT IMPLEMENTED** | NEEDS ADAPTATION (Associated Domains) |
| MFA UI | `mfa_settings_screen` | message « prochaine version » | NEEDS ADAPTATION |
| Compte verrouillé | API  lockout | erreurs génériques | READY côté API |
| Rôles / home | `home_path.dart` = API | chat unique tous rôles | NEEDS ADAPTATION |

---

## 16. Stockage local

Flutter : `flutter_secure_storage` (tokens), `shared_preferences`, `path_provider`.  
Expo : SecureStore `itc_access_token` / `itc_refresh_token`.  
iOS : Keychain via le plugin Flutter existant — **NEEDS ADAPTATION** (entitlements Keychain Sharing si custom).

---

## 17. Notifications

API : `GET/PATCH /notifications`, notification-center.  
Flutter : écran in-app.  
Push FCM/APNs : **pas** de `firebase_messaging` dans les packages Dart extraits.  
`POST_NOTIFICATIONS` apparaît dans le DEX (libs Google) mais **pas** dans `uses-permission` de l’APK.

| Push APNs | NOT IMPLEMENTED (produit actuel) |
| In-app | READY backend + Flutter ; BLOCKED iOS sans source |

Ne pas ajouter de permission Push iOS tant que le code Flutter ne l’utilise pas.

---

## 18–19. Permissions natives (APK `uses-permission` réel)

| Permission Android | Usage produit | iOS Info.plist | Statut |
|--------------------|---------------|----------------|--------|
| INTERNET / NETWORK_STATE | API | (implicite) | READY |
| RECORD_AUDIO | dictée Intelligence (`record`, `speech_to_text`) | `NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription` | NEEDS ADAPTATION |
| READ_MEDIA_IMAGES / READ_EXTERNAL_STORAGE | photos / OCR (`image_picker`, ML Kit) | `NSPhotoLibraryUsageDescription` | NEEDS ADAPTATION |
| CAMERA | **non déclarée** dans l’APK (picker galerie) | n’ajouter `NSCameraUsageDescription` **que si** le source Flutter ouvre la caméra | NOT IMPLEMENTED (APK) |
| Localisation | strings DEX, **pas** uses-permission APK | ne pas demander | NOT IMPLEMENTED |
| Bluetooth | strings DEX, **pas** uses-permission | ne pas demander | NOT IMPLEMENTED |
| Contacts | absent | ne pas demander | NOT IMPLEMENTED |

---

## 20. Adaptations iOS spécifiques (quand la source Flutter sera là)

| Sujet | Statut |
|-------|--------|
| Safe Area / Dynamic Island / encoche | NEEDS ADAPTATION (`SafeArea` / Cupertino déjà partiellement via `cupertino_icons`) |
| Clavier / `viewInsets` | NEEDS ADAPTATION |
| Navigation retour système / swipe back | NEEDS ADAPTATION (GoRouter + CupertinoPage) |
| Keychain | NEEDS ADAPTATION |
| Photo library limited access iOS 14+ | NEEDS ADAPTATION |
| Micro + Speech (permission 2 étapes Apple) | NEEDS ADAPTATION |
| URL scheme `itc` | NEEDS ADAPTATION (`CFBundleURLTypes`) |
| Universal Links / AASA | BLOCKED (Apple Team ID inconnu) |
| Orientation portrait (Android Expo portrait ; Flutter à confirmer) | NEEDS ADAPTATION |
| iPad (`supportsTablet` Expo true ; Flutter à confirmer) | NEEDS ADAPTATION |
| Signing / provisioning | BLOCKED |
| ML Kit iOS | NEEDS ADAPTATION (min iOS ML Kit, pods) |
| `google_mlkit` + `record` + `speech_to_text` | min iOS à caler sur les plugins **réels** du `pubspec` |

---

## Matrice synthétique

| Item | READY | NEEDS ADAPTATION | BLOCKED | NOT IMPLEMENTED |
|------|:-----:|:----------------:|:-------:|:---------------:|
| Identité produit ITC (label, logo, API) | ✓ | | | |
| Backend unique Android/iOS/Web | ✓ | | | |
| Catalogue site honnête (`/public/platforms`) | ✓ | | | |
| Source Flutter dans Git | | | ✓ | |
| Projet Xcode / `ios/` Flutter | | | ✓ | |
| Bundle ID enregistré Apple | | | ✓ | |
| Build + install iOS | | | ✓ | |
| Signing / TestFlight / App Store | | | ✓ | |
| Modules CRM Flutter → iOS | | ✓ (après source) | | |
| Push APNs | | | | ✓ |
| Caméra (APK) | | | | ✓ (galerie seulement) |
| Play Store | | | | ✓ (APK debug) |
| CTA App Store sur le site | | | | ✓ (volontaire) |
| Expo comme ITC officiel | | | | **interdit** |

---

## Décision d’architecture (Étape 2)

```
ITC Flutter (ITC-mobile)     ← SOURCE MANQUANTE
        │
        ├── Android  cg.immo.tec.immo_tec  1.0.39 (70)   sideload
        └── iOS      cg.immo.tec.immotec   (proposé)     NON BUILDABLE ICI

ITC API  imo-backend  0.8.0   ← ce dépôt
Expo mobile/  cg.itc.intelligence  ← copilote, PAS le store ITC
```

**Ne pas** créer une deuxième application Expo « ITC iOS » avec dashboard inventé.  
**Ne pas** prétendre qu’un `expo prebuild --platform ios` = version iOS officielle.
