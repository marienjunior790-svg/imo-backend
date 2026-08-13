# PHASE J — AI Intelligence 2.0

**Objectif :** Knowledge + Vision + PDF + Documents + Deep reasoning + Real actions  
**Interdit :** rajouter 15 petits tools OpenAI.

## Constat (prod / téléphone)

| Scénario client | Comportement actuel | Cause |
|-----------------|---------------------|--------|
| Photo envoyée | ~~`Erreur interne du serveur`~~ → constat + plan Maintenance (J0/J3) | ~~sans try/catch~~ → soft-fail + vision métier |
| « oui crée le PDF » | Dump patrimoine | Confirm NL absent ; fallback portfolio |
| « contrat PDF de fortune libolo » | Liste d’IDs (DRAFT+ACTIVE) | Pas de résolution locataire → bail ACTIVE |
| WhatsApp Meta 401 | Texte d’échec générique | Pas de mapping auth Meta |
| Docs « lis la clause » | ~~Métadonnées Prisma seulement~~ → NOT_SUPPORTED + alt. faits / photo (J2) ; faits loyer/dates via pipeline (J4) | OCR/RAG NOT_SUPPORTED (honnête) |

## Architecture cible (pas de nouveaux tools)

```
User utterance
    → Capability Router (session + pending + knowledge)
        → existing tools / propose* / confirmAction / vision / howto
    → never portfolio dump when pending or capability matched
```

### Fichiers

| Fichier | Rôle |
|---------|------|
| `ai.knowledge.ts` | Pack métier unique (rôles, entités, workflows, limites) |
| `ai.capabilities.ts` | IDs de capacités → tools / méthodes existantes |
| `ai.capability-router.ts` | Score utterance + session + pending |
| Extend `ai.context-manager.ts` | `wantsConfirmLast` / reject |
| Harden `chatFromImage` | Jamais 500 brut |
| Extend `proposeLeasePdf` | Match locataire + préférence ACTIVE |

**Réutiliser les 36 tools existants.** Le routeur choisit ; il n’invente pas de schémas.

## Jalons

### J0 — Confirm NL + Vision soft-fail + bail par nom (P0) — **DONE** (`4b7df78`)
- « oui / confirme / crée le PDF / vas-y » → `confirmAction(latest pending)`
- Vision : try/catch + rejet PDF non-image → 200 message clair
- « contrat PDF de \<locataire\> » → propose le bail ACTIVE le plus pertinent

**AT client :** Après proposition contrat, « oui crée le PDF » → PDF réel, pas dump parc.

### J1 — Capability router avant fallback — **DONE**
- `ai.capability-router.ts` : score utterance + session + pending
- Ambiguous court + pending / lastIntent propose* → **jamais** `buildLocalFallbackReply` (dump patrimoine)
- Clarification FR + pendingAction renvoyée pour confirmer depuis l’UI

**AT :** Après propose PDF, message flou (« euh », « ok ») → rappel de confirmer, pas « Voici ce que confirment vos données ITC… ».

### J2 — Knowledge layer — **DONE**
- `ai.knowledge.ts` enrichi depuis Prisma (rôles, graphe, statuts, règles bail≠impayé)
- Clarifications locales : OCR/clause PDF, WA média, état des lieux, « pourquoi retard si bail actif »
- Injecté dans ASSISTANT_PROMPT + court-circuit chat avant fallback

**AT :** « Trouve la clause préavis dans ce PDF » → NOT_SUPPORTED + alternatives (faits bail / photo), pas dump parc.

### J3 — Vision métier — **DONE** (branch)
Photo → constat + proposition ticket maintenance / agent (tools existants), pas « NOT_SUPPORTED ».

- `ai.vision.ts` : classification DAMAGE/DOCUMENT/IDENTITY/PROPERTY, priorité via `classifyPriority`, hint logement session/libellé
- `chatFromImage` : prompt structuré + appendix plan d’action + actions `/maintenance` + merge session
- Soft-fail J0 conservé (non-image / erreur vision → message clair)

**AT :** photo fuite + « Appt 3B » → constat + priorité + plan Maintenance (pas dump parc).

### J4 — Document pipeline — **DONE** (branch)
Upload PDF → bridge faits Prisma (OCR fichier = NOT_SUPPORTED honnête) → ask/compare/anomalies.

- `ai.document-pipeline.ts` : intents loyer / dates / durée / résiliation / résumé / anomalies + match locataire
- `chatFromImage` PDF → faits ITC liés (session / nom) + message OCR clair
- `chat()` court-circuit pipeline avant dump ; `answerDocumentQuestion` + durée / préavis terms
- Knowledge : laisse passer les questions de faits structurés malgré « PDF »

**AT :** « quel est le loyer du bail de … » → montant Prisma ; PDF upload → digest faits, pas 500 / pas dump parc.

### J5 — WhatsApp parcours réel
IA → confirm → Meta → providerMessageId → statut ; 401 = « token Meta invalide ».

### J6 — Scénarios client E2E (pas tool unit)
1. Photo fuite → constat → logement → bail → rapport PDF → proposer envoi agent  
2. Contrat PDF → loyer / échéance / durée / résiliation / anomalies → relance WhatsApp impayé  

## Règle d’or

Prisma / tools = vérité. Mémoire = préférences. Propose → confirm pour toute action sensible. Zéro fake PASS.
