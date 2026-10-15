# ITC — Offres et grille tarifaire commerciale officielle

Devise : **EUR (€)**

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
- Aucun prix Stripe ne doit être créé et aucune production ne doit être modifiée sans autorisation explicite distincte.

## Correspondance technique

| Offre | Identifiant technique | Capacités (`plans.config.ts`) |
|---|---|---|
| Free | `STANDARD` (essai, `paymentProvider = trial`) | `CORE_MANAGEMENT`, `AGENT_MENU`, `TENANT_MENU` pendant 48 h |
| Pro | `PRO` | `CORE_MANAGEMENT` |
| Plus | `PLUS` | `CORE_MANAGEMENT`, `AGENT_MENU`, `TENANT_MENU` |
| Pro Max | `PRO_MAX` | toutes, dont `AI` (quotas mensuels) et `PREMIUM` |

## État de la configuration (grille décidée ≠ grille active)

| Élément | État |
|---|---|
| Montants dans `src/modules/subscriptions/pricing.config.ts` | Non saisis (`null`) : aucune offre affichée avec un prix ni achetable |
| Identifiants de prix Stripe `STRIPE_PRICE_{PRO,PLUS,PRO_MAX}_{MONTHLY,ANNUAL}` | Non configurés en production |
| Produits et prix Stripe | Non créés |

Mise en vente (chaque étape sur autorisation distincte) :

1. Créer dans Stripe les 6 prix récurrents en EUR, avec exactement les montants de la grille (mensuel et annuel séparés).
2. Renseigner les 6 identifiants de prix dans les variables d'environnement.
3. Saisir les montants et la devise `EUR` dans `pricing.config.ts` (le montant affiché doit être identique au prix Stripe).

Les tests `tests/unit/subscription.price-grid.spec.test.ts` vérifient la grille, l'absence de recalcul annuel,
l'absence de tarif actif tant que la grille n'est pas saisie, et la non-disponibilité d'une offre sans identifiant Stripe.
