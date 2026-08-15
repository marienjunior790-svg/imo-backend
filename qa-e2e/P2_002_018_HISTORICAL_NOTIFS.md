# P2-002/018 — Notifications historiques (hors backfill)

**Constat (2026-08-11, post-deploy 0f1a523)**

| id | ticket | title inchangé | createdAt |
|----|--------|----------------|-----------|
| cmsnsowpn00ys1237ebm4yxjs | GATE-MAINT-001 (`cmsnrsqar00xh1237ojjfm0ca`) CLOSED | Intervention terminée — confirmez la résolution | 2026-08-10T22:20:28Z |
| cmsmjybh900ujtu02ghuhwpf8 | plomberie (`cmsmjtfjr00w2w4tiaczgiouk`) CLOSED | Intervention terminée — confirmez la résolution | 2026-08-10T01:28:05Z |

**Pourquoi elles restent :** créées sous l’ancien `complete()` ; tickets clos **avant** le patch ; `resolveCompletedMaintenanceNotifs` ne s’exécute qu’au `close()` futur → pas de réécriture rétroactive sans backfill.

**Politique :** ne pas supprimer en DB ; ne pas créer de SYSTEM manuelle pour faux PASS. Backfill optionnel hors scope de cette finalisation.

**Nouveau workflow :** ne génère plus de « confirmez » persistante après CLOSED (réécriture + SYSTEM).
