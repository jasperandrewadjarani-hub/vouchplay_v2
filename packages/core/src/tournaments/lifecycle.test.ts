import { describe, expect, it } from 'vitest';
import {
  MANAGEABLE_TOURNAMENT_STATUSES,
  canChangeTournamentStatus,
  isManageableTournamentStatus,
} from './lifecycle';

describe('free tournament lifecycle control', () => {
  it('recognizes every non-archived lifecycle status', () => {
    expect(MANAGEABLE_TOURNAMENT_STATUSES).toEqual([
      'draft',
      'published',
      'registration_open',
      'registration_closed',
      'locked',
      'live',
      'completed',
      'cancelled',
    ]);
    expect(isManageableTournamentStatus('archived')).toBe(false);
    expect(isManageableTournamentStatus('unknown')).toBe(false);
  });

  it('allows every forward and backward move between distinct normal states', () => {
    for (const current of MANAGEABLE_TOURNAMENT_STATUSES) {
      for (const next of MANAGEABLE_TOURNAMENT_STATUSES) {
        expect(canChangeTournamentStatus(current, next)).toBe(current !== next);
      }
    }
  });

  it('keeps archived outside the free-movement control', () => {
    expect(canChangeTournamentStatus('archived', 'published')).toBe(false);
    expect(canChangeTournamentStatus('published', 'archived')).toBe(false);
  });
});
