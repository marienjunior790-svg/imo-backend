# P2 LOT 1 RESTANT — Finalisation status

**Date:** 2026-08-11

## Backend P2-001
- Commit: `29f7971` — `fix(p2): include PENDING in tenant portal outstanding Impayés`
- Railway fortunate-beauty: **SUCCESS** (runtime commit = `29f7971`)
- Preuve antérieure post-deploy: `outstandingAmount=1000` = PENDING sum (match)
- État data actuel: les 2 paiements TENANT sont **PAID** → `outstandingAmount=0` cohérent (plus de PENDING)

## Mobile P2-013/003/014/016
- Commits: `fb78316` (fixes UI) + `912910c` (test) + `84b9a73` (dedupe itcFmtDate)
- APK release built & installed: `app-release.apk` 90.3MB — `versionName=1.0.38` `versionCode=69`
- Build fix: conflit `itcFmtDate` résolu (export unique via `format_utils`)

## UI phone revalidation
- **Bloquée** : `adb devices` vide (téléphone déconnecté)
- À faire dès reconnexion USB : About `1.0.38+69`, Contrats dates FR, Rapports volumes, Notifs résumé ≠ 0, TENANT Impayés aligné API
