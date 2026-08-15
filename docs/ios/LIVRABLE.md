# Livrable — ITC iOS (2026-08-15)

Critère réel : SOURCE → BUILD → INSTALLATION → TEST → SIGNING → DISTRIBUTION.

**Aucune de ces étapes iOS n’est franchie dans cet environnement.**  
Ce livrable prépare l’identité, le contrat site, et le handoff vers le vrai Flutter.

## 1. Architecture iOS créée

Aucune. Le produit officiel est Flutter `package:immo_tec`.  
Ce dépôt = API + copilote Expo. Pas de `ios/` Flutter.

Voir `docs/ios/ITC_IOS_READINESS_AUDIT.md`.

## 2. Bundle Identifier

- Android officiel : `cg.immo.tec.immo_tec`
- iOS existant Flutter : **aucun** (APK Android seulement)
- Proposition (non enregistrée Apple) : `cg.immo.tec.immotec`  
  (Apple refuse `_` ; ne pas inventer `cg.itc.intelligence` pour le store ITC)
- Expo : `cg.itc.intelligence` — **autre application**

## 3. Version iOS

**Aucune.** Ne pas afficher 1.0.0 / 1.0.39 iOS.

## 4. Build number iOS

**Aucun.** Le premier archive devra commencer à `1`.

## 5. Fonctionnalités compatibles (backend déjà commun)

Auth JWT, dashboard API, immeubles, logements, locataires, contrats, paiements, agents, Intelligence ITC (`/ai/*`), notifications in-app, paramètres/MFA/sessions — **côté serveur**.

## 6. Fonctionnalités nécessitant adaptation iOS

Tout l’UI Flutter (safe area, clavier, Keychain, photos, micro/speech, URL scheme `itc`, ML Kit iOS, GoRouter swipe-back).  
Liste : audit §20 + handoff.

## 7. Fonctionnalités bloquées

Build/install/test/sign/distribute iOS.  
Source `C:\Users\HP\Desktop\ITC-mobile` hors GitHub.

## 8–9. Tests

Voir `docs/ios/E2E_CHECKLIST.md`.  
Parcours device : **BLOCKED**.  
Tests ajoutés ici : catalogue `ios.released === false`.

## 10. Configuration Apple restante

Team ID, certificats, App ID, provisioning, Xcode, Privacy Manifest, fiche App Store Connect.  
Détail : `docs/ios/APPLE_DISTRIBUTION.md`.

## 11. Procédure de build iOS

`docs/ios/APPLE_DISTRIBUTION.md` + `docs/ios/FLUTTER_IOS_HANDOFF.md`  
Exécutable **uniquement** sur Mac avec le repo Flutter.

## 12. Procédure TestFlight

Idem — non exécutable ici.

## 13. Procédure App Store

Idem — non exécutable ici.  
Le site ne doit **pas** montrer l’App Store avant `ios.released`.

## 14. Modification site ITC

Consommer `GET /api/v1/public/platforms`.  
Contrat : `docs/ios/SITE_INTEGRATION.md`.

CTA iOS actuel : **aucun**.
