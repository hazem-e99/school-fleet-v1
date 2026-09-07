import { Model, FilterQuery } from 'mongoose';

/**
 * Shared server-side pagination.
 *
 * Before this, the only paginated endpoint in the codebase was
 * BusesService.getAll, which hand-rolled skip/limit with a default pageSize of
 * 1000 — effectively "load everything". Every admin list (children overview,
 * guardians overview, payments, subscriptions) loads whole collections and
 * paginates in the browser.
 *
 * The existing ApiResponse envelope already carries a `count` field, so
 * paginated endpoints stay wire-compatible with the current clients: `data`
 * is the page, `count` is the TOTAL matching documents (not the page length).
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PaginationParams {
  /** 1-based. Values below 1 are coerced to 1. */
  page: number;
  /** Clamped to 1..MAX_PAGE_SIZE. */
  pageSize: number;
  skip: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Parses raw query strings into safe pagination params.
 *
 * Note `page` is 1-based here. BusesService.getAll currently treats page as
 * 0-based (`skip(page * pageSize)`); that endpoint keeps its existing
 * behaviour so its callers don't shift by a page — new endpoints use this
 * helper and are 1-based.
 */
export function parsePagination(page?: string | number, pageSize?: string | number): PaginationParams {
  const rawPage = typeof page === 'string' ? parseInt(page, 10) : page;
  const rawSize = typeof pageSize === 'string' ? parseInt(pageSize, 10) : pageSize;

  const safePage = Number.isFinite(rawPage as number) && (rawPage as number) > 0 ? Math.floor(rawPage as number) : 1;
  const requestedSize =
    Number.isFinite(rawSize as number) && (rawSize as number) > 0
      ? Math.floor(rawSize as number)
      : DEFAULT_PAGE_SIZE;
  const safeSize = Math.min(requestedSize, MAX_PAGE_SIZE);

  return { page: safePage, pageSize: safeSize, skip: (safePage - 1) * safeSize };
}

/**
 * Runs a filtered, paginated query plus its count in parallel.
 *
 * `sort` accepts a Mongoose sort object; pass a stable tiebreaker (e.g.
 * `{ createdAt: -1, _id: -1 }`) for deterministic paging, since MongoDB does
 * not guarantee order for equal sort keys across pages.
 */
export async function paginateQuery<T>(
  model: Model<T>,
  filter: FilterQuery<T>,
  params: PaginationParams,
  sort: Record<string, 1 | -1> = { createdAt: -1 },
): Promise<PaginatedResult<T>> {
  const [data, total] = await Promise.all([
    model.find(filter).sort(sort).skip(params.skip).limit(params.pageSize).exec(),
    model.countDocuments(filter).exec(),
  ]);

  return { data: data as T[], total, page: params.page, pageSize: params.pageSize };
}
