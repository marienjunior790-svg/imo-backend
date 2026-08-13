# PHASE J — AI Intelligence 2.0

**Objectif :** Knowledge + Vision + PDF + Documents + Deep reasoning + Real actions  
**Interdit :** rajouter 15 petits tools OpenAI.

## Constat (prod / téléphone)

| Scénario client | Comportement actuel | Cause |
|-----------------|---------------------|--------|
| Photo envoyée | `Erreur interne du serveur` | `chatFromImage` sans try/catch → 500 |
| « oui crée le PDF » | Dump patrimoine | Confirm NL absent ; fallback portfolio |
| « contrat PDF de fortune libolo » | Liste d’IDs (DRAFT+ACTIVE) | Pas de résolution locataire → bail ACTIVE |
| WhatsApp Meta 401 | Texte d’échec générique | Pas de mapping auth Meta |
| Docs « lis la clause » | Métadonnées Prisma seulement | OCR/RAG NOT_SUPPORTED (honnête) |

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

### J0 — Confirm NL + Vision soft-fail + bail par nom (P0) — **en cours**
- « oui / confirme / crée le PDF / vas-y » → `confirmAction(latest pending)`
- Vision : try/catch + rejet PDF non-image → 200 message clair
- « contrat PDF de \<locataire\> » → propose le bail ACTIVE le plus pertinent

**AT client :** Après proposition contrat, « oui crée le PDF » → PDF réel, pas dump parc.

### J1 — Capability router avant fallback
Ambiguous court + pending / lastIntent propose* → jamais portfolio.

### J2 — Knowledge layer
Un seul pack injecté dans ASSISTANT_PROMPT + clarifications locales (OCR non, WA media non, confirm obligatoire).

### J3 — Vision métier
Photo → constat + proposition ticket maintenance / agent (tools existants), pas « NOT_SUPPORTED ».

### J4 — Document pipeline
Upload PDF → extract (buffer/OCR quand dispo) → index facts → ask/compare.  
Honnêteté : tant qu’OCR PDF n’existe pas, message clair + faits Prisma.

### J5 — WhatsApp parcours réel
IA → confirm → Meta → providerMessageId → statut ; 401 = « token Meta invalide ».

### J6 — Scénarios client E2E (pas tool unit)
1. Photo fuite → constat → logement → bail → rapport PDF → proposer envoi agent  
2. Contrat PDF → loyer / échéance / durée / résiliation / anomalies → relance WhatsApp impayé  

## Règle d’or

Prisma / tools = vérité. Mémoire = préférences. Propose → confirm pour toute action sensible. Zéro fake PASS.
