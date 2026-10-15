# ITC — Offres et grille tarifaire commerciale officielle

Devise : **EUR (€)** — montants **TTC** (le client paie exactement le montant affiché).

| Offre | Prix mensuel | Prix annuel | Accès principal |
|---|---|---|---|
| Free | 0 € | Aucun | Accès aux fonctionnalités de Plus pendant 48 heures |
| Pro | 45 € | 800 € | Gestion essentielle |
| Plus | 122 € | 1 850 € | Gestion essentielle, menu Agent et menu Locataire |
| Pro Max | 245 € | 3 000 € | Toutes les fonctionnalités premium, y compris l'assistant IA avec quotas |

## Règles commerciales

- L'essai Free commence à la création effective du compte.
- Sa durée est de 48 heures exactes, calculées selon l'heure du serveur.
- Aucun prélèvement automatique n'est déclenché à la fin de l'essai.
- Après expiration, les données du compte sont conservées et les paramètres ainsi que la page Abonnement restent accessibles.
- Les tarifs annuels sont des montants fixes et ne doivent pas être recalculés automatiquement à partir des prix mensuels (12 × 45 € = 540 € ≠ 800 € ; 12 × 122 € = 1 464 € ≠ 1 850 € ; 12 × 245 € = 2 940 € ≠ 3 000 €).
- Les offres payantes ne sont achetables que lorsque leurs identifiants de prix Stripe sont configurés et vérifiés.
- Aucune production ne doit être modifiée sans autorisation explicite distincte.

## Correspondance technique

| Offre | Identifiant technique | Capacités (`plans.config.ts`) |
|---|---|---|
| Free | `STANDARD` (essai, `paymentProvider = trial`) | `CORE_MANAGEMENT`, `AGENT_MENU`, `TENANT_MENU` pendant 48 h |
| Pro | `PRO` | `CORE_MANAGEMENT` |
| Plus | `PLUS` | `CORE_MANAGEMENT`, `AGENT_MENU`, `TENANT_MENU` |
| Pro Max | `PRO_MAX` | toutes, dont `AI` (quotas mensuels) et `PREMIUM` |

## État de la configuration

| Élément | État |
|---|---|
| Montants dans `src/modules/subscriptions/pricing.config.ts` | Saisis (EUR, TTC) |
| Identifiants de prix Stripe `STRIPE_PRICE_{PRO,PLUS,PRO_MAX}_{MONTHLY,ANNUAL}` | À renseigner (d'abord en mode test) |
| Produits et prix Stripe | Créés par le titulaire du compte Stripe |

Une offre n'est achetable que si `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` et son identifiant de prix sont
configurés ; sinon elle reste « bientôt disponible ».

## Connexion de Stripe

1. Dans Stripe (mode test, puis mode réel), créer 3 produits — Pro, Plus, Pro Max — avec chacun 2 prix récurrents
   en EUR : mensuel et annuel, exactement les montants de la grille, TTC (sans taxe ajoutée par Stripe).
2. Activer le portail client (Paramètres › Facturation › Portail client).
3. Renseigner les variables d'environnement (`.env` local ou variables Railway, saisies par le titulaire) :
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` et les 6 `STRIPE_PRICE_…`.
4. Webhook : `https://<adresse-du-serveur>/api/v1/subscription/stripe/webhook`, événements
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
   En local : `stripe listen --forward-to localhost:3000/api/v1/subscription/stripe/webhook`.

Le montant affiché dans l'application vient de `pricing.config.ts` ; il doit être identique au prix Stripe, qui reste
la référence de facturation.

Les tests `tests/unit/subscription.price-grid.spec.test.ts` vérifient la grille, l'absence de recalcul annuel
et la non-disponibilité d'une offre sans identifiant Stripe.
