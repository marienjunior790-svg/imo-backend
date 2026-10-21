import { AppError } from '../../shared/errors/app.error.js';

/** Ordre stable de la lecture catalogue : loyer croissant, publication décroissante, id croissant. */
export const RENT_KEYSET_ORDER = [
  { rentAmount: 'asc' as const },
  { publishedAt: 'desc' as const },
  { id: 'asc' as const },
];

export type KeysetQuery = {
  take: number;
  cursor?: { id: string };
  skip?: number;
};

/**
 * Lit toutes les pages dans l'ordre fourni par `read`.
 * Le curseur est l'identifiant de la dernière ligne, avec `skip: 1`.
 * Une page plus courte que le lot termine le parcours. Une page vide aussi.
 * Une erreur de `read` se propage : les lignes déjà vues ne sont pas renvoyées.
 */
export async function readKeysetPages<T extends { id: string }>(options: {
  batchSize: number;
  read: (query: KeysetQuery) => Promise<T[]>;
}): Promise<{ rows: T[]; batches: number }> {
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new AppError(500, 'Taille de lot de catalogue invalide', 'MATCH_BATCH_INVALID');
  }

  const rows: T[] = [];
  const seen = new Set<string>();
  let cursor: { id: string } | undefined;
  let batches = 0;

  for (;;) {
    const page = await options.read({
      take: options.batchSize,
      ...(cursor ? { cursor, skip: 1 } : {}),
    });
    batches += 1;
    if (page.length === 0) break;
    for (const row of page) {
      if (seen.has(row.id)) {
        throw new AppError(
          500,
          'Lecture catalogue instable : identifiant répété entre les lots.',
          'MATCH_PAGE_DUPLICATE',
        );
      }
      seen.add(row.id);
      rows.push(row);
    }
    if (page.length < options.batchSize) break;
    const last = page[page.length - 1];
    if (!last) break;
    cursor = { id: last.id };
  }

  return { rows, batches };
}
