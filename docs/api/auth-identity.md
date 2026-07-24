# ITC — API Auth & Identity (P0–P3)

**Freeze :** [architecture-freeze-auth-identity.md](../architecture-freeze-auth-identity.md) §6  
**Écart SoT :** [identity-runtime-gap.md](../identity-runtime-gap.md)  
Base : `/api/v1`  
Auth : `Authorization: Bearer <accessToken>` sauf routes **public**.

---

## Vue d’ensemble

| Méthode | Path | Auth | Phase |
|---------|------|------|-------|
| POST | `/auth/register` | Public | P0/P1 |
| POST | `/auth/register-tenant` | Public | P0/P1 |
| POST | `/auth/login` | Public | P0 |
| POST | `/auth/refresh` | Public | — |
| POST | `/auth/logout` | Bearer | — |
| GET | `/auth/me` | Bearer | P0–P3 enrichi |
| GET | `/auth/me/capabilities` | Bearer | P3 |
| GET | `/auth/me/modules` | Bearer | P3 |
| GET | `/onboarding` | Bearer | P1 |
| POST | `/onboarding/first-property` | Bearer | P1 |
| POST | `/onboarding/steps/:key/complete` | Bearer | P1 |
| POST | `/invitations` | Bearer admin | P2 |
| GET | `/invitations` | Bearer admin | P2 |
| GET | `/invitations/:token` | Public | P2 |
| POST | `/invitations/:token/accept` | Public | P2 |
| POST | `/invitations/:id/revoke` | Bearer admin | P2 |
| POST | `/auth/switch-organization` | Bearer | P3+ (prévu) |
| POST | `/auth/forgot-password` | Public | P4 |
| POST | `/auth/reset-password` | Public | P4 |
| GET | `/auth/sessions` | Bearer | P4 |
| DELETE | `/auth/sessions/:id` | Bearer | P4 |
| DELETE | `/auth/sessions` | Bearer | P4 |
| POST | `/auth/mfa/setup` | Bearer | P4 |
| POST | `/auth/mfa/verify` | Bearer | P4 |
| POST | `/auth/mfa/disable` | Bearer | P4 |
| GET | `/auth/security-events` | Bearer | P4 |

---

## JWT access (claims figés)

| Claim | Signification |
|-------|----------------|
| `sub` | identityId (`users.id`) |
| `mid` | membershipId actif (cible SoT) |
| `orgId` | organisation du contexte |
| `role` | rôle membership (runtime actuel : encore souvent User.role) |

---

## GET `/auth/me`

Profil session + identité + authz.

```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "...", "role": "ORG_ADMIN", "organizationId": "..." },
    "organization": { "id": "...", "name": "...", "plan": "STARTER" },
    "subscription": { },
    "permissions": { "some_feature": true },
    "rbac": { "BUILDING_CREATE": true },
    "homePath": "/dashboard",
    "onboarding": {
      "incomplete": true,
      "completedAt": null,
      "nextStep": "first_property",
      "steps": []
    },
    "membership": {
      "id": "mem_...",
      "role": "ORG_ADMIN",
      "organizationId": "...",
      "isPrimary": true,
      "productRole": "ORG_OWNER"
    },
    "capabilities": ["DASHBOARD_VIEW", "BUILDING_CREATE", "USER_CREATE"],
    "modules": [
      { "key": "core", "label": "Cœur", "description": "...", "enabled": true },
      { "key": "maintenance", "label": "Maintenance", "description": "...", "enabled": false }
    ]
  }
}
```

### Champs Identity (P3)

| Champ | Signification |
|-------|----------------|
| `membership` | Appartenance active (rôle porté ici ; `productRole` = alias UI) |
| `capabilities` | Permissions RBAC résolues |
| `modules` | Catalogue × plan (`enabled`) |
| `homePath` | Destination post-login (P0) |
| `onboarding` | `null` = legacy sans gate ; sinon engine P1 |

---

## GET `/auth/me/capabilities`

```json
{
  "success": true,
  "data": {
    "capabilities": ["DASHBOARD_VIEW", "BUILDING_CREATE"],
    "membership": { "id": "...", "role": "ORG_ADMIN", "organizationId": "...", "isPrimary": true, "productRole": "ORG_OWNER" }
  }
}
```

---

## GET `/auth/me/modules`

```json
{
  "success": true,
  "data": {
    "modules": [
      { "key": "core", "label": "Cœur", "description": "Org, biens, locataires, contrats", "enabled": true },
      { "key": "payments", "label": "Paiements", "description": "...", "enabled": true },
      { "key": "maintenance", "label": "Maintenance", "description": "...", "enabled": false },
      { "key": "accounting", "label": "Comptabilité", "description": "...", "enabled": false },
      { "key": "portal", "label": "Portail locataire", "description": "...", "enabled": true },
      { "key": "platform", "label": "Plateforme ITC", "description": "...", "enabled": false }
    ]
  }
}
```

### Modules × plan

| Plan | Modules enabled |
|------|-----------------|
| STARTER | core, payments, portal |
| PRO | + maintenance |
| ENTERPRISE | + accounting |
| SUPER_ADMIN | + platform |

**Navigation client** = capabilities ∩ modules `enabled`.

### Module désactivé (contrat freeze)

| Couche | Comportement |
|--------|--------------|
| UI | Item absent / redirect |
| API métier | **`403`** avec code `MODULE_DISABLED` (pas 404 opaque) |

