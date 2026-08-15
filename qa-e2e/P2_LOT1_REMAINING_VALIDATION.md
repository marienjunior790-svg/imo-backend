# P2 LOT 1 RESTANT — Validation (sans fix) — P2-002 EXCLU

**Date:** 2026-08-11  
**Règles:** aucun fix · aucun commit · aucun deploy · aucun redesign

| ID | Résultat | Preuve | Régression |
|----|----------|--------|------------|
| P2-001 | **FAIL** | Prod `GET /portal/dashboard` → `outstandingAmount=0` `lateCount=0` alors que `GET /portal/payments` a `PENDING:1000` (même id que `nextPayment`). Patch local `portal.service.ts` **non commit / non déployé**. UI tenant lit `outstandingAmount` (`tenant_shell`). | Non (pré-fix) |
| P2-013 | **FAIL** | Notifs OWNER live `p2l1_owner_notifs` : résumé **0 Encaissé / 0 Impayés** alors que dashboard UI+API `collectedThisMonth=370000`. Source mobile `ItcDashboardStats` **non rebuildé** dans APK. | Non |
| P2-003 | **FAIL** | Attendu `1.0.38+69`. Settings dump historique `p2c_o_set3` : **Version 1.0.29+54** / `ITC 1.0.29+54`. `AppConstants` source corrigé mais APK non reconstruit (`versionName=1.0.38` package ≠ About string). | Non |
| P2-014 | **FAIL** | Contrats dumps `p2c_o_leases` / `owner_leases` : `fin 2027-08-09T00:00:00.000Z` (ISO). Source `itcFmtDate` local non rebuildé. | Non |
| P2-016 | **PARTIAL** | API nested `tenants.total=3` `leases.active=2`. Dumps Rapports antérieurs : `Locataires: 3` `Contrats: 2` (OK final). Correctif flash/parser dans source mobile **non rebuildé** → flash 0 non revalidé sur binaire actuel. | Non |

**P2 LOT 1 RESTANT = FAIL**
