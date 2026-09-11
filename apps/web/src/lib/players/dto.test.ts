import { describe, it, expect } from 'vitest';
import type { ProfileRow } from '@vouchplay/db';
import { ANON_VIEWER, toPlayerCardDTO, type ProfileExtras } from './dto';

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
    const dto = toPlayerCardDTO(row(daysAgo(7)), extras, ANON_VIEWER, 7);
    expect(dto.isNew).toBe(true);
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
