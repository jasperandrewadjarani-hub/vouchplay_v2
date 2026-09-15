import { describe, expect, it } from 'vitest';
import {
  badgeProgressFor,
  evaluateAutoBadges,
  pickCardOrder,
  type AutoBadgeInput,
  type BadgeRuleSettings,
  type PlayerBadgeFacts,
} from './rules';

const NOW = new Date('2026-09-15T00:00:00Z');

const SETTINGS: BadgeRuleSettings = {
  championWindowMonths: 12,
  legendMinTitles: 3,
  podiumWindowMonths: 12,
  regularMinEvents: 5,
  regularLevel2Events: 15,
  regularLevel3Events: 30,
  topContributorSize: 10,
  trustedVoiceMinVouches: 25,
  pioneerCutoff: 100,
  matchmakerMinEntered: 3,
  risingTopN: 10,
  risingMinClimb: 3,
  risingDays: 30,
  levelUpDays: 30,
  provenMinVouchers: 15,
  tierCrownMinVouchers: 5,
  organizerMinTournaments: 1,
};

const EMPTY_FACTS: PlayerBadgeFacts = {
  officialResults: [],
  completedTournamentEntries: 0,
  standingVouchesGiven: 0,
  onboardedAt: null,
  existingPioneerNumber: null,
  clubCaptain: false,
  enteredPartnerMatches: 0,
  playersMomentum: null,
  communityContributionRank: null,
  communityLevel: null,
  communityLevelSeen: null,
  levelUpAt: null,
  uniqueVouchers: 0,
  sts: null,
  communityBand: null,
  communityRatingPrivate: false,
  isCoach: false,
  isOrganizer: false,
  ownedNonDraftTournaments: 0,
  commemorativeEntries: [],
};

function inputOf(facts: Record<string, Partial<PlayerBadgeFacts>>): AutoBadgeInput {
  const map: AutoBadgeInput = new Map();
  for (const [id, patch] of Object.entries(facts)) map.set(id, { ...EMPTY_FACTS, ...patch });
  return map;
}

function keysFor(result: Map<string, { key: string }[]>, playerId: string): string[] {
  return (result.get(playerId) ?? []).map((b) => b.key).sort();
}

describe('evaluateAutoBadges - Glory (official results)', () => {
  it('awards Champion with a tally and window expiry, and ignores an out-of-window win', () => {
    const input = inputOf({
      p1: {
        officialResults: [
          {
            placement: '1st',
            titleKey: 'champion',
            issuedAt: '2026-08-01T00:00:00Z',
            tournamentName: 'Rise of Empires',
            divisionName: 'Open Doubles',
          },
          {
            placement: '1st',
            titleKey: 'champion',
            issuedAt: '2024-01-01T00:00:00Z',
            tournamentName: 'Old Cup',
            divisionName: null,
          },
        ],
      },
    });
    const result = evaluateAutoBadges(input, SETTINGS, NOW);
    const champion = result.get('p1')!.find((b) => b.key === 'champion')!;
    expect(champion.tally).toBe(1);
    expect(champion.meta).toEqual({ event: 'Rise of Empires', division: 'Open Doubles' });
    expect(champion.expiresAt).toBe('2027-08-01T00:00:00.000Z');
  });

  it('never awards Champion once the only title has aged out of the window', () => {
    const input = inputOf({
      p1: {
        officialResults: [
          {
            placement: '1st',
            titleKey: 'champion',
            issuedAt: '2025-01-01T00:00:00Z',
            tournamentName: 'Old Cup',
            divisionName: null,
          },
        ],
      },
    });
    const result = evaluateAutoBadges(input, SETTINGS, NOW);
    expect(keysFor(result, 'p1')).not.toContain('champion');
  });

  it('awards Legend at the all-time title threshold, permanently, regardless of window', () => {
    const input = inputOf({
      p1: {
        officialResults: [
          {
            placement: '1st',
            titleKey: 'champion',
            issuedAt: '2020-01-01T00:00:00Z',
            tournamentName: 'A',
            divisionName: null,
          },
          {
            placement: '1st',
            titleKey: 'champion',
            issuedAt: '2021-01-01T00:00:00Z',
            tournamentName: 'B',
            divisionName: null,
          },
          {
            placement: '1st',
            titleKey: 'champion',
            issuedAt: '2022-01-01T00:00:00Z',
            tournamentName: 'C',
            divisionName: null,
          },
        ],
      },
    });
    const result = evaluateAutoBadges(input, SETTINGS, NOW);
    const legend = result.get('p1')!.find((b) => b.key === 'legend')!;
    expect(legend.tally).toBe(3);
    expect(legend.expiresAt).toBeNull();
    // Legend does not suppress Champion inside the RULE output - card display order does that.
  });

  it('picks the best medal for Podium from the most recent in-window placement', () => {
    const input = inputOf({
      p1: {
        officialResults: [
          {
            placement: '3rd',
            titleKey: 'bronze',
            issuedAt: '2026-01-01T00:00:00Z',
            tournamentName: 'A',
            divisionName: null,
          },
          {
            placement: '2nd',
            titleKey: 'runner_up',
            issuedAt: '2026-06-01T00:00:00Z',
            tournamentName: 'B',
            divisionName: 'Mixed',
          },
        ],
      },
    });
    const result = evaluateAutoBadges(input, SETTINGS, NOW);
    const podium = result.get('p1')!.find((b) => b.key === 'podium')!;
    expect(podium.tally).toBe(2);
    expect(podium.meta.medal).toBe('silver');
    expect(podium.meta.event).toBe('B');
  });

  it('awards MVP / Fair Play permanently from an all-time official award, never from a peer claim', () => {
    const input = inputOf({
      p1: {
        officialResults: [
          {
            placement: null,
            titleKey: 'mvp',
            issuedAt: '2022-01-01T00:00:00Z',
            tournamentName: 'A',
            divisionName: null,
          },
          {
            placement: null,
            titleKey: 'sportsmanship',
            issuedAt: '2022-01-01T00:00:00Z',
            tournamentName: 'A',
            divisionName: null,
          },
        ],
      },
    });
    const result = evaluateAutoBadges(input, SETTINGS, NOW);
    expect(keysFor(result, 'p1')).toEqual(expect.arrayContaining(['mvp', 'fairplay']));
    expect(result.get('p1')!.find((b) => b.key === 'mvp')!.expiresAt).toBeNull();
  });
});

