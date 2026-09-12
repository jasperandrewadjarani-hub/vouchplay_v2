import { describe, it, expect, vi } from 'vitest';
import type { ProfileRow } from '@vouchplay/db';
import { ANON_VIEWER, toPlayerCardDTO, toPlayerProfileDTO, type ProfileExtras } from './dto';

/**
 * `isNew` boundary (master_plan §2AG A3, D5): onboarded within `new_account_badge_days` shows the
 * neutral "New" pill; onboarded before the window, or the setting turned off, does not.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

function row(onboardedAt: string | null): ProfileRow {
  return {
    id: 'p1',
    first_name: 'Ana',
    last_name: 'Reyes',
    nickname: null,
    slug: 'ana-reyes',
    city: null,
    sex: null,
    date_of_birth: null,
    avatar_path: null,
    bio: null,
    self_rated_skill: null,
    facebook_url: null,
    looking_for_partner: false,
    open_for_sponsorship: false,
    profile_visibility: {},
    account_status: 'active',
    onboarded_at: onboardedAt,
    created_at: onboardedAt ?? new Date().toISOString(),
    updated_at: onboardedAt ?? new Date().toISOString(),
    deleted_at: null,
    status_reason: null,
    status_updated_at: null,
    status_updated_by: null,
    suspended_until: null,
    vouching_restricted_until: null,
  };
}

const extras: ProfileExtras = { roles: [], identityVerified: false };

describe('toPlayerCardDTO isNew', () => {
  it('is true for a player onboarded 3 days ago under a 7-day window', () => {
    const dto = toPlayerCardDTO(row(daysAgo(3)), extras, ANON_VIEWER, 7);
    expect(dto.isNew).toBe(true);
  });

  it('is false for a player onboarded 8 days ago under a 7-day window', () => {
    const dto = toPlayerCardDTO(row(daysAgo(8)), extras, ANON_VIEWER, 7);
    expect(dto.isNew).toBe(false);
  });

  it('is inclusive right at the boundary', () => {
    // Freeze the clock: `daysAgo(7)` and the `Date.now()` inside `toPlayerCardDTO` must observe the
    // same instant, or the `>=` boundary races on the few ms between them (a pre-existing flake).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T00:00:00.000Z'));
    try {
      const dto = toPlayerCardDTO(row(daysAgo(7)), extras, ANON_VIEWER, 7);
      expect(dto.isNew).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves the boundary when the setting changes, without any other change', () => {
    const eightDaysAgo = row(daysAgo(8));
    expect(toPlayerCardDTO(eightDaysAgo, extras, ANON_VIEWER, 7).isNew).toBe(false);
    expect(toPlayerCardDTO(eightDaysAgo, extras, ANON_VIEWER, 10).isNew).toBe(true);
  });

  it('is false when the window is disabled (0 days)', () => {
    const dto = toPlayerCardDTO(row(daysAgo(0)), extras, ANON_VIEWER, 0);
    expect(dto.isNew).toBe(false);
  });

  it('is false when onboarded_at is null', () => {
    const dto = toPlayerCardDTO(row(null), extras, ANON_VIEWER, 7);
    expect(dto.isNew).toBe(false);
  });

  it('defaults to a 7-day window when the caller does not pass one', () => {
    expect(toPlayerCardDTO(row(daysAgo(3)), extras, ANON_VIEWER).isNew).toBe(true);
    expect(toPlayerCardDTO(row(daysAgo(8)), extras, ANON_VIEWER).isNew).toBe(false);
  });
});

/**
 * `coachVouched` (master_plan §2AO D2): true only when the caller's `player_skill_profiles.
 * coach_vouch_count` read (queries.ts) found at least one coach-weighted active vouch. The read is
 * defensive (a database that has not yet run migration 0042 degrades to `{}`), so `extras.coachVouched`
 * being absent - not just `false` - must also map to `false` here.
 */
describe('toPlayerCardDTO coachVouched', () => {
  it('defaults to false when extras carries no coachVouched at all (missing column)', () => {
    const dto = toPlayerCardDTO(row(daysAgo(1)), extras, ANON_VIEWER);
    expect(dto.coachVouched).toBe(false);
  });

  it('is false when extras.coachVouched is explicitly false', () => {
    const dto = toPlayerCardDTO(row(daysAgo(1)), { ...extras, coachVouched: false }, ANON_VIEWER);
    expect(dto.coachVouched).toBe(false);
  });

  it('is true when extras.coachVouched is true', () => {
    const dto = toPlayerCardDTO(row(daysAgo(1)), { ...extras, coachVouched: true }, ANON_VIEWER);
    expect(dto.coachVouched).toBe(true);
  });
});

/**
 * `coachVouchers` (master_plan §2AO D3) is a PROFILE-only field - `PlayerCardDTO` (what every
 * directory card renders) never carries it at all, and `toPlayerProfileDTO` defaults it to an empty
 * array when the caller (the directory list never calls this - only `getPlayerBySlug` does) omits it.
 */
describe('toPlayerProfileDTO coachVouchers', () => {
  it('is absent on the card DTO entirely', () => {
    const dto = toPlayerCardDTO(row(daysAgo(1)), extras, ANON_VIEWER);
    expect('coachVouchers' in dto).toBe(false);
  });

  it('defaults to an empty array on the profile DTO when extras omits it', () => {
    const dto = toPlayerProfileDTO(row(daysAgo(1)), extras, ANON_VIEWER);
    expect(dto.coachVouchers).toEqual([]);
  });

  it('carries through whatever the caller loaded', () => {
    const coachVouchers = [
      { name: 'Coach Ana', slug: 'coach-ana', avatarUrl: null, verified: true, level: 4 },
    ];
    const dto = toPlayerProfileDTO(row(daysAgo(1)), { ...extras, coachVouchers }, ANON_VIEWER);
    expect(dto.coachVouchers).toEqual(coachVouchers);
  });
});
