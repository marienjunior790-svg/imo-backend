# Rapport P2-1 — Audit fonctionnalités secondaires ITC

**Date:** 2026-08-11 (maj couverture OWNER)  
**P0/P1:** PASS (réutilisé, non retesté)  
**P2:** OUVERT — **diagnostic uniquement (aucune correction)**  
**Appareil:** TECNO KM5 — TENANT puis **OWNER Bertrand** (`appartement 69`)  
**Preuves:** `qa-e2e/p2_*.png|xml`, `qa-e2e/p2c_*.png|xml`, API read-only  

**STOP** — aucune correction ; passe AGENT **reportée** (décision humaine).

---

## Résumé

| Catégorie | Nombre (approx.) |
|-----------|------------------|
| Fonctionnalités secondaires inventoriées | ~90+ |
| ✅ TESTÉ ET FONCTIONNEL (cette passe + preuves P0/P1 réutilisables) | 18 |
| ❌ TESTÉ ET DÉFAILLANT / incohérent | 5 |
| ⚠️ PARTIELLEMENT TESTÉ | 35+ |
| 🚫 NON IMPLÉMENTÉ | 6 |
| 🔧 CONFIGURATION | 3 |
| ⏸️ NON TESTÉ (AGENT phone) | jobs/context agent — **reporté** |

**Contraintes session:** overlays vidéo/Snapchat ont interrompu ADB à plusieurs reprises. Couverture OWNER faite ; AGENT volontairement reportée.

---

## Inventaire (extrait consolidé)

Format: `ID | Module | Fonctionnalité | Rôle | Testable | Statut`

### Navigation / shells
| ID | Module | Fonctionnalité | Rôle | Testable | Statut |
|----|--------|----------------|------|----------|--------|
| P2-NAV-012 | TenantShell | Tabs Accueil/Contrat/Paiements/Demandes | TENANT | Oui | ✅ TESTÉ ET FONCTIONNEL (après fermeture vidéo) |
| P2-NAV-ENV | Environnement | PiP / vidéo plein écran masque bottom nav | Tous | Oui | 🔵 UI/UX (env) — taps échouent tant que overlay actif |
| P2-NAV-003..011 | Router rôles | Guards TENANT/AGENT/Staff | Multi | Oui | ⏸️ NON TESTÉ (code inventorié) |
| P2-NAV-TECH | Router | Rôle TECHNICIAN ≠ garde AGENT | TECHNICIAN | Oui (code) | ⚠️ PARTIEL — incohérence code probable |

### Paramètres / profil / MFA / sessions
| ID | Module | Fonctionnalité | Rôle | Testable | Statut |
|----|--------|----------------|------|----------|--------|
| P2-SET-005/006 | Settings | Toggles email/push + persist force-stop | AGENT | Oui | ✅ (preuve AUTH-001 P0/P1) |
| P2-SES-001 | Sessions | Liste + session actuelle | AGENT | Oui | ✅ (AUTH-001) |
| P2-MFA-001 | MFA | Setup TOTP UI (abort before enable) | AGENT | Oui | ✅ UI (AUTH-001) — enable non forcé |
| P2-PRO-001 | Profile | Édition profil | Tous | Oui | ⏸️ NON TESTÉ phone |
| P2-SET-013 | À propos | Version affichée | Tous | Oui | ❌ FINAL-001 `1.0.29+54` vs package `1.0.38+69` |

### Notifications
| ID | Module | Fonctionnalité | Rôle | Testable | Statut |
|----|--------|----------------|------|----------|--------|
| P2-NOT-API | API | GET `/notifications` DB réelle + unread | OWNER | Oui | ✅ API (MAINTENANCE_* non lus) |
| P2-NOT-001 | UI TENANT | Liste + chips filtres + badge (2) | TENANT | Oui | ✅ TESTÉ |
| P2-NOT-002 | UI TENANT | Tout lu → Lu + snack | TENANT | Oui | ✅ TESTÉ (`p2_t_n_read.xml`) |
| P2-NOT-CONF | Métier | « Confirmez la résolution » alors que ticket **Clôturée** | TENANT | Oui | ❌ / 🟠 — pas de flux confirm clair ; notif stale vs statut |
| P2-NOT-005 | Deep-link | Candidature → null | Staff | Code | 🚫 NON IMPLÉMENTÉ |

### Locataire — secondaires
| ID | Module | Fonctionnalité | Rôle | Testable | Statut |
|----|--------|----------------|------|----------|--------|
| P2-TLEA-001 | Contrat | Affichage bail/logement/caution | TENANT | Oui | ✅ TESTÉ |
| P2-TPAY-001 | Paiements | Liste + statuts Payé / À payer | TENANT | Oui | ✅ TESTÉ |
| P2-TPAY-KPI | Accueil vs Paiements | Accueil **0 Impayés** vs **1 000 XAF À payer** (sept 2026) | TENANT | Oui | ❌ TESTÉ ET DÉFAILLANT (incohérence) |
| P2-TMNT-002 | Demandes | Liste tickets Clôturée + FAB | TENANT | Oui | ✅ TESTÉ |
| P2-TMNT-001 | Nouvelle demande | Formulaire | TENANT | Oui | ⚠️ form ouvert (passé) ; submit Gboard flaky |