describe('evaluateAutoBadges - Tour Regular levels', () => {
  it.each([
    [4, false, undefined],
    [5, true, 1],
    [15, true, 2],
    [30, true, 3],
  ])('at %i completed entries -> awarded=%s level=%s', (n, awarded, level) => {
    const input = inputOf({ p1: { completedTournamentEntries: n } });
    const result = evaluateAutoBadges(input, SETTINGS, NOW);
    const regular = result.get('p1')!.find((b) => b.key === 'regular');
    expect(Boolean(regular)).toBe(awarded);
    if (regular) expect(regular.meta.level).toBe(level);
  });
});

describe('evaluateAutoBadges - Community', () => {
  it('awards Top Contributor only inside the board size and drops out once past it', () => {
    const inRange = inputOf({ p1: { communityContributionRank: 10 } });
    const outOfRange = inputOf({ p1: { communityContributionRank: 11 } });
    expect(keysFor(evaluateAutoBadges(inRange, SETTINGS, NOW), 'p1')).toContain('top_contributor');
    expect(keysFor(evaluateAutoBadges(outOfRange, SETTINGS, NOW), 'p1')).not.toContain(
      'top_contributor',
    );
  });

  it('awards Trusted Voice at the vouches-given threshold', () => {
    const input = inputOf({ p1: { standingVouchesGiven: 25 }, p2: { standingVouchesGiven: 24 } });
    const result = evaluateAutoBadges(input, SETTINGS, NOW);
    expect(keysFor(result, 'p1')).toContain('trusted_voice');
    expect(keysFor(result, 'p2')).not.toContain('trusted_voice');
  });

  it('awards Club Captain and Matchmaker from their own flags/counts', () => {
    const input = inputOf({
      p1: { clubCaptain: true, enteredPartnerMatches: 3 },
      p2: { clubCaptain: false, enteredPartnerMatches: 2 },
    });
    const result = evaluateAutoBadges(input, SETTINGS, NOW);
    expect(keysFor(result, 'p1')).toEqual(expect.arrayContaining(['captain', 'matchmaker']));
    expect(keysFor(result, 'p2')).not.toContain('captain');
    expect(keysFor(result, 'p2')).not.toContain('matchmaker');
  });

  describe('Pioneer numbering', () => {
    it('keeps existing numbers untouched and never reassigns them', () => {
      const input = inputOf({
        p1: { existingPioneerNumber: 1, onboardedAt: '2026-01-01T00:00:00Z' },
        p2: { existingPioneerNumber: 2, onboardedAt: '2026-01-02T00:00:00Z' },
      });
      const result = evaluateAutoBadges(input, { ...SETTINGS, pioneerCutoff: 2 }, NOW);
      expect(result.get('p1')!.find((b) => b.key === 'pioneer')!.meta.number).toBe(1);
      expect(result.get('p2')!.find((b) => b.key === 'pioneer')!.meta.number).toBe(2);
    });

    it('assigns new numbers in onboarded-order only while under the cutoff, and stops issuing at it', () => {
      const input = inputOf({
        p1: { existingPioneerNumber: 5, onboardedAt: '2026-01-01T00:00:00Z' },
        p2: { onboardedAt: '2026-01-03T00:00:00Z' },
        p3: { onboardedAt: '2026-01-02T00:00:00Z' },
        p4: { onboardedAt: '2026-01-04T00:00:00Z' },
      });
      // cutoff 2, 1 already issued (#5) -> exactly 1 more slot; earliest-onboarded unnumbered wins it.
      const result = evaluateAutoBadges(input, { ...SETTINGS, pioneerCutoff: 2 }, NOW);
      expect(result.get('p3')!.find((b) => b.key === 'pioneer')!.meta.number).toBe(6);
      expect(keysFor(result, 'p2')).not.toContain('pioneer');
      expect(keysFor(result, 'p4')).not.toContain('pioneer');
    });

    it('issues no new numbers once the cutoff has already been reached', () => {
      const input = inputOf({
        p1: { existingPioneerNumber: 1 },
        p2: { existingPioneerNumber: 2 },
        p3: { onboardedAt: '2026-01-01T00:00:00Z' },
      });
      const result = evaluateAutoBadges(input, { ...SETTINGS, pioneerCutoff: 2 }, NOW);
      expect(keysFor(result, 'p3')).not.toContain('pioneer');
    });
  });
});

