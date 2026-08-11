# Rapport — Canal WhatsApp Business × Intelligence ITC

Date: 2026-08-11

## Verdict

**Implémentation code : DONE.**  
**E2E réel Meta : BLOCKED** jusqu’à (1) déploiement + migration Railway, (2) credentials Meta Cloud API, (3) numéro de test contrôlé + template si hors fenêtre 24h.

Aucun faux PASS : sans `providerMessageId` Meta, le scénario reste BLOCKED/FAIL.

## Provider choisi

**Meta WhatsApp Cloud API** (Graph `/{version}/{PHONE_NUMBER_ID}/messages`), pattern Resend-like (`fetch` + env).  
Pas de Twilio, pas de wa.me, pas d’automation WhatsApp Web.

## Architecture

```
Utilisateur
  → Intelligence ITC (intent / tool)
  → proposeSendWhatsAppMessage
  → pendingAction SEND_WHATSAPP_MESSAGE
  → [Confirmer]
  → NotificationCenterService.sendWhatsAppMessage
  → MessagingService.sendWhatsAppText
  → WhatsApp Cloud provider (Meta)
  → providerMessageId
  → Message (channel=WHATSAPP, deliveryStatus=SENT|FAILED)
  → « Message WhatsApp envoyé. » (uniquement si preuve provider)
```

Abstraction :
- `MessagingService` (métier) → `whatsapp-cloud.provider.ts` (implémentation)
- Message in-app (`proposeSendTenantMessage`) **conservé** — pas de système parallèle

## Fichiers principaux

| Zone | Fichiers |
|------|----------|
| Schema / migration | `prisma/schema.prisma`, `prisma/migrations/20260811180000_message_whatsapp_channel/` |
| Env | `src/config/env.ts`, `.env.example` |
| Phone | `src/shared/utils/phone.util.ts` |
| Provider | `src/infrastructure/messaging/*` |
| Persist | `src/modules/notification-center/notification-center.service.ts` |
| AI | `ai.tools.ts`, `ai.service.ts`, `ai.pending-actions.ts`, `ai.fallback.ts` |
| Tests | `tests/unit/phone.util.test.ts`, `tests/unit/ai.tools-local.test.ts` |
| Docs / E2E | `qa-e2e/WHATSAPP_ITC_SETUP.md`, `qa-e2e/ai_e2e_whatsapp_test.ps1` |

## Tools

| Tool | Statut |
|------|--------|
| `proposeSendWhatsAppMessage` | prêt (texte + confirm) |
| `proposeSendWhatsAppMedia` | stub → **NOT_SUPPORTED** (audio/image) |
| `proposeSendTenantMessage` | inchangé (portail in-app) |

## Endpoints

Aucun nouvel endpoint HTTP public dédié. Réutilise :
- `POST /api/v1/ai/chat`
- `POST /api/v1/ai/actions/confirm`
- Persistance via centre de messages existant

## Variables d’environnement

| Variable | Requis |
|----------|--------|
| `WHATSAPP_ENABLED=true` | oui |
| `WHATSAPP_TOKEN` | oui (secret) |
| `WHATSAPP_PHONE_NUMBER_ID` | oui |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | non |
| `WHATSAPP_API_VERSION` | non (`v21.0`) |
| `WHATSAPP_DEFAULT_COUNTRY_CODE` | non (`242`) |
| `WHATSAPP_TEMPLATE_NAME` | recommandé cold outbound |
| `WHATSAPP_TEMPLATE_LANGUAGE` | non (`fr`) |

Détails : `qa-e2e/WHATSAPP_ITC_SETUP.md`. Ne jamais logger le token.

## Flow pendingAction

1. Intent « whatsapp » ou « envoie + rappel + loyer » (si configuré)
2. Résolution locataire org-scopée + E.164
3. Si numéro absent/invalide → *« Ce locataire ne possède pas de numéro WhatsApp valide enregistré dans ITC. »*
4. Preview + `pendingAction` type `SEND_WHATSAPP_MESSAGE`
5. Confirm → Meta → preuve → reply *« Message WhatsApp envoyé. »* + Provider ID
6. Échec provider → *« L’envoi WhatsApp a échoué. »* + cause (sans secrets)

## Preuve d’envoi

- `providerMessageId` = `messages[0].id` Graph (ex. `wamid.…`)
- Ligne ITC : `channel=WHATSAPP`, `deliveryStatus=SENT|FAILED`, `toPhone`, `tenantId`, `error?`
- HTTP 200 ITC **sans** `providerMessageId` = échec métier

## Tests unitaires

`phone.util` + `ai.tools-local` : **PASS** (34 tests).

## E2E

Script : `qa-e2e/ai_e2e_whatsapp_test.ps1`  
Critère PASS : confirm + « Message WhatsApp envoyé » + Provider ID.

**Verdict E2E : BLOCKED** (credentials Meta absents, code non déployé, envoi prod non autorisé dans cette session).  
Aucun faux PASS.

## Limites restantes

1. Credentials Meta + template approuvé non présents sur Railway → E2E réel impossible.
2. Audio / image : architecture stub seulement (`proposeSendWhatsAppMedia`).
3. Cold outbound exige souvent un **template** Meta (fenêtre 24h).
4. Migration `20260811180000_message_whatsapp_channel` à appliquer en prod (`prisma migrate deploy`).
5. Opt-in WhatsApp métier non modélisé séparément (téléphone locataire = source actuelle).

## Prochaines étapes ops

1. Créer / vérifier app Meta + token permanent + Phone number ID.
2. (Prod) créer template rappel loyer → `WHATSAPP_TEMPLATE_NAME`.
3. Poser variables sur Railway (`fortunate-beauty` / `imo-backend`), redeploy.
4. `prisma migrate deploy`.
5. Exécuter `qa-e2e/ai_e2e_whatsapp_test.ps1` avec un numéro de test contrôlé.
6. PASS uniquement si le message est accepté par Meta.
