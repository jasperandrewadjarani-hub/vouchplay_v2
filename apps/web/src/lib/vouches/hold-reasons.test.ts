import { describe, it, expect } from 'vitest';
import {
  HOLD_FLAG_TYPES,
  HOLD_REASON_OR_FILTER,
  holdReason,
  isHoldFlagType,
  isHoldReason,
} from './hold-reasons';

describe('hold reasons (§2AF velocity hold, §2AJ cluster hold)', () => {
  it('knows exactly the two hold-producing flag types', () => {
    expect(HOLD_FLAG_TYPES.sort()).toEqual(['SINGLE_PURPOSE_CLUSTER', 'VELOCITY_BURST']);
    expect(isHoldFlagType('VELOCITY_BURST')).toBe(true);
    expect(isHoldFlagType('SINGLE_PURPOSE_CLUSTER')).toBe(true);
    expect(isHoldFlagType('LOW_TRUST_SWARM')).toBe(false);
  });

  it('writes and recognises each prefix, and never a moderator invalidation', () => {
    expect(holdReason('VELOCITY_BURST', 'abc')).toBe('velocity_hold:abc');
    expect(holdReason('SINGLE_PURPOSE_CLUSTER', 'abc')).toBe('cluster_hold:abc');
    expect(isHoldReason('velocity_hold:abc')).toBe(true);
    expect(isHoldReason('cluster_hold:abc')).toBe(true);
    expect(isHoldReason('Fake account - moderator')).toBe(false);
    expect(isHoldReason(null)).toBe(false);
    expect(isHoldReason('')).toBe(false);
  });

  it('builds a PostgREST OR filter covering every prefix', () => {
    expect(HOLD_REASON_OR_FILTER).toBe(
      'invalidation_reason.like.velocity_hold:%,invalidation_reason.like.cluster_hold:%',
    );
  });
});
