# GO-MATCH-QUALITY-21 — préparation de la CI PostgreSQL 16

Date : 2026-10-21. Vérification seulement. Aucun commit, push, pull request, ni workflow lancé. L’arbre d’origine et `main` restent à `5b00026`.

PostgreSQL 16 : **toujours non validé**.

## Workflow

`.github/workflows/ci.yml` du worktree est celui de `5b00026`. Il n’a pas été modifié.

- Image : `postgres:16-alpine`
- Base : `immo_tec_test`, port `5432`, utilisateur `immotec`
- `RUN_DB_TESTS=true`
- `DATABASE_URL` pointe vers cette base locale du runner
- Étapes : `npm ci`, `prisma generate`, `prisma migrate deploy`, `prisma db seed`, `npm test -- --coverage --coverageReporters=text-summary --runInBand`, `npm run build`
- Déclenchement : `push` sur `main` ou `master`, ou `pull_request` vers `main` ou `master`
- Pas de `workflow_dispatch`

Pousser `validate-q14-pg16` seul ne lance pas ce job. Il faut une pull request dont la base est `main`.

`tests/setup.ts` ne remplace pas une `DATABASE_URL` déjà posée. Il force `INTELLIGENCE_MATCHING_ENABLED=true`. La garde du test d’intégration accepte exactement cet hôte local, cette base et ce port quand `RUN_DB_TESTS=true`, et refuse `Q11_EPHEMERAL_PG=1`. La CI remplit ces conditions. `beforeAll` exige ensuite que `version()` commence par `PostgreSQL 16`, avant toute insertion.

`npm test` prend `**/*.test.ts`. Le fichier d’intégration sera donc exécuté, une fois qu’il est dans le commit checkout. Aujourd’hui il est non suivi : le commit `5b00026` ne le contient pas.

## Fichiers à committer, pas encore commités

Les 14 fichiers Quality-17, avec la correction Quality-20 déjà dans le test unitaire :

- `src/modules/intelligence/eligibility.ts`
- `src/modules/intelligence/matching.routes.ts`
- `src/modules/intelligence/matching.schema.ts`
- `src/modules/intelligence/matching.service.ts`
- `src/modules/intelligence/normalizer.ts`
- `src/modules/intelligence/retrieval.ts`
- `src/modules/intelligence/scorer.ts`
- `src/modules/intelligence/types.ts`
- `src/modules/intelligence/sql-keyset.ts`
- `src/modules/intelligence/quality-eval.ts`
- `src/modules/intelligence/gold/quality-q1.ts`
- `tests/unit/intelligence.match-quality-q1.test.ts`
- `tests/unit/intelligence.match-keyset-q14.test.ts`
- `tests/integration/intelligence.matching-pg16-q16.test.ts`

Les rapports `qa-e2e/GO-MATCH-QUALITY-18` à `21` ne font pas partie de cette liste. `node_modules` est une jonction ignorée.

## Scénarios que la CI exécutera

Si le commit ci-dessus est sur la pull request :

- A. Filtres stricts, exclusion hors du SQL, préférence qui ne retire pas les autres quartiers.
- B. Ordre loyer / date / identifiant. Les dates nulles sont observées, pas imposées. Le journal doit contenir `q16 null publishedAt placement=`.
- C. Plus de 10 000 lignes : `sqlMatchCount` et `sqlFetchCount` à 10 002, deux lots, parcours `complete`, aucun quartier exclu, le préféré plus cher classé devant.

Le journal doit aussi contenir `q16 engine=PostgreSQL 16`.

## Ce que cette CI ne prouvera pas

Le fichier d’intégration n’a pas de scénario d’erreur de lot. `it` A, B et C seulement. La propagation `lot intermédiaire` est couverte par le test unitaire E, sur un Prisma simulé. Une lecture qui échoue au milieu d’un lot PostgreSQL 16 réel n’est pas dans cette suite.

Quality-14 ne sera donc pas entièrement validé après cette CI. Le seront : l’ordre, le dépassement de 10 000 et le classement, sur le moteur 16. L’erreur de lot réelle restera ouverte.

## État local déjà connu

Quality-20, dans ce worktree : 16 tests unitaires réussis, 3 tests PostgreSQL ignorés, 0 échec. Rappel Q1 0,6667, nDCG 1. Ce n’est pas une preuve PostgreSQL.

## Autorisation encore nécessaire

1. Commit sur `validate-q14-pg16`, limité aux 14 fichiers. Pas de `git add .`.
2. Push de cette branche.
3. Pull request vers `main`, sans merger.

Aucune de ces trois actions n’est faite.
