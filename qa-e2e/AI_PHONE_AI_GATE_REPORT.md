# ITC Phone AI Gate — TECNO KM5

**Date:** 2026-08-13 ~03:33 (+01)  
**APK:** `1.0.38` / versionCode `69` (`cg.immo.tec.immo_tec`)  
**API:** `https://imo-backend-production-d2d1.up.railway.app/api/v1`  
**Device:** TECNO KM5 · Android 15 · `1441315585023943`  
**Account:** OWNER Bertrand (`appartement 69`)  

## Verdict: **PARTIAL**

Install + Railway live data + IA connectée + multi-step agent are proven on device.  
Full chip/text automation is brittle (AZERTY keyboard + incomplete TalkBack text on chat bubbles), so several scenarios are PARTIAL pending a short manual pass.

## Results

| Id | Status | Evidence |
|----|--------|----------|
| Install APK | **PASS** | `adb install` Success · `versionName=1.0.38` `versionCode=69` |
| API Railway | **PASS** | Dashboard: **371 000 XAF** encaissé · **33 %** occupation · **0** impayés |
| IA connectée | **PASS** | Badge vert on Intelligence ITC |
| Mémoire | **PARTIAL** | Reply fragment showed `GATE-BLUE-42` after remember; recall not fully captured in a11y tree |
| Référents mois dernier | **PARTIAL** | Follow-up sent; reply text not fully exposed to uiautomator |
| Multi-step agent | **PASS** | « Terminé · 0 locataire(s) avec impayés · 0 relance(s) préparée(s) » |
| Analyse patrimoine | **PARTIAL** | AI replied (tool-field dump visible — UX smell, not silent failure) |
| Documents | **PARTIAL** | Actions (immeubles / paiements / rapports) returned; body text weak in a11y |
| Automatisations | **PARTIAL** | « Voir les impayés » CTA; no fake « envoyé » observed |
| Permissions phone | **NOT RUN** | AGENT refus already proven via API in production gate |

## Artifacts

- `qa-e2e/phone_ai_gate.json`
- `qa-e2e/phone_ai_dash.png` / `phone_ai_chat.png` / `phone_ai_mem_sent.png`
- `qa-e2e/phone_ai_home.png` (OWNER dashboard)
- APK: `ITC-mobile\build\app\outputs\flutter-apk\app-release.apk`

## Manual 3-minute checklist (to close PARTIALs)

On TECNO, tab **IA**, then:

1. « Retiens que ma couleur préférée est bleu » → « Quelles sont mes préférences ? »  
2. « Mes impayés » puis « et ceux du mois dernier »  
3. « Résumé du patrimoine »  
4. « Liste les documents analysables »  
5. « Automatise les relances impayés » — vérifier proposition / pas d’envoi fantôme  

## UX notes (fix later — not backend)

- Login + chat composer fight the AZERTY keyboard (fields shift; BACK can exit app).  
- Chat reply text often missing from accessibility `content-desc` → hard to automate.  
- One analytics reply showed raw tool field names (UX polish).
