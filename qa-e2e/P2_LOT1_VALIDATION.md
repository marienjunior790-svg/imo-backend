# P2 LOT 1 — Validation post-correction

**Date:** 2026-08-11  
**Règles respectées:** aucun nouveau fix · aucun redesign · aucun commit · aucun deploy · mutations évitées  

**Contexte runtime critique**
- Code lot 1 présent en local (`ITC` + `ITC-mobile`).
- **Backend prod Railway : non redéployé** → P2-001 / P2-002 behavior API encore ancien.
- **APK device `1.0.38` (versionCode 69)** : binaire installé **antérieur** aux changements Flutter du lot 1 (About / dates / résumé / rapports volumes) → UI phone ne reflète pas encore le source.

---

## Par ID

### P2-001 — Impayés locataire
| | |
|--|--|
| **Résultat** | **FAIL** (runtime) / code local OK |
| **Preuve** | `GET /portal/payments` : `PENDING:1000` ; `GET /portal/dashboard` : `outstandingAmount=0` `lateCount=0` → `MISMATCH_OR_UNDEPLOYED`. Source local aligne bien PENDING+PARTIAL+LATE (`portal.service.ts`). |
| **Régression** | Non (état pré-fix encore en prod). |

### P2-002 / P2-018 — Notifications maintenance
| | |
|--|--|
| **Résultat** | **FAIL** (runtime) / code local OK |
| **Preuve** | Tickets portal `GATE-MAINT-001` + `plomberie` = **CLOSED**. Notifs TENANT encore `MAINTENANCE_COMPLETED` titre « confirmez la résolution », `data.status=COMPLETED`, **0** notif SYSTEM clôture. Source : `resolveCompletedMaintenanceNotifs` + notify SYSTEM dans `close()` — non actif en prod. *Note:* même après deploy, tickets déjà clos ne seront pas nettoyés sans re-clôture / backfill. |
| **Régression** | Non. |

### P2-013 — Résumé parc
| | |
|--|--|
| **Résultat** | **PARTIAL** |
| **Preuve** | API `GET /dashboard/stats` nested : `payments.collectedThisMonth=370000`, flat `paidThisMonth` absent. Simulateur new parser → 370000 ; old parser → 0. Source mobile utilise `ItcDashboardStats.fromJson`. **Phone non validable** sans rebuild APK. |
| **Régression** | Aucune détectée. |

### P2-003 — Version About
| | |
|--|--|
| **Résultat** | **PARTIAL** |
| **Preuve** | Source `AppConstants.appVersion = '1.0.38+69'`. Package installé `versionName=1.0.38` / `versionCode=69`, mais About UI historique montrait encore `1.0.29+54` tant que l’APK n’embarque pas le source patché. |
| **Régression** | Non. |

### P2-014 — Dates contrats
| | |
|--|--|
| **Résultat** | **PARTIAL** |
| **Preuve** | Source `leases_screen.dart` utilise `itcFmtDate(l['endDate'])` + helper `format_utils.dart`. Pas de rebuild phone → liste OWNER encore ISO possible sur binaire actuel. |
| **Régression** | Non. |

### P2-016 — Rapports volumes
| | |
|--|--|
| **Résultat** | **PARTIAL** |
| **Preuve** | Source `reports_screen.dart` : `s.tenantsTotal` / `s.leasesActive` (stats dashboard). Stats API : tenants=3, leases.active=2. Phone sans rebuild non re-vérifié. |
| **Régression** | Non. |

---

## Verdict global

# **P2 LOT 1 = FAIL**

Cause dominante : **corrections locales non déployées / APK non reconstruit** — la validation runtime prod+device échoue encore sur P2-001 et P2-002 ; les fix UI Flutter restent PARTIAL.

**Prochaine étape (hors scope de ce STOP) :** deploy backend Railway + rebuild/install APK, puis rejouer cette checklist. Optionnel : backfill notifs COMPLETED pour tickets déjà CLOSED.

---

## STOP
