/**
 * The order divisions are shown in (master_plan §2C).
 *
 * Divisions were listed by `created_at`, which is not an order at all: the fifteen starter
 * divisions are written in ONE insert, so they share a timestamp to the microsecond and the
 * database is free to return them in any sequence it likes. That is why a freshly created
 * tournament showed Advanced above Beginner.
 *
 * The canonical order is the one a player reads down a printed entry form: easiest bracket first,
 * and inside each bracket Men, Women, Mixed. It is the same order `buildDefaultDivisionPreset`
 * already generates - this module is what makes it survive a round trip through the database.
 *
 * An organizer can override it per tournament; `displayOrder` wins wherever it is set.
 */

/** Men before Women before Mixed. Anything unrecognised sorts after all three, never between. */
const SEX_RANK: Record<string, number> = { men: 0, women: 1, mixed: 2, open: 3 };

/** Singles, then doubles, then anything else - narrower events first within a band. */
const FORMAT_RANK: Record<string, number> = { singles: 0, doubles: 1 };

export interface OrderableDivision {
  id: string;
  /** Organizer's explicit position. Null means "use the canonical order". */
  displayOrder?: number | null;
  minimumSkill: number | null;
  maximumSkill: number | null;
  sexClassification: string;
  format: string;
  name: string;
}

function rankOf(map: Record<string, number>, key: string, fallback: number): number {
  return map[key] ?? fallback;
}

/**
 * Sort key for a division with no explicit position. Skill first, because "which bracket am I?" is
 * the question a player answers before any other.
 *
 * A division with no minimum skill (an Open bracket) sorts to the very end rather than the front:
 * an unbounded event is not the easiest one, and putting it first buries the beginner brackets a
 * new player is looking for.
 */
export function canonicalRank(d: OrderableDivision): [number, number, number, number] {
  const skill = d.minimumSkill ?? d.maximumSkill ?? Number.MAX_SAFE_INTEGER;
  return [skill, rankOf(SEX_RANK, d.sexClassification, 9), rankOf(FORMAT_RANK, d.format, 9), 0];
}

/**
 * Order a tournament's divisions for display.
 *
 * Explicitly positioned divisions come first, in the organizer's order; everything else follows in
 * canonical order. That way adding a division to a hand-ordered tournament appends it somewhere
 * sensible instead of silently landing at position zero.
 *
 * Ties break on name and then id, so the list can never reshuffle between two renders of identical
 * data - a list that changes order on refresh reads as a bug even when every row is correct.
 */
export function sortDivisions<T extends OrderableDivision>(divisions: readonly T[]): T[] {
  return [...divisions].sort((a, b) => {
    const aHas = a.displayOrder != null;
    const bHas = b.displayOrder != null;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas && bHas && a.displayOrder !== b.displayOrder) {
      return (a.displayOrder as number) - (b.displayOrder as number);
    }
    if (!aHas && !bHas) {
      const ra = canonicalRank(a);
      const rb = canonicalRank(b);
      for (let i = 0; i < ra.length; i += 1) {
        if (ra[i] !== rb[i]) return (ra[i] as number) - (rb[i] as number);
      }
    }
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id);
  });
}

/**
 * The positions to persist when an organizer resets a tournament to the canonical order, or when
 * a reorder is saved. Positions are dense and zero-based so a later "move up" is a simple swap.
 */
export function positionsFor<T extends OrderableDivision>(
  ordered: readonly T[],
): { id: string; displayOrder: number }[] {
  return ordered.map((d, i) => ({ id: d.id, displayOrder: i }));
}

/**
 * Move one division one place up or down, returning the full new order.
 *
 * Returns the list unchanged when the division is already at the end it is being moved towards, so
 * a caller can compare identity to decide whether a write is needed at all.
 */
export function moveDivision<T extends OrderableDivision>(
  ordered: readonly T[],
  id: string,
  direction: 'up' | 'down',
): T[] {
  const from = ordered.findIndex((d) => d.id === id);
  if (from < 0) return [...ordered];
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= ordered.length) return [...ordered];
  const next = [...ordered];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}
