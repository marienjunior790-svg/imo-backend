# Phase K3 — Scénarios client E2E (Real actions)

Vérification **manuelle** téléphone / app après deploy **K1+K2** (`main`).  
Zéro fake PASS : ticket / assignation = lignes Prisma réelles, pas dump patrimoine.

Prérequis : org avec ≥1 logement libellé, ≥1 agent maintenance actif (AGENT/TECHNICIAN), bail optionnel.

---

## Scénario C — Photo → ticket → assignation

| # | Action utilisateur | Attendu | Phase |
|---|-------------------|---------|-------|
| C1 | Photo **fuite** + « Appt X » (ou logement déjà en session) | Constat + **proposition ticket** (`CREATE_MAINTENANCE_TICKET`) — pas dump parc | K1 |
| C2 | « oui » / « confirme » | Ticket créé (ID + statut OPEN ou ASSIGNED si auto-assign) | K1 |
| C3 | « assigne le ticket à \<Nom Agent\> » | Proposition `ASSIGN_MAINTENANCE_TICKET` avec nom exact | K2 |
| C4 | « oui » | Statut **ASSIGNED** + nom agent dans la réponse | K2 |
| C5 | Sans logement sur photo | Demande libellé — **pas** de pending inventé | K1 |
| C6 | « assigne le ticket » sans nom (plusieurs agents) | Liste agents à choisir — pas dump | K2 |

**Échec si :** ticket créé sans confirm ; assignation silencieuse ; dump « Voici ce que confirment vos données ».

---

## Régressions rapides (J + K)

- « oui crée le PDF » après propose → PDF, pas dump
- « crée le ticket » sans logement → clarification libellé
- « automatise les tâches maintenance » → automation StaffTask (pas K1)
- Token Meta mort → « Token Meta invalide… » (J5)

---

## Journal

| Date | Build / commit | Scénario | PASS/FAIL | Notes |
|------|----------------|----------|-----------|-------|
| | `5cdb654`+ (main / Phase K) | C | | À remplir téléphone |