### Abonnement / Support / Export
| ID | Module | Fonctionnalité | Rôle | Testable | Statut |
|----|--------|----------------|------|----------|--------|
| P2-SUB-API | Subscription | GET plan STARTER ACTIVE, `paymentProvider=manual` | OWNER | Oui | ✅ API |
| P2-SUB-002 | Subscription UI | Upgrade / paiement | OWNER | — | 🚫 NON AUTOMATISÉ / lecture seule |
| P2-SUP-002 | Support | WhatsApp `wa.me/242060000000` | Staff | Code | 🔧/🚫 placeholder |
| P2-SUP-SHARED | Router | `/support` hors shared → TENANT/AGENT redirect | TENANT/AGENT | Code | 🟠 P2 accès |
| P2-PAY-005 | Reçu | « Export PDF texte » = clipboard | Staff | Code | 🔵 UI/UX trompeur |
| P2-PAY-BE | API | PDF receipt endpoints existent backend | Staff | Code | ⚠️ mobile n’appelle pas forcément PDF réel |

### Recherche / listes API
| ID | Module | Fonctionnalité | Rôle | Testable | Statut |
|----|--------|----------------|------|----------|--------|
| P2-TNT-SEARCH | Tenants API | `?search=fortune` | OWNER | Oui | ✅ |
| P2-APT-SEARCH | Apartments API | search zéro résultat `total=0` | OWNER | Oui | ✅ |
| P2-BLD-SEARCH | Buildings API | pas de `search` | OWNER | Code | 🚫 NON IMPLÉMENTÉ côté API |

### IA
| ID | Module | Fonctionnalité | Rôle | Testable | Statut |
|----|--------|----------------|------|----------|--------|
| P2-AI-HIST | AI | Historique non persisté (client body only) | Staff | Code | 🚫 / ⚪ selon produit |
| P2-AI-PEND | AI | Pending actions **in-memory** | Staff | Code | 🔧/🟠 perte au restart serveur |

### Mail
| ID | Module | Fonctionnalité | Rôle | Testable | Statut |
|----|--------|----------------|------|----------|--------|
| P2-MAIL-FROM | Config | `MAIL_FROM=onboarding@resend.dev` encore | Ops | Oui | 🔧 CONFIG — FORGOT CLOSED pour allowlist ; OWNER autres dest. encore risque 503 |

---

## Tableau problèmes

| ID | Gravité | Module | Rôle | Problème | Cause | Preuve | Statut |
|----|---------|--------|------|----------|-------|--------|--------|
| P2-001 | 🟠 P2 | Locataire Accueil | TENANT | KPI « 0 Impayés » alors qu’un loyer 1 000 XAF est « À payer » | Agrégation dashboard portal ≠ liste paiements / définition « impayé » | `p2_itc_focus.xml` vs `p2_t_pay_ok.xml` | ❌ |
| P2-002 | 🟠 P2 | Notifications | TENANT | Notifs « confirmez résolution » sur tickets déjà **Clôturée** ; CTA Ouvrir sans parcours confirm clair | Cycle COMPLETED→CLOSED vs copie notif ; deep-link confirm manquant/cassé | `p2_t_notifs` + Demandes Clôturée | ❌ / ⚠️ |
| P2-003 | ⚪ COSMÉTIQUE | Settings | Tous | Version À propos `1.0.29+54` ≠ APK `1.0.38+69` | `AppConstants.appVersion` hardcodé | `constants.dart` + AUTH preuves | ❌ (FINAL-001) |
| P2-004 | 🔵 UI/UX | Payments staff | Staff | Label « export PDF » alors que copie texte clipboard | Copy marketing UI | `payments_screen.dart` L189 | ❌ trompeur |
| P2-005 | 🔧/🚫 | Support | Staff | WhatsApp numéro placeholder `242060000000` | Stub | `support_screen.dart` | 🚫 utile |
| P2-006 | 🟠 P2 | Router | TENANT/AGENT | `/support` inaccessible (non shared) | `isAccountSharedRoute` | inventaire router | ⚠️ code |
| P2-007 | 🚫 | Buildings | Staff | Pas de search/filter API buildings | Routes pagination only | inventaire backend | 🚫 |
| P2-008 | 🚫 | Notifications | Staff | Deep-link candidature → null | Non implémenté mobile | `notification_models` | 🚫 |
| P2-009 | 🔧 | Subscription | OWNER | Pas de paiement / upgrade branché | `paymentProvider=manual`, UI lecture | API SUB + code | 🚫 NON AUTOMATISÉ |
| P2-010 | 🟠 P2 | AI | Staff | Pending actions volatiles (RAM) | Map in-memory | inventaire AI | ⚠️ |
| P2-011 | 🔵 UI/UX | Device | Tous | Bottom nav / audit cassés sous PiP ou vidéo plein écran | Overlay système | `p2_t_Paiements.png` PiP ; captures anime | env |
| P2-012 | 🔧 | Mail | Ops | MAIL_FROM sandbox | Resend | railway + FORGOT residual | 🔧 |

