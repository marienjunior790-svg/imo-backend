# Checklist E2E iOS — ITC

Exécution : **2026-08-15**  
Environnement : agent Linux, **sans** Xcode / simulateur / device iOS / Apple credentials.

Légende : **PASS** / **FAIL** / **BLOCKED**

| # | Parcours | Résultat | Preuve |
|---|----------|----------|--------|
| 1 | Installation IPA / TestFlight | **BLOCKED** | Pas de projet Flutter `ios/`, pas de signing |
| 2 | Premier lancement | **BLOCKED** | Idem |
| 3 | Login même backend | **BLOCKED** (app) / API **READY** | `POST /auth/login` existant ; UI Flutter hors repo |
| 4 | Dashboard | **BLOCKED** | Écran dans APK (`dashboard_screen.dart`), pas de source |
| 5 | Immeubles | **BLOCKED** | `buildings_screen.dart` dans APK |
| 6 | Logements | **BLOCKED** | `properties_screen.dart` |
| 7 | Locataires | **BLOCKED** | `tenants_screen.dart` |
| 8 | Contrats | **BLOCKED** | `leases_screen.dart` |
| 9 | Paiements | **BLOCKED** | `payments_screen.dart` |
| 10 | Agents | **BLOCKED** | `agents_screen.dart` |
| 11 | Intelligence ITC | **BLOCKED** (app iOS) / API **READY** | `/ai/chat`, `/ai/vision`, `/ai/transcribe`, pending confirm |
| 12 | Notifications | **BLOCKED** | In-app Flutter ; pas de push APNs |
| 13 | Paramètres | **BLOCKED** | `settings_screen.dart` |
| 14 | Logout | **BLOCKED** | |
| 15 | Re-login | **BLOCKED** | |
| 16 | Réseau (offline / timeout) | **BLOCKED** | |
| 17 | Rotation | **BLOCKED** | |
| 18 | Clavier | **BLOCKED** | |
| 19 | Safe Areas / Dynamic Island | **BLOCKED** | |
| 20 | Navigation / retour iOS | **BLOCKED** | |

## Contrôles non-UI effectués ici

| Contrôle | Résultat | Preuve |
|----------|----------|--------|
| Audit APK Flutter identité | **PASS** | `cg.immo.tec.immo_tec` 1.0.39 (70), label ITC |
| URL API unique | **PASS** | Railway `/api/v1` dans APK + Expo + backend |
| Expo ≠ ITC officiel | **PASS** | packages distincts |
| Catalogue site n’active pas l’App Store | **PASS** | tests `platform-catalog` + `GET /public/platforms` |
| Build iOS | **BLOCKED** | pas de source Flutter |

Aucun PASS d’installation iOS n’est revendiqué.
