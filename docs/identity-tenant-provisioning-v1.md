# ITC — Provisionnement Portail Locataire

**Version :** 1.0  
**Statut :** **SIGNÉE** — 24/07/2026  
**Sponsor produit :** validation chat (choix 1–5 + statut compte)  
**Ouverture implémentation :** `Spec locataire v1.0 SIGNÉE — lancer T1`  
**Références :** [architecture-freeze-auth-identity.md](./architecture-freeze-auth-identity.md), Identity & Authorization Spec v1.0  
**Canvas :** `tenant-portal-provisioning-spec.canvas.tsx`

---

## 0. Décisions signées (non négociables)

| # | Décision | Choix |
|---|----------|--------|
| D-T1 | Auto-provision au bail ACTIVE | **Oui**, configurable par org. **Défaut = ON** (bail créé/activé → provision). Org peut désactiver pour activation manuelle uniquement. |
| D-T2 | AGENT peut suspendre | **Non**. Suspend / réactiver / reset = **ORG_ADMIN** + **MANAGER**. AGENT = provision, régénérer, voir statut (pas couper l’accès). |
| D-T3 | Identifiant | **Email nullable + `loginId`**. Priorité e-mail si présent ; sinon `loginId` unique. |
| D-T4 | Modes distribution | Défaut org = **A + B**. Mode **C (SMS)** option activable par org (coût / provider). |
| D-T5 | Sunset `register-tenant` | **Progressif** : **v0.9** deprecated (headers + UX) ; **v1.0** retiré (410). |
| D-T6 | Statut compte portail | Enum exposé CRM/admin (voir §3). |
| D1 | Format `loginId` | **`ITC-{8 alphanum}`** ex. `ITC-8F4K92AZ` (global, pas de préfixe org). |
| D2 | Mdp temporaire | **≥16** chars, maj+min+chiffre+symbole via `crypto.randomBytes` (pas UUID/timestamp). |
| D3 | Post change-password | **Révoquer tous refresh_tokens** + **émettre nouvelle session**. |
| D4 | Middleware | Backend obligatoire : `mustChangePassword` → allow change-password / logout / me ; deny pipelines métier (`/portal/*`, staff…). |
| D5 | AGENT | PROVISION + VIEW + REGENERATE ; **pas** SUSPEND / RESET. |

---

## 1. Principe métier

> Un locataire **ne crée jamais** son propre compte.  
> L’**organisation** provisionne l’accès portail.

Login unique conservé. Identifiant = e-mail **ou** `loginId`.

---

## 2. Modèle Identity

```
Identity (users)
  ├── email? | loginId? (au moins un)
  ├── passwordHash + mustChangePassword
  ├── portalStatus (dérivé ou stocké — §3)
  ├── Sessions (RefreshToken)
  └── Memberships (role=TENANT, organizationId = org bailleur)
Tenant CRM
  └── userId lié 1:1 après provision
Organization.settings.portalAccess
  ├── autoProvisionOnLeaseActive: boolean (défaut true)
  └── deliveryModes: IN_APP | EMAIL | SMS[]  (défaut [IN_APP, EMAIL])
```

Staff invitations inchangées. SUPER_ADMIN bootstrap inchangé.

---

## 3. Statut compte portail (D-T6)

Enum produit / API `PortalAccessStatus` :

| Statut | Signification |
|--------|----------------|
| `PROVISIONED` | Compte créé, jamais connecté (mdp temporaire encore valide) |
| `INVITE_SENT` | Credentials distribués via e-mail et/ou SMS (Mode B/C) ; pas encore activé |
| `ACTIVATED` | Locataire a remplacé le mdp temporaire (`mustChangePassword=false` + au moins une connexion ou change-password réussi) |
| `SUSPENDED` | Accès coupé (`isActive=false` et/ou membership inactive) |
| `ARCHIVED` | Ancien locataire ; pas de connexion ; conservé pour historique |

**Résolution (règles) :**

```
si User/Membership inactive volontaire archive flag → ARCHIVED
sinon si !isActive → SUSPENDED
sinon si mustChangePassword && deliveryLogged → INVITE_SENT
sinon si mustChangePassword && !lastLoginAt → PROVISIONED
sinon → ACTIVATED
```

Stockage recommandé : colonne `User.portalStatus` **ou** champ sur liaison + recalcul à chaque mutation (provision, send, login, change-password, suspend, archive). **Recalc + persist** pour affichage CRM immédiat sans joindre les logs.

---

## 4. Cycle de vie

1. Création CRM / bail (ACTIVE) → si `autoProvisionOnLeaseActive` → provision.  
2. Identity + Membership TENANT(org) + `Tenant.userId`.  
3. Identifiant (email | loginId) + mdp temporaire + `mustChangePassword=true` + status `PROVISIONED`.  
4. Distribution : Mode A (réponse one-shot) ; Mode B si email ; Mode C si activé org → status `INVITE_SENT` si canal async utilisé.  
5. 1re connexion + change password → `ACTIVATED`.  
6. Ops : régénérer (repart vers PROVISIONED/INVITE_SENT) ; suspendre ; réactiver ; archiver.