describe('evaluateAutoBadges - Growth', () => {
  it('awards Rising to the top climbers only, respecting the minimum climb and top-N cap', () => {
    const input = inputOf({
      big: { playersMomentum: { privateRank: 5, previousRank: 20 } }, // climbed 15
      small: { playersMomentum: { privateRank: 40, previousRank: 41 } }, // climbed 1, below min
      none: { playersMomentum: null },
    });
    const result = evaluateAutoBadges(input, SETTINGS, NOW);
    expect(keysFor(result, 'big')).toContain('rising');
    expect(keysFor(result, 'small')).not.toContain('rising');
    expect(keysFor(result, 'none')).not.toContain('rising');
    const rising = result.get('big')!.find((b) => b.key === 'rising')!;
    expect(rising.expiresAt).toBe(new Date(NOW.getTime() + 30 * 86400000).toISOString());
  });

  it('caps Rising at the configured top N climbers', () => {
    const facts: Record<string, Partial<PlayerBadgeFacts>> = {};
    for (let i = 0; i < 15; i += 1) {
      facts[`p${i}`] = { playersMomentum: { privateRank: 100 - i, previousRank: 200 - i } };
    }
    const result = evaluateAutoBadges(inputOf(facts), { ...SETTINGS, risingTopN: 3 }, NOW);
    const winners = Object.keys(facts).filter((id) => keysFor(result, id).includes('rising'));
    expect(winners).toHaveLength(3);
  });

  it('Level Up fires on the run a rise is detected and expires after the configured window', () => {
    const justRose = inputOf({
      p1: { communityLevel: 4, communityLevelSeen: 3, levelUpAt: null },
    });
    const result = evaluateAutoBadges(justRose, SETTINGS, NOW);
    const badge = result.get('p1')!.find((b) => b.key === 'level_up')!;
    expect(badge.expiresAt).toBe(new Date(NOW.getTime() + 30 * 86400000).toISOString());
  });

  it('Level Up stays active mid-window from a stamped levelUpAt and stops once past it', () => {
    const midWindow = inputOf({
      p1: {
        communityLevel: 4,
        communityLevelSeen: 4, // caller already updated the tracker; not a fresh rise this run
        levelUpAt: new Date(NOW.getTime() - 10 * 86400000).toISOString(),
      },
    });
    expect(keysFor(evaluateAutoBadges(midWindow, SETTINGS, NOW), 'p1')).toContain('level_up');

    const expired = inputOf({
      p1: {
        communityLevel: 4,
        communityLevelSeen: 4,
        levelUpAt: new Date(NOW.getTime() - 31 * 86400000).toISOString(),
      },
    });
    expect(keysFor(evaluateAutoBadges(expired, SETTINGS, NOW), 'p1')).not.toContain('level_up');
  });

  it('awards Proven at the unique-vouchers threshold', () => {
    const input = inputOf({ p1: { uniqueVouchers: 15 }, p2: { uniqueVouchers: 14 } });
    const result = evaluateAutoBadges(input, SETTINGS, NOW);
    expect(keysFor(result, 'p1')).toContain('proven');
    expect(keysFor(result, 'p2')).not.toContain('proven');
  });

  describe('Top of Tier (crown)', () => {
    it('crowns the single highest-STS player per band and excludes a private community rating', () => {
      const input = inputOf({
        low: {
          communityBand: 'advanced',
          sts: 3.0,
          uniqueVouchers: 10,
          onboardedAt: '2026-01-01T00:00:00Z',
        },
        high: {
          communityBand: 'advanced',
          sts: 4.5,
          uniqueVouchers: 10,
          onboardedAt: '2026-01-02T00:00:00Z',
        },
        privateRating: {
          communityBand: 'advanced',
          sts: 5,
          uniqueVouchers: 10,
          communityRatingPrivate: true,
          onboardedAt: '2026-01-03T00:00:00Z',
        },
        otherBand: {
          communityBand: 'pro',
          sts: 4.9,
          uniqueVouchers: 10,
          onboardedAt: '2026-01-01T00:00:00Z',
        },
      });
      const result = evaluateAutoBadges(input, SETTINGS, NOW);
      expect(keysFor(result, 'high')).toContain('tier_crown');
      expect(keysFor(result, 'low')).not.toContain('tier_crown');
      expect(keysFor(result, 'privateRating')).not.toContain('tier_crown');
      expect(keysFor(result, 'otherBand')).toContain('tier_crown');
    });

    it('excludes a player below the minimum-vouchers floor even with the highest STS', () => {
      const input = inputOf({
        thin: {
          communityBand: 'advanced',
          sts: 5,
          uniqueVouchers: 1,
          onboardedAt: '2026-01-01T00:00:00Z',
        },
        solid: {
          communityBand: 'advanced',
          sts: 3,
          uniqueVouchers: 5,
          onboardedAt: '2026-01-01T00:00:00Z',
        },
      });
      const result = evaluateAutoBadges(input, SETTINGS, NOW);
      expect(keysFor(result, 'thin')).not.toContain('tier_crown');
      expect(keysFor(result, 'solid')).toContain('tier_crown');
    });

    it('breaks a tie by more unique vouchers, then earlier onboardedAt', () => {
      const input = inputOf({
        a: { communityBand: 'pro', sts: 4, uniqueVouchers: 5, onboardedAt: '2026-02-01T00:00:00Z' },
        b: { communityBand: 'pro', sts: 4, uniqueVouchers: 7, onboardedAt: '2026-03-01T00:00:00Z' },
      });
      const result = evaluateAutoBadges(input, SETTINGS, NOW);
      expect(keysFor(result, 'b')).toContain('tier_crown');
      expect(keysFor(result, 'a')).not.toContain('tier_crown');
    });
  });
});