---

## Permissions — héritage (P3)

Règle d’or : **ORG_ADMIN ⊇ MANAGER ⊇ AGENT**.

| Rôle DB | Alias produit | Notes |
|---------|---------------|-------|
| SUPER_ADMIN | PLATFORM_ADMIN | ALL |
| ORG_ADMIN | ORG_OWNER | Admin + ops |
| MANAGER | ORG_MANAGER | Pilotage |
| AGENT | AGENT | Ops |
| TECHNICIAN | TECHNICIAN | Terrain |
| ACCOUNTANT | ACCOUNTANT | Finance |
| TENANT | TENANT | Portail |

Invariant : `backend/tests/unit/rbac-inheritance.test.ts`.

---

## Login / Register

`POST /auth/login` : body `identifier` **ou** `email` (D11) + `password` ; réponse enrichie (`homePath`, `mustChangePassword`, `portalStatus`, membership…).

`POST /auth/register` : création entreprise + ORG_ADMIN.

`POST /auth/register-tenant` : **deprecated v0.9** (headers Deprecation/Sunset) — préférer provision org  
`POST /tenants/:id/portal-access`. Retrait définitif v1.0 (410).

Staff : invitations uniquement (pas de rôle TENANT en invite).

---

## Portail locataire — provision (T2 — livré)

| Méthode | Path | Caps |
|---------|------|------|
| GET/PATCH | `/tenants/portal-access-settings` | SETTINGS_VIEW / SETTINGS_EDIT |
| GET | `/tenants/:id/portal-access` | TENANT_PORTAL_VIEW_STATUS |
| POST | `/tenants/:id/portal-access` | TENANT_PORTAL_PROVISION |
| POST | `/tenants/:id/portal-access/regenerate` | TENANT_PORTAL_REGENERATE |
| POST | `/tenants/:id/portal-access/reset` | TENANT_PORTAL_RESET (ORG_ADMIN/MANAGER) |
| POST | `/tenants/:id/portal-access/suspend` | TENANT_PORTAL_SUSPEND |
| POST | `/tenants/:id/portal-access/reactivate` | TENANT_PORTAL_SUSPEND |
| POST | `/tenants/:id/portal-access/archive` | TENANT_PORTAL_SUSPEND |

Identifiant : e-mail prioritaire sinon `loginId` `ITC-{8}`.  
Mode A : `temporaryPassword` one-shot si `IN_APP` dans settings.  
Bail ACTIVE : auto-provision si `autoProvisionOnLeaseActive` (défaut true).  
Détail : [identity-tenant-provisioning-v1.md](../identity-tenant-provisioning-v1.md).

---

## Invitations (P2 — livré)

| Méthode | Path | Accès |
|---------|------|--------|
| POST | `/invitations` | Admin (Owner/Manager) |
| GET | `/invitations` | Admin |
| POST | `/invitations/:id/revoke` | Admin |
| GET | `/invitations/:token` | Public |
| POST | `/invitations/:token/accept` | Public |

Flux : invite (email + rôle) → lien TTL 72h (`INVITE_TTL_HOURS`) → `/invite/:token` → mot de passe → membership + session.  
Mail = stub console jusqu’à SMTP ; base liens = `PUBLIC_APP_URL`.

---

## P4 Identity & Security (livré code)

| Méthode | Path | Note |
|---------|------|------|
| POST | `/auth/forgot-password` | Toujours 200 ; lien console stub |
| POST | `/auth/reset-password` | Token single-use ; révoque toutes sessions |
| GET | `/auth/sessions` | Liste appareils (option `X-Refresh-Token` pour `current`) |
| DELETE | `/auth/sessions/:id` | Révocation unitaire |
| DELETE | `/auth/sessions` | Révocation globale |
| POST | `/auth/mfa/setup` | Secret + otpauth + recovery codes |
| POST | `/auth/mfa/verify` | Active MFA (TOTP) |
| POST | `/auth/mfa/disable` | Password + TOTP |
| GET | `/auth/security-events` | Journal auth self |

Login : si MFA actif sans `mfaCode` → `{ mfaRequired: true }`.  
Refresh : rotation + **reuse detection** (famille révoquée).  
Lockout : `AUTH_LOCKOUT_THRESHOLD` / `AUTH_LOCKOUT_MINUTES` (défaut 5 / 15).

Migration : `20260723040000_identity_security_p4`.

---

## Interdits / deprecated

| Pattern | Remplacement |
|---------|--------------|
| `POST /admin/users` + password | `POST /invitations` + accept (**deprecated**, retiré P5) |
| `POST /auth/register-tenant` | `POST /tenants/:id/portal-access` (**deprecated v0.9**, 410 en v1.0) |
| Invite rôle `TENANT` | Provision CRM / bail |
| Query / chips `space=` | Login unique + `homePath` |
| Home routes hardcodées client sans backend | `homePath` |

---

## Compatibilité

- Absence de `membership` / `modules` / `homePath` : clients **fallback** (mobile/web).
- Tant que SoT Membership incomplet : dual-write + lecture User.role — voir gap runtime.
- Rollback schéma : [identity-rollback.md](../identity-rollback.md).

---

## Ordre migrations (référence)

1. `…_org_onboarding_p1`  
2. `…_invitations_p2`  
3. `…_memberships_p3`  
4. Credential / Session / MFA → **P4**  
5. `…_tenant_portal_access_v1` → **T1/T2 portail locataire**