---

## 5. Schéma DB

| Champ | Type | Notes |
|-------|------|-------|
| `User.loginId` | `String? @unique` | Format D1 `ITC-XXXXXXXX` |
| `User.email` | `String? @unique` | Nullable ; CHECK email OR loginId |
| `User.mustChangePassword` | `Boolean @default(false)` | |
| `User.tempPasswordSetAt` | `DateTime?` | |
| `User.passwordChangedAt` | `DateTime?` | |
| `User.portalStatus` | enum PortalAccessStatus | Persisté |
| `User.lastLoginAt` | existant | |
| `Organization.portalAccess` | Json? | settings |
| Audit | `PORTAL_*` | |

**Hors T1 :** `tenants.userId NOT NULL` — uniquement après backfill (T1.5).

### Rollback T1

Fichier : `prisma/migrations/20260724120000_tenant_portal_access_v1/ROLLBACK.sql`  
Avant : s’assurer qu’aucun user n’a `email IS NULL` (sinon backfill synthétique).

### Critères GO T1 (staging)

| # | Critère |
|---|---------|
| 1 | `prisma migrate deploy` staging OK |
| 2 | Prisma schema aligné (`prisma generate`) |
| 3 | Aucun user cassé ; login email existant OK |
| 4 | TENANT existants conservent l’accès |
| 5 | Nouveau provision sans email → `loginId` `ITC-…` |
| 6 | Rollback documenté / testé dry-run |

---

## 6. API

| Méthode | Path | Qui |
|---------|------|-----|
| POST | `/tenants/:id/portal-access` | PROVISION (ORG_ADMIN, MANAGER, AGENT) |
| GET | `/tenants/:id/portal-access` | VIEW_STATUS (idem) |
| POST | `/tenants/:id/portal-access/regenerate` | REGENERATE (ORG_ADMIN, MANAGER, AGENT) |
| POST | `/tenants/:id/portal-access/reset` | RESET (ORG_ADMIN, MANAGER) |
| POST | `/tenants/:id/portal-access/suspend` | SUSPEND (ORG_ADMIN, MANAGER) **pas AGENT** |
| POST | `/tenants/:id/portal-access/reactivate` | SUSPEND (ORG_ADMIN, MANAGER) |
| POST | `/tenants/:id/portal-access/archive` | SUSPEND/ARCHIVE (ORG_ADMIN, MANAGER) |
| PATCH | `/organizations/me/portal-access-settings` | ORG_ADMIN |
| POST | `/auth/login` | `identifier` ; retourne `mustChangePassword`, `portalStatus` |
| POST | `/auth/change-password` | Gate activation |

**v0.9 :** `POST /auth/register-tenant` → headers Deprecation/Sunset + body warning.  
**v1.0 :** 410 Gone.

Invite rôle `TENANT` : retiré du produit (schema + UI) dès T4 ; pending invites honorés jusqu’à expiry.

---

## 7. RBAC

| Capability | ORG_ADMIN | MANAGER | AGENT |
|------------|-----------|---------|-------|
| TENANT_PORTAL_PROVISION | ✓ | ✓ | ✓ |
| TENANT_PORTAL_REGENERATE | ✓ | ✓ | ✓ |
| TENANT_PORTAL_VIEW_STATUS | ✓ | ✓ | ✓ |
| TENANT_PORTAL_RESET | ✓ | ✓ | ✗ |
| TENANT_PORTAL_SUSPEND | ✓ | ✓ | ✗ |
| TENANT_PORTAL_ARCHIVE | ✓ | ✓ | ✗ |
| Org portal settings | ✓ | ✗ | ✗ |

---

## 8. Flutter

- Retirer self-serve portail (intention) ; deprecate copy v0.9.  
- Login : « Identifiant (e-mail ou n° client) ».  
- Gate `mustChangePassword`.  
- CRM : badge statut + actions selon caps.  
- Bail : respect setting auto-provision ; toast Mode A.  
- Settings org : toggles auto-provision + modes A/B/C.

---

## 9. Phases

| Phase | Contenu | Statut |
|-------|---------|--------|
| T0 | Spec signée | **DONE** 24/07/2026 |
| T1 | Migration DB + enum status + settings | **DONE** (code) — `migrate deploy` staging/prod |
| T2 | API provision / login identifier / settings / lease hook | **GO T2** 24/07/2026 |
| T3 | Gate change-password + 403 portail | **DONE** (API) — Flutter gate OPEN |
| T4 | Flutter CRM/bail + deprecate register-tenant UI | **GO T4** 24/07/2026 |
| T5 | Canal B (mail) + flag C SMS | OPEN (stubs console) |
| T6 | Cutover 1.0 + job orphans | OPEN (après v0.9 en prod) |

---

## 10. Message d’ouverture

> Spec locataire v1.0 SIGNÉE — lancer T1