describe('evaluateAutoBadges - Roles and events', () => {
  it('awards Coach from the role flag alone', () => {
    const input = inputOf({ p1: { isCoach: true } });
    expect(keysFor(evaluateAutoBadges(input, SETTINGS, NOW), 'p1')).toContain('coach');
  });

  it('awards Organizer only once at least one non-draft tournament is owned', () => {
    const input = inputOf({
      p1: { isOrganizer: true, ownedNonDraftTournaments: 0 },
      p2: { isOrganizer: true, ownedNonDraftTournaments: 1 },
    });
    const result = evaluateAutoBadges(input, SETTINGS, NOW);
    expect(keysFor(result, 'p1')).not.toContain('organizer');
    expect(keysFor(result, 'p2')).toContain('organizer');
  });

  it('mints one event badge per commemorative entry, keyed by tournament id', () => {
    const input = inputOf({
      p1: {
        commemorativeEntries: [
          { tournamentId: 't1', label: 'Rise of Empires 2026' },
          { tournamentId: 't2', label: 'Hermosa Open' },
        ],
      },
    });
    const result = evaluateAutoBadges(input, SETTINGS, NOW);
    expect(keysFor(result, 'p1')).toEqual(expect.arrayContaining(['event:t1', 'event:t2']));
  });

  it('never produces a grant-only badge key (og, referee, ambassador, hof, supporter)', () => {
    const input = inputOf({
      p1: {
        isCoach: true,
        isOrganizer: true,
        ownedNonDraftTournaments: 5,
        clubCaptain: true,
        uniqueVouchers: 999,
        standingVouchesGiven: 999,
      },
    });
    const result = evaluateAutoBadges(input, SETTINGS, NOW);
    const keys = keysFor(result, 'p1');
    for (const grantOnly of ['og', 'referee', 'ambassador', 'hof', 'supporter']) {
      expect(keys).not.toContain(grantOnly);
    }
  });
});

