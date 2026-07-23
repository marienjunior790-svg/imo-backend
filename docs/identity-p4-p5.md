# ITC — Identity P4/P5 (backend-tracked)

Mirror des gates pour le repo `imo-backend` (les docs complètes vivent aussi sous `IMO/docs/`).

- **D11** : compat API `/api/v1` jusqu’à fin P5 sauf major.
- **P4** : MFA, sessions, reset, refresh reuse, lockout, security-events.
- **P5** : JWT role depuis Membership ; soft-deprecate `POST /admin/users`+password ; clients sans chips/LoginMode/CreateUserSheet.

Migration : `20260723040000_identity_security_p4`.

Ouverture P5 : `P4 exit signé — lancer P5 Legacy cleanup` (23/07/2026).
