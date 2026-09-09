import { describe, expect, it } from 'vitest';
import { canonicalRank, moveDivision, positionsFor, sortDivisions } from './division-order';
import type { OrderableDivision } from './division-order';

function d(over: Partial<OrderableDivision> & { id: string }): OrderableDivision {
  return {
    displayOrder: null,
    minimumSkill: 1,
    maximumSkill: 1,
    sexClassification: 'men',
    format: 'doubles',
    name: over.id,
    ...over,
  };
}

/** The exact shape a fresh tournament has: fifteen rows, one insert, one timestamp. */
function starterSet(): OrderableDivision[] {
  const out: OrderableDivision[] = [];
  for (const skill of [1, 2, 3, 4, 5]) {
    for (const sex of ['men', 'women', 'mixed']) {
      out.push(
        d({
          id: `${sex}-${skill}`,
          minimumSkill: skill,
          maximumSkill: skill,
          sexClassification: sex,
          name: `${sex} ${skill}`,
        }),
      );
    }
  }
  return out;
}

describe('sortDivisions - canonical order', () => {
  it('puts the easiest bracket first and Men, Women, Mixed inside it', () => {
    const shuffled = [...starterSet()].reverse();
    expect(
      sortDivisions(shuffled)
        .map((x) => x.id)
        .slice(0, 6),
    ).toEqual(['men-1', 'women-1', 'mixed-1', 'men-2', 'women-2', 'mixed-2']);
  });

  it('ends on the hardest bracket', () => {
    expect(sortDivisions(starterSet()).at(-1)?.id).toBe('mixed-5');
  });

  it('is stable: sorting an already sorted list changes nothing', () => {
    const once = sortDivisions(starterSet());
    expect(sortDivisions(once).map((x) => x.id)).toEqual(once.map((x) => x.id));
  });

  it('does not mutate the input', () => {
    const input = starterSet();
    const before = input.map((x) => x.id);
    sortDivisions(input);
    expect(input.map((x) => x.id)).toEqual(before);
  });

  it('breaks ties on name then id so the order never flickers', () => {
    const a = d({ id: 'zzz', name: 'Same' });
    const b = d({ id: 'aaa', name: 'Same' });
    expect(sortDivisions([a, b]).map((x) => x.id)).toEqual(['aaa', 'zzz']);
  });

  it('sorts an unbounded division last rather than first', () => {
    const open = d({ id: 'open', minimumSkill: null, maximumSkill: null, name: 'Open' });
    const beginner = d({ id: 'beg', minimumSkill: 1, maximumSkill: 1 });
    expect(sortDivisions([open, beginner]).map((x) => x.id)).toEqual(['beg', 'open']);
  });

  it('sorts an unrecognised classification after mixed, never between the three', () => {
    const rows = [
      d({ id: 'weird', sexClassification: 'coed' }),
      d({ id: 'mixed', sexClassification: 'mixed' }),
      d({ id: 'men', sexClassification: 'men' }),
    ];
    expect(sortDivisions(rows).map((x) => x.id)).toEqual(['men', 'mixed', 'weird']);
  });

  it('puts singles before doubles within one band', () => {
    const rows = [d({ id: 'dbl', format: 'doubles' }), d({ id: 'sgl', format: 'singles' })];
    expect(sortDivisions(rows).map((x) => x.id)).toEqual(['sgl', 'dbl']);
  });

  it('falls back to maximumSkill when there is no minimum', () => {
    expect(canonicalRank(d({ id: 'x', minimumSkill: null, maximumSkill: 2 }))[0]).toBe(2);
  });
});

describe('sortDivisions - organizer order', () => {
  it('honours an explicit position over the canonical one', () => {
    const rows = [
      d({ id: 'mixed-5', minimumSkill: 5, sexClassification: 'mixed', displayOrder: 0 }),
      d({ id: 'men-1', minimumSkill: 1, sexClassification: 'men', displayOrder: 1 }),
    ];
    expect(sortDivisions(rows).map((x) => x.id)).toEqual(['mixed-5', 'men-1']);
  });

  it('appends unpositioned divisions after positioned ones', () => {
    const rows = [
      d({ id: 'new', minimumSkill: 1 }),
      d({ id: 'placed', minimumSkill: 5, displayOrder: 0 }),
    ];
    expect(sortDivisions(rows).map((x) => x.id)).toEqual(['placed', 'new']);
  });

  it('orders several unpositioned divisions canonically among themselves', () => {
    const rows = [
      d({ id: 'placed', displayOrder: 0, minimumSkill: 5 }),
      d({ id: 'mixed-2', minimumSkill: 2, sexClassification: 'mixed' }),
      d({ id: 'men-2', minimumSkill: 2, sexClassification: 'men' }),
    ];
    expect(sortDivisions(rows).map((x) => x.id)).toEqual(['placed', 'men-2', 'mixed-2']);
  });

  it('treats position 0 as a real position, not as absent', () => {
    const rows = [d({ id: 'b', displayOrder: 1 }), d({ id: 'a', displayOrder: 0 })];
    expect(sortDivisions(rows).map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('positionsFor', () => {
  it('numbers the list densely from zero', () => {
    expect(positionsFor([d({ id: 'a' }), d({ id: 'b' })])).toEqual([
      { id: 'a', displayOrder: 0 },
      { id: 'b', displayOrder: 1 },
    ]);
  });
});

describe('moveDivision', () => {
  const rows = [d({ id: 'a' }), d({ id: 'b' }), d({ id: 'c' })];

  it('moves one place up', () => {
    expect(moveDivision(rows, 'c', 'up').map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });

  it('moves one place down', () => {
    expect(moveDivision(rows, 'a', 'down').map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('leaves the top row alone when moved up', () => {
    expect(moveDivision(rows, 'a', 'up').map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('leaves the bottom row alone when moved down', () => {
    expect(moveDivision(rows, 'c', 'down').map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('ignores an id that is not in the list', () => {
    expect(moveDivision(rows, 'nope', 'up').map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input', () => {
    const input = [d({ id: 'a' }), d({ id: 'b' })];
    moveDivision(input, 'b', 'up');
    expect(input.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
