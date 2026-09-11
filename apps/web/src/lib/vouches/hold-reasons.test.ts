import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_DISABLED_PREFIX,
  HOLD_FLAG_TYPES,
  HOLD_REASON_OR_FILTER,
  HOLD_REASON_PREFIXES,
  holdReason,
  isAccountDisabledReason,
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

describe('account-disabled retraction (§2AN decision 4) - a sibling, never a hold', () => {
  it('writes and recognises the prefix', () => {
    expect(ACCOUNT_DISABLED_PREFIX).toBe('account_disabled:');
    expect(isAccountDisabledReason('account_disabled:suspended')).toBe(true);
    expect(isAccountDisabledReason('account_disabled:banned')).toBe(true);
    expect(isAccountDisabledReason('account_disabled:deactivated')).toBe(true);
    expect(isAccountDisabledReason('Fake account - moderator')).toBe(false);
    expect(isAccountDisabledReason(null)).toBe(false);
    expect(isAccountDisabledReason('')).toBe(false);
  });

  it('is never a hold: not in HOLD_REASON_PREFIXES, not a hold flag type, not isHoldReason', () => {
    expect(Object.values(HOLD_REASON_PREFIXES)).not.toContain(ACCOUNT_DISABLED_PREFIX);
    expect(isHoldFlagType('ACCOUNT_DISABLED')).toBe(false);
    expect(isHoldReason('account_disabled:suspended')).toBe(false);
  });
});
