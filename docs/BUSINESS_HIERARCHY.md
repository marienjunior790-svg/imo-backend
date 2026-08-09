# Hiérarchie métier ITC

Référence produit — entreprise de gestion immobilière.

## Rôles utilisateurs

| Rôle DB | Libellé produit | Mission |
|---------|-----------------|---------|
| `OWNER` | Propriétaire (supervision) | Boss : vue globale, équipe, config, peut intervenir |
| `MANAGER` | Agent gestionnaire | **Centre ops** : locataires, biens, contrats, paiements, maintenance desk |
| `AGENT` | Agent terrain | Interventions assignées uniquement (`/agent`) |
| `TENANT` | Locataire | Portail perso : son logement, bail, loyers, SAV |
| `ACCOUNTANT` | Comptable | Finances / paiements selon permissions |

## Type d’organisation ≠ rôle

- `Organization.type` : `AGENCY` \| `OWNER` — nature de l’entreprise
- `User.role` / `Membership.role` — responsabilité dans l’org

## Flux clés

1. **Owner** provisionne des **Managers** (agents gestionnaires) et éventuellement des **Agents terrain**.
2. **Manager** crée / gère les locataires (Identity + Membership TENANT), baux, paiements, tickets.
3. **Tenant** signale une maintenance → **Manager** assigne → **Agent terrain** exécute → Owner peut consulter.
4. Ne pas confondre « Agent » marketing (gestionnaire) avec le rôle DB `AGENT` (terrain).

## Règle API

`POST /agents` crée par défaut un `MANAGER`. Passer `role: "AGENT"` pour le terrain.
