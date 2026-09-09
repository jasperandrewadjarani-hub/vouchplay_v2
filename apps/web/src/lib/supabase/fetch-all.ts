import 'server-only';

/**
 * Fetch EVERY row of a PostgREST query, paging past the server's per-response row cap.
 *
 * PostgREST returns at most ~1000 rows per request regardless of `.limit()` - the limit is silently
 * clamped (verified in production: a `.limit(5000)` on 1,457 rows returned `content-range: 0-999/1457`).
 * The leaderboard builder relied on `.limit(bound)` plus a "did we get fewer than the count?"
 * truncation guard, so the moment a source table crossed 1,000 rows the guard threw and the whole
 * rebuild died (master_plan §2I). This pages with `.range()` until every row is in hand.
 *
 * `makePage(from, to)` MUST return a query with `{ count: 'exact' }`, a STABLE total order (so pages
 * do not skip or repeat rows), and `.range(from, to)`. Fetching stops at `cap` rows; `capped` is true
 * when the table genuinely holds more than the caller's bound, which the caller treats as an overload
 * rather than silently ranking a partial set.
 */
export interface PageResult<T> {
  data: T[] | null;
  error: { message?: string; code?: string; details?: string } | null;
  count: number | null;
}

const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  makePage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  cap: number,
  label = 'source',
): Promise<{ rows: T[]; count: number; capped: boolean }> {
  const rows: T[] = [];
  let count = 0;
  for (let from = 0; from < cap; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, cap) - 1;
    const { data, error, count: c } = await makePage(from, to);
    if (error)
      throw new Error(
        `${label}_read_failed: ${error.message ?? 'unknown'}` +
          `${error.code ? ` [${error.code}]` : ''}${error.details ? ` - ${error.details}` : ''}`,
      );
    if (c !== null && c !== undefined) count = c;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break; // last page reached
  }
  return { rows, count, capped: count > rows.length };
}
