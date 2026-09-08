import { describe, it, expect } from 'vitest';
import {
  CLUB_OFFER_STATUSES,
  OFFER_RESPONSE_STATUSES,
  canChangeOfferStatus,
  canChangeResponseStatus,
  isClubOfferStatus,
  isOfferResponseStatus,
  isOfferPubliclyVisible,
} from './lifecycle';
import { offerRelevanceToPlayer } from './targeting';

describe('offer lifecycle', () => {
  it('opens a draft and closes/cancels/expires an open offer', () => {
    expect(canChangeOfferStatus('draft', 'open')).toBe(true);
    expect(canChangeOfferStatus('draft', 'cancelled')).toBe(true);
    expect(canChangeOfferStatus('open', 'closed')).toBe(true);
    expect(canChangeOfferStatus('open', 'cancelled')).toBe(true);
    expect(canChangeOfferStatus('open', 'expired')).toBe(true);
  });

  it('never revives a terminal offer and never no-ops', () => {
    for (const s of ['closed', 'expired', 'cancelled'] as const) {
      for (const next of CLUB_OFFER_STATUSES) {
        expect(canChangeOfferStatus(s, next)).toBe(false);
      }
    }
    expect(canChangeOfferStatus('open', 'open')).toBe(false);
    expect(canChangeOfferStatus('draft', 'closed')).toBe(false);
    expect(canChangeOfferStatus('draft', 'bogus')).toBe(false);
  });

  it('guards offer status values', () => {
    expect(isClubOfferStatus('open')).toBe(true);
    expect(isClubOfferStatus('nope')).toBe(false);
  });
});

describe('response lifecycle', () => {
  it('accepts, declines, or withdraws a submitted response only', () => {
    expect(canChangeResponseStatus('submitted', 'accepted')).toBe(true);
    expect(canChangeResponseStatus('submitted', 'declined')).toBe(true);
    expect(canChangeResponseStatus('submitted', 'withdrawn')).toBe(true);
    for (const s of ['accepted', 'declined', 'withdrawn'] as const) {
      for (const next of OFFER_RESPONSE_STATUSES) {
        expect(canChangeResponseStatus(s, next)).toBe(false);
      }
    }
    expect(isOfferResponseStatus('submitted')).toBe(true);
    expect(isOfferResponseStatus('x')).toBe(false);
  });
});

describe('isOfferPubliclyVisible', () => {
  const now = Date.parse('2026-09-08T00:00:00Z');
  it('is visible only while open and unexpired', () => {
    expect(isOfferPubliclyVisible('open', null, now)).toBe(true);
    expect(isOfferPubliclyVisible('open', '2026-10-01T00:00:00Z', now)).toBe(true);
    expect(isOfferPubliclyVisible('open', '2026-08-01T00:00:00Z', now)).toBe(false);
    expect(isOfferPubliclyVisible('draft', null, now)).toBe(false);
    expect(isOfferPubliclyVisible('closed', null, now)).toBe(false);
  });
});

describe('offerRelevanceToPlayer (advisory only)', () => {
  it('ranks city over skill and labels untargeted offers open to all', () => {
    const city = offerRelevanceToPlayer(
      { city: 'Cebu', minSkill: null, maxSkill: null },
      { city: 'cebu', skill: 2 },
    );
    expect(city.cityMatch).toBe(true);
    expect(city.label).toBe('In your city');
    expect(city.score).toBeGreaterThan(0);

    const skill = offerRelevanceToPlayer(
      { city: 'Manila', minSkill: 2, maxSkill: 4 },
      { city: 'Cebu', skill: 3 },
    );
    expect(skill.skillMatch).toBe(true);
    expect(skill.label).toBe('Matches your level');

    const open = offerRelevanceToPlayer(
      { city: null, minSkill: null, maxSkill: null },
      { city: 'Cebu', skill: null },
    );
    expect(open.label).toBe('Open to all');
    expect(open.score).toBe(0);
  });
});
