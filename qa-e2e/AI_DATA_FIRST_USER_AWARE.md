# Data-First, User-Aware — chemin vérifié

Date: 2026-10-19  
Scope: politique serveur, outils scopés org, structure Fait/Analyse/Estimation, tests d’acceptation  
Prod : **GO reçu** — déploiement Railway `fortunate-beauty` / `imo-backend` (aucune migration Prisma ajoutée)

---

## 1. Critère d’acceptation

Pour toute question relative au portefeuille de l’utilisateur, Intelligence ITC doit justifier ses conclusions à partir des données réelles auxquelles elle a eu accès, ou reconnaître explicitement qu’elle ne dispose pas des informations nécessaires.

---

## 2. Chemin authentification → données → réponse

```
Client (JWT + org active)
  → routes AI (auth middleware)
  → AiService.chat* (organizationId = JWT uniquement)
  → AiContextService.buildContext(organizationId)   // résumé parc / KPI
  et/ou AiToolsService.execute(organizationId, tool, args)
       → stripClientOrganizationIds(args)           // ignore org injectée
       → Prisma / services métier filtrés organizationId
  → LLM (ASSISTANT_PROMPT + DATA_FIRST_PROMPT)
     ou fallback local (buildLocalFallbackReply + formatDataFirstReply)
  → réponse structurée (Fait / Analyse / Recommandation / Estimation / Limite)
```

| Étape | Fichier | Rôle |
|-------|---------|------|
| Politique prompt | `src/modules/ai/ai.data-first.ts` | `DATA_FIRST_PROMPT`, helpers |
| Injection système | `src/modules/ai/ai.service.ts` | `ASSISTANT_PROMPT` += `DATA_FIRST_PROMPT` |
| Contexte org | `src/modules/ai/ai.context.service.ts` | KPI / vacants / impayés scopés + cache TTL |
| Outils | `src/modules/ai/ai.tools.ts` | `execute(orgJwt, …)` + intents locaux |
| Fallback hors LLM | `src/modules/ai/ai.fallback.ts` | vacants structurés + estimation explicite |
| Formules | `src/modules/ai/ai.analytics.math.ts` | `occupancyRatePct`, `remainingXaf`, … |

---

## 3. Sécurité (vérifié en unit)

- `organizationId` outil = argument JWT serveur, jamais celui du client/LLM.
- `stripClientOrganizationIds` retire `organizationId` / `orgId` des args.
- Erreur Prisma/outil → `{ error, code }` ; pas de liste inventée.
- Pas de SQL libre exposé au modèle.

---

## 4. Tests

Fichier : `tests/unit/ai.data-first.test.ts`

| Exigence | Couverture | Résultat |
|----------|------------|----------|
| Réponses fondées sur données org | fallback vacants + contexte mocké | **PASS** |
| Deux orgs → données distinctes | `getVacantUnits` orgA vs orgB | **PASS** |
| Donnée absente non inventée | estimation sans loyers ; liste vide | **PASS** |
| Modif DB → réponse après invalidation | cache + `invalidateOrganization` | **PASS** |
| Formules financières vérifiables | math + `estimateVacancyMonthlyImpact` | **PASS** |
| Erreur API signalée | outil DB down → error/code 500 | **PASS** |
| Questions générales sans data | `Bonjour` → 0 intent outil | **PASS** |

Commande :

```bash
npx jest tests/unit/ai.data-first.test.ts --no-coverage
```

Dernière exécution locale : **17/17 PASS** (2026-10-19).

---

## 5. Limites connues (ne pas sur-déclarer)

- Le chemin LLM complet (provider externe + historique multi-tours) n’est pas mocké end-to-end ici ; la politique est injectée dans le prompt et les outils sont scopés.
- Fallback « impayés » : **parité Data-First** avec vacants depuis GO-BRAIN (2026-10-20) — sections Fait / Analyse / Recommandation / Limite.
- Capacité **non déclarée opérationnelle en production** tant qu’un GO de déploiement backend n’a pas validé le binaire déployé.
- Aucune migration / écriture prod effectuée dans ce lot.

---

## 6. Fichiers créés / modifiés

| Fichier | Change |
|---------|--------|
| `src/modules/ai/ai.data-first.ts` | **créé** — politique + helpers |
| `src/modules/ai/ai.service.ts` | injection `DATA_FIRST_PROMPT` |
| `src/modules/ai/ai.tools.ts` | `stripClientOrganizationIds` avant execute |
| `src/modules/ai/ai.fallback.ts` | vacants via `formatDataFirstReply` + estimation |
| `tests/unit/ai.data-first.test.ts` | **créé** — 17 tests d’acceptation |
| `qa-e2e/AI_DATA_FIRST_USER_AWARE.md` | ce livrable |