---

## Priorités

### P2 critiques (fonctionnel secondaire cassé / trompeur)
1. **P2-001** — Incohérence Impayés Accueil locataire vs liste paiements  
2. **P2-002 / P2-018** — Notifs « confirmez résolution » post-clôture (TENANT + OWNER)  
3. **P2-013** — Résumé parc Notifications OWNER à 0 vs dashboard 370 000  

### P2 importants
4. **P2-006** — Support inaccessible TENANT/AGENT  
5. **P2-010** — Pending AI non durable  
6. **P2-007** — Buildings sans recherche  
7. **P2-016** — Rapports Volumes flash à 0  

### UI/UX
8. **P2-004** — « PDF » = clipboard  
9. **P2-011 / P2-014 / P2-015 / P2-017** — overlays, dates ISO, spinner Biens, About  

### Cosmétique
8. **P2-003 / FINAL-001** — version About  

### Configuration / non automatisé
9. **P2-009** Subscription manuelle  
10. **P2-005** WhatsApp placeholder  
11. **P2-012** MAIL_FROM domaine vérifié  

### Non implémenté
12. **P2-008** Candidatures mobile  

---

## Addendum — passe OWNER (2026-08-11) — nouveaux constats uniquement

Actions : navigation + dumps uniquement (pas de mark paid/unpaid, pas de create/assign destructif).

### ✅ TESTÉ ET FONCTIONNEL (OWNER)
| ID | Constat | Preuve |
|----|---------|--------|
| P2-OWN-BLD | Liste Immeubles : 1 immeuble `rose`, empty-help + FAB Nouvel immeuble | `p2c_o_bld.*` |
| P2-OWN-LEA | Contrats onglets + 2 ACTIVE (fortune / yannick) | `p2c_o_leases.*` |
| P2-OWN-AGT | Agents liste + chips Tous/Gestionnaires/Terrain/Compta + loginIds | `p2c_o_agents2.*` |
| P2-OWN-MNT-H | Maintenance Historique : tickets Clôturée/Terminée listés | `p2c_o_maint_hist.*` |
| P2-OWN-SUB | Abonnement STARTER Actif, lecture seule (pas de CTA paiement) | `p2c_o_sub3.*` |
| P2-OWN-AI | IA empty + starters + bandeau mode local / OPENAI | `p2c_o_ai2.*` |
| P2-OWN-NOT-F | Centre notifs : filtres + 19 non lus réels (backend) | `p2c_o_notifs_unread.*` |
| P2-OWN-REP-KPI | Rapports synthèse 370 000 / 50 % occupation / 1 immeuble | `p2c_o_rep4.*` / `p2c_o_pay5.*` |

### ❌ / ⚠️ NOUVEAUX problèmes OWNER
| ID | Gravité | Problème | Cause probable | Preuve |
|----|---------|----------|----------------|--------|
| P2-013 | 🟠 P2 | Centre notifs **Résumé du parc** : `0 Encaissé` / `0 Impayés` alors dashboard `370 000` / `0` | Widget résumé notifs non branché / mauvais agregat | `p2c_o_notifs*.xml` vs `p2c_owner2.xml` |
| P2-014 | 🔵 UI/UX | Contrat liste : date fin **ISO brut** `2027-08-09T00:00:00.000Z` | Formatage date manquant | `p2c_o_leases.xml` |
| P2-015 | 🔵 UI/UX | Biens / Logements : spinner long + FAB « Nouveau bien » actif pendant chargement (dump quasi vide) | Race loading / a11y pauvre | `p2c_o_prop.png` |
| P2-016 | 🔵 UI/UX | Rapports **Volumes** : flash `Locataires/Contrats/Paiements: 0` puis valeurs correctes `3/2/3` | Chargement async sans skeleton / placeholders 0 | `p2c_o_rep4.xml` (0) vs `p2c_o_pay5.xml` (3/2/3) |
| P2-017 | ⚪ + env | About toujours `1.0.29+54` ; Snapchat/vidéo interceptent taps drawer | FINAL-001 + env | `p2c_o_set3.xml` |
| P2-018 | 🟠 P2 (confirm) | Notifs OWNER « en attente de confirmation locataire » sur ticket déjà Clôturée | Même famille que P2-002 | `p2c_o_notifs_unread.xml` + hist |

### ⏸️ Non couvert cette passe
- AGENT (jobs / contexte / empty) — **reporté**  
- Locataires UI recherche OWNER (drawer miss / overlays)  
- Paiements onglet Impayés OWNER (navigation interrompue)  
- Export clipboard Rapports / Support WhatsApp live tap  

---

## Ce qui n’a PAS été fait (conforme brief)

- Aucune correction / redesign / polish / migration / DB  
- P0/P1 non rejoués  
- AGENT non testé (report explicite)

---

## STOP

Addendum OWNER intégré.  
**Attendre validation** avant corrections ou passe AGENT.
