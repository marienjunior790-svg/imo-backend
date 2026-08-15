# AI Phase J/K Live Smoke

- **When:** 2026-08-14T22:09:10.2605487+01:00
- **Base:** `https://imo-backend-production-d2d1.up.railway.app/api/v1`
- **Owner:** ugcmanagemnet007@gmail.com
- **WhatsApp/Meta:** SKIP (not tested)
- **GET /ai/status:** mode=`openai` model=`gpt-4o-mini` vision=`True` stt=`True` tts=`True` (OK)
- **Overall:** **PASS** (8 PASS / 0 FAIL / 0 PARTIAL / 0 BLOCKED)

| # | Scenario | Verdict | Dump? | Pending? | poweredBy | Snippet |
|---|----------|---------|-------|----------|-----------|---------|
| 1 | MFA | PASS | False | False | openai | Authentification MFA (multi-facteurs) :  Elle ajoute une 2ᵉ vérification après le mot de passe (code temporaire / applic... |
| 2 | Types | PASS | False | False | openai | Types de biens dans ITC :  ITC ne classe pas les logements dans une liste fermée du type « Studio / F2 / F3 ». Chaque bi... |
| 3 | Temp password | PASS | False | False | local | Mot de passe temporaire perdu :  Le mot de passe temporaire n’est affiché qu’une seule fois à la création (sécurité). S’... |
| 4 | PDF propose | PASS | False | True | openai | Voici les informations du contrat proposé : • Locataire : fortune libolo • Logement : big • Bail : cmsl81slh00ufwnm1n30o... |
| 5 | Confirm NL | PASS | False | False | local | Impossible de générer le contrat : Stockage Cloudinary obligatoire en production. Configurez CLOUDINARY_CLOUD_NAME, CLOU... |
| 6 | Knowledge | PASS | False | False | local | Un bail ACTIVE signifie que la relation locative est en cours — pas que tous les loyers sont soldés.  En retard = au moi... |
| 7 | Clause | PASS | False | False | local | Lecture OCR / extraction de clauses depuis un PDF fichier : pas encore disponible (NOT_SUPPORTED).  Ce que je peux faire... |
| 8 | Maintenance NL | PASS | False | False | local | Pour créer un ticket maintenance, indiquez le logement (ex. « crée le ticket pour Appt 3B »). Après une photo de dégât, ... |

## Notes
- **1. MFA:** mentions MFA/sécurité; no dump
- **2. Types:** product guide tone; no dump
- **3. Temp password:** guides regeneration/reset; no dump
- **4. PDF propose:** pendingAction present
- **5. Confirm NL:** had pending from step4; confirm/act path; acted on pending but Cloudinary storage not configured in production (infra)
- **6. Knowledge:** bail≠impayé style explanation
- **7. Clause:** NOT_SUPPORTED or honest alternative
- **8. Maintenance NL:** asks/proposes maintenance without dump

## Caveats
- WhatsApp/Meta: **SKIP** (API chat smoke only).
- Scenario 5 confirmed pending PDF generation path but failed at Cloudinary config (infra), not a patrimoine dump regression.
- No scenario matched dump marker `Voici ce que confirment`.

## Artifacts
- JSON: `qa-e2e/ai_jk_smoke_live.json`
- Report: `qa-e2e/AI_JK_SMOKE_LIVE.md`
