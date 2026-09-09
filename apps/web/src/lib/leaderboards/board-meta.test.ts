import { describe, expect, it } from 'vitest';
import { BOARDS, boardHref, boardMeta, hasCompetitiveEvidence, podiumStyle } from './board-meta';

describe('board metadata', () => {
  it('covers exactly the three published categories', () => {
    expect(BOARDS.map((b) => b.category)).toEqual(['players', 'community', 'clubs']);
  });

  it('keeps the contributors tab label and the Community Champions title distinct', () => {
    // Deliberate (§1P): the tab is wayfinding, the heading is identity. Both live in this module so
    // the entry card, the tab strip and the panel cannot drift apart.
    const community = boardMeta('community');
    expect(community.tabLabel).toBe('Top Contributors');
    expect(community.title).toBe('Community Champions');
  });

  it('keeps the locked line stating what the contributors board ranks', () => {
    expect(boardMeta('community').subtitle).toContain('vouches given');
  });

  it('gives every board a subtitle, a call to action, a unit and a hook', () => {
    for (const board of BOARDS) {
      expect(board.subtitle.length).toBeGreaterThan(0);
      expect(board.cta.href.startsWith('/')).toBe(true);
      expect(board.cta.label.length).toBeGreaterThan(0);
      expect(board.unit.length).toBeGreaterThan(0);
      expect(board.hook.length).toBeGreaterThan(0);
    }
  });

  it('uses no em dashes in board copy', () => {
    // Copy rule from master_plan §1C.
    for (const board of BOARDS) {
      const copy = `${board.tabLabel}${board.title}${board.subtitle}${board.cta.label}${board.hook}`;
      expect(copy).not.toContain('—');
    }
  });

  it('falls back to the players board for an unknown category', () => {
    expect(boardMeta('nope' as never).category).toBe('players');
  });

  it('gives every board its own shareable url', () => {
    expect(boardHref('community')).toBe('/leaderboards?category=community');
    const hrefs = BOARDS.map((b) => boardHref(b.category));
    expect(new Set(hrefs).size).toBe(BOARDS.length);
  });
});

describe('podium styling', () => {
  it('names a medal for each of the top three', () => {
    expect(podiumStyle(1)?.medal).toBe('Gold');
    expect(podiumStyle(2)?.medal).toBe('Silver');
    expect(podiumStyle(3)?.medal).toBe('Bronze');
  });

  it('has no styling beyond third place', () => {
    expect(podiumStyle(4)).toBeNull();
    expect(podiumStyle(0)).toBeNull();
  });
});

describe('competitive evidence gate', () => {
  // The live defect: 31 ranked players, every one with participation 0 and placement 0, ordered by
  // profile completeness under a heading promising verified tournament play.
  const noEvidence = [
    { components: { profile: 1, skillVerified: 1, participation: 0, placement: 0 } },
    { components: { profile: 1, skillVerified: 0, participation: 0, placement: 0 } },
  ];

  it('withholds the players board when nobody has played or placed', () => {
    expect(hasCompetitiveEvidence('players', noEvidence)).toBe(false);
  });

  it('opens the players board as soon as one entry has a verified tournament', () => {
    expect(
      hasCompetitiveEvidence('players', [
        ...noEvidence,
        { components: { profile: 1, skillVerified: 0, participation: 1, placement: 0 } },
      ]),
    ).toBe(true);
  });

  it('opens the players board on an official placement alone', () => {
    expect(
      hasCompetitiveEvidence('players', [
        { components: { profile: 1, skillVerified: 0, participation: 0, placement: 6 } },
      ]),
    ).toBe(true);
  });

  it('withholds an empty players board rather than claiming evidence', () => {
    expect(hasCompetitiveEvidence('players', [])).toBe(false);
  });

  it('never gates contributors or clubs, which are earned from the first row', () => {
    expect(hasCompetitiveEvidence('community', noEvidence)).toBe(true);
    expect(hasCompetitiveEvidence('clubs', [])).toBe(true);
  });

  it('treats a missing component as zero rather than throwing', () => {
    expect(hasCompetitiveEvidence('players', [{ components: {} }])).toBe(false);
  });
});
