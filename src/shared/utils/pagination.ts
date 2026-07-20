/**
 * Pagination offset/limit pour listes API.
 */
export interface PaginationInput {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function parsePagination(input: PaginationInput, defaults = { page: 1, limit: 20, maxLimit: 100 }) {
  const page = Math.max(1, Number(input.page) || defaults.page);
  const limit = Math.min(defaults.maxLimit, Math.max(1, Number(input.limit) || defaults.limit));
  const skip = (page - 1) * limit;
  return { page, limit, skip, take: limit };
}

export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
