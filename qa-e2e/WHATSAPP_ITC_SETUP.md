# WhatsApp Business (Meta Cloud API) — Intelligence ITC

Guide de configuration pour l’envoi réel WhatsApp depuis le copilote IA (et le centre de notifications).

## Prérequis Meta

1. Compte **Meta Business** + application Meta (type Business).
2. Produit **WhatsApp** → **API Setup** (Cloud API).
3. Noter :
   - **Phone number ID** (`WHATSAPP_PHONE_NUMBER_ID`)
   - **WhatsApp Business Account ID** (`WHATSAPP_BUSINESS_ACCOUNT_ID`, optionnel)
   - Un **token d’accès permanent** (system user) avec permissions `whatsapp_business_messaging` / `whatsapp_business_management`
4. En production, le numéro d’affichage doit être **vérifié** et le WABA en mode live (hors sandbox limité aux numéros de test).

## Variables Railway / `.env`

| Variable | Requis | Description |
|----------|--------|-------------|
| `WHATSAPP_ENABLED` | oui | `true` pour activer |
| `WHATSAPP_TOKEN` | oui | Bearer token Meta (secret) |
| `WHATSAPP_PHONE_NUMBER_ID` | oui | ID du numéro Cloud API |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | non | WABA id |
| `WHATSAPP_API_VERSION` | non | défaut `v21.0` |
| `WHATSAPP_DEFAULT_COUNTRY_CODE` | non | défaut `242` (Congo-Brazzaville) |
| `WHATSAPP_TEMPLATE_NAME` | non | si défini : envoi **template** (paramètre body = texte) |
| `WHATSAPP_TEMPLATE_LANGUAGE` | non | défaut `fr` |

`isWhatsAppConfigured` = `WHATSAPP_ENABLED && WHATSAPP_TOKEN && WHATSAPP_PHONE_NUMBER_ID`.

**Ne jamais** committer le token ni le coller dans des tickets / captures.

## Templates vs texte libre

- **Texte libre** (`type: text`) : autorisé uniquement dans la fenêtre de conversation 24 h après un message utilisateur, ou en sandbox selon règles Meta.
- **Template** : obligatoire pour la plupart des rappels « cold » (ex. rappel de loyer). Créer un template approuvé dans Meta Business Manager, puis renseigner `WHATSAPP_TEMPLATE_NAME` (et la langue). Le corps du message ITC est passé comme paramètre(s) du body du template.

## Flux produit ITC

1. L’utilisateur demande un WhatsApp / rappel de loyer (si WA configuré) via Intelligence ITC.
2. L’outil `proposeSendWhatsAppMessage` propose un aperçu (locataire, E.164, corps) — **confirmation obligatoire**.
3. À la confirmation : `MessagingService` → Meta Graph `POST /{version}/{PHONE_NUMBER_ID}/messages`.
4. Une ligne `messages` est créée avec `channel=WHATSAPP`, `deliveryStatus=SENT` (ou `FAILED` + `error` si l’API échoue), `providerMessageId`, `toPhone`, `tenantId`.

Le message **in-app** portail (`proposeSendTenantMessage`) reste inchangé.

## Numéros (CG)

Normalisation via `normalizePhoneE164` : `06…` → `+2426…`, `+242…` conservé. Aucun numéro n’est inventé : téléphone locataire en base ou `toPhone` explicite requis.

## Audio / image

**Non implémenté.** L’outil stub `proposeSendWhatsAppMedia` renvoie `unsupported: true`. Prévoir plus tard : upload média Meta (`/{PHONE_NUMBER_ID}/media`) puis message `type: image|audio`.

## Smoke test manuel

1. Définir les variables sur Railway, redeploy.
2. Dans l’app : « Envoie un WhatsApp au locataire … : Bonjour test »
3. Confirmer l’action proposée.
4. Vérifier le message reçu sur WhatsApp + `providerMessageId` dans la réponse IA / table `messages`.

## Dépannage

- `WhatsApp non configuré` → variables manquantes ou `WHATSAPP_ENABLED=false`.
- HTTP 401/403 Meta → le copilote affiche **« Token Meta invalide ou permissions insuffisantes »** (Phase J5) ; régénérer le token system user et mettre à jour `WHATSAPP_TOKEN` sur Railway.
- HTTP 400 template → nom/langue/paramètres incorrects, ou template non approuvé.
- Numéro invalide → corriger le téléphone locataire en E.164.