describe('pickCardOrder', () => {
  const at = (h: number) => new Date(NOW.getTime() - h * 3600000).toISOString();

  it('orders pinned first, then rarity descending, then newest first', () => {
    const badges = [
      { key: 'captain', awardedAt: at(1) }, // common
      { key: 'trusted_voice', awardedAt: at(2) }, // rare
      { key: 'hof', awardedAt: at(3) }, // legendary
      { key: 'top_contributor', awardedAt: at(4) }, // epic
    ];
    const ordered = pickCardOrder(badges, 'captain');
    expect(ordered.map((b) => b.key)).toEqual([
      'captain',
      'hof',
      'top_contributor',
      'trusted_voice',
    ]);
  });

  it('drops Champion from the card entirely once Legend is also held', () => {
    const badges = [
      { key: 'champion', awardedAt: at(1) },
      { key: 'legend', awardedAt: at(2) },
      { key: 'coach', awardedAt: at(3) },
    ];
    const ordered = pickCardOrder(badges, null);
    expect(ordered.map((b) => b.key)).not.toContain('champion');
    expect(ordered.map((b) => b.key)).toEqual(expect.arrayContaining(['legend', 'coach']));
  });

  it('keeps Champion visible when Legend is not held', () => {
    const badges = [{ key: 'champion', awardedAt: at(1) }];
    expect(pickCardOrder(badges, null).map((b) => b.key)).toContain('champion');
  });
});

describe('badgeProgressFor', () => {
  it('returns up to 3 nearest locked badges, sorted by percent complete, dropping any already at 100%', () => {
    const facts: PlayerBadgeFacts = {
      ...EMPTY_FACTS,
      uniqueVouchers: 15, // Proven already complete -> excluded
      standingVouchesGiven: 20, // 80% of 25
      completedTournamentEntries: 4, // 80% of 5
      communityContributionRank: 12, // outside top 10
      officialResults: [],
    };
    const progress = badgeProgressFor(facts, SETTINGS);
    expect(progress.length).toBeLessThanOrEqual(3);
    expect(progress.some((p) => p.key === 'proven')).toBe(false);
    expect(progress[0]!.pct).toBeGreaterThanOrEqual(progress[progress.length - 1]!.pct);
  });

  it('only surfaces Legend progress once at least one title is already held', () => {
    const noTitles = { ...EMPTY_FACTS, officialResults: [] };
    expect(badgeProgressFor(noTitles, SETTINGS).some((p) => p.key === 'legend')).toBe(false);

    const oneTitle: PlayerBadgeFacts = {
      ...EMPTY_FACTS,
      officialResults: [
        {
          placement: '1st',
          titleKey: 'champion',
          issuedAt: NOW.toISOString(),
          tournamentName: 'A',
          divisionName: null,
        },
      ],
    };
    expect(badgeProgressFor(oneTitle, SETTINGS).some((p) => p.key === 'legend')).toBe(true);
  });

  it('only surfaces Top Contributor progress when the player is ranked at all', () => {
    expect(badgeProgressFor(EMPTY_FACTS, SETTINGS).some((p) => p.key === 'top_contributor')).toBe(
      false,
    );
    const ranked = { ...EMPTY_FACTS, communityContributionRank: 25 };
    expect(badgeProgressFor(ranked, SETTINGS).some((p) => p.key === 'top_contributor')).toBe(true);
  });
});
