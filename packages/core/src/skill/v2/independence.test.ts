import { describe, it, expect } from 'vitest';
import { assignBlocs, independence } from './independence';
import type { V2Params, V2Voucher, V2Vouch } from './types';

const P: V2Params = {
  trustUnknownFactor: 0.25,
  trustUnanchoredFactor: 0.6,
  trustStandingSaturation: 3,
  trustMaturityDays: 7,
  reciprocalMultiplier: 0.5,
  blocDecay: 0.6,
  priorWeight: 2,
  minIndependentVouchers: 2,
  skillVerifiedMinSts: 3,
};

const voucher = (id: string, clubIds: string[]): V2Voucher => ({
  id,
  anchored: false,
  standingRaw: 0,
  accountAgeDays: 30,
  clubIds,
  outgoingCount: 5,
});

const vouch = (id: string, voucherId: string, overrides: Partial<V2Vouch> = {}): V2Vouch => ({
  id,
  voucherId,
  level: 5,
  credentialWeight: 1,
  reciprocal: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

describe('assignBlocs (§2AF.2)', () => {
  it('assigns a single-club voucher to that club', () => {
    const vouchers = new Map([['a', voucher('a', ['c1'])]]);
    const vouches = [vouch('v1', 'a')];
    const blocs = assignBlocs(vouches, vouchers);
    expect(blocs.get('v1')).toBe('c1');
  });

  it('leaves a clubless voucher unassigned (null)', () => {
    const vouchers = new Map([['a', voucher('a', [])]]);
    const vouches = [vouch('v1', 'a')];
    expect(assignBlocs(vouches, vouchers).get('v1')).toBeNull();
  });

  it('assigns a multi-club voucher to whichever club supplies the most vouches on this target', () => {
    // 'a' is in c1 and c2. c1 has 3 vouches on T (a, b, c); c2 has only 1 (a). a should join c1.
    const vouchers = new Map([
      ['a', voucher('a', ['c1', 'c2'])],
      ['b', voucher('b', ['c1'])],
      ['c', voucher('c', ['c1'])],
    ]);
    const vouches = [vouch('v1', 'a'), vouch('v2', 'b'), vouch('v3', 'c')];
    const blocs = assignBlocs(vouches, vouchers);
    expect(blocs.get('v1')).toBe('c1');
  });

  it('breaks ties by the smallest club id, deterministically regardless of clubIds order', () => {
    // c2 and c3 each have exactly 1 vouch on T (just 'a' itself) - tie; 'c2' < 'c3' wins.
    const vouchers = new Map([['a', voucher('a', ['c3', 'c2'])]]);
    const vouches = [vouch('v1', 'a')];
    expect(assignBlocs(vouches, vouchers).get('v1')).toBe('c2');
  });

  it('propagates the same assignment to every vouch from the same voucher', () => {
    const vouchers = new Map([
      ['a', voucher('a', ['c1'])],
      ['b', voucher('b', ['c1'])],
    ]);
    const vouches = [vouch('v1', 'a'), vouch('v2', 'a'), vouch('v3', 'b')];
    const blocs = assignBlocs(vouches, vouchers);
    expect(blocs.get('v1')).toBe(blocs.get('v2'));
  });
});

describe('independence (§2AF.2)', () => {
  it('reciprocal vouches are discounted by reciprocalMultiplier, independent of bloc membership', () => {
    const vouchers = new Map([['a', voucher('a', [])]]);
    const trust = new Map([['a', 1]]);
    const result = independence([vouch('v1', 'a', { reciprocal: true })], vouchers, trust, P);
    expect(result.get('v1')).toBeCloseTo(0.5, 6);
  });

  it('clubless (unassigned) vouchers receive no bloc decay', () => {
    const vouchers = new Map([
      ['a', voucher('a', [])],
      ['b', voucher('b', [])],
    ]);
    const trust = new Map([
      ['a', 0.9],
      ['b', 0.1],
    ]);
    const result = independence([vouch('v1', 'a'), vouch('v2', 'b')], vouchers, trust, P);
    expect(result.get('v1')).toBe(1);
    expect(result.get('v2')).toBe(1);
  });

  it('orders a bloc by trust descending and applies blocDecay^rank, tie-broken by voucherId asc', () => {
    const vouchers = new Map([
      ['low', voucher('low', ['c1'])],
      ['high', voucher('high', ['c1'])],
      ['mid-a', voucher('mid-a', ['c1'])],
      ['mid-b', voucher('mid-b', ['c1'])],
    ]);
    const trust = new Map([
      ['low', 0.2],
      ['high', 0.9],
      ['mid-a', 0.5],
      ['mid-b', 0.5], // tied with mid-a -> voucherId asc: 'mid-a' before 'mid-b'
    ]);
    const vouches = [
      vouch('v-low', 'low'),
      vouch('v-high', 'high'),
      vouch('v-mid-a', 'mid-a'),
      vouch('v-mid-b', 'mid-b'),
    ];
    const result = independence(vouches, vouchers, trust, P);
    // rank order: high(0), mid-a(1), mid-b(2), low(3)
    expect(result.get('v-high')).toBeCloseTo(1, 6);
    expect(result.get('v-mid-a')).toBeCloseTo(0.6, 6);
    expect(result.get('v-mid-b')).toBeCloseTo(0.36, 6);
    expect(result.get('v-low')).toBeCloseTo(0.216, 6);
  });

  it('bloc decay is geometric and capped: a bloc of 20 sums to < 1/(1-blocDecay) + epsilon', () => {
    const vouchers = new Map(
      Array.from({ length: 20 }, (_, i) => [`u${i}`, voucher(`u${i}`, ['c1'])] as const),
    );
    const trust = new Map(Array.from({ length: 20 }, (_, i) => [`u${i}`, 0.5] as const)); // all tied
    const vouches = Array.from({ length: 20 }, (_, i) => vouch(`v${i}`, `u${i}`));
    const result = independence(vouches, vouchers, trust, P);
    const sum = [...result.values()].reduce((s, v) => s + v, 0);
    const cap = 1 / (1 - P.blocDecay); // 2.5
    expect(sum).toBeLessThan(cap + 0.01);
    // and each individual value stays capped at 1 (rank 0 gets no decay at all)
    expect(Math.max(...result.values())).toBeLessThanOrEqual(1);
  });

  it('is deterministic and order-independent (shuffling vouches yields identical per-id results)', () => {
    const vouchers = new Map([
      ['a', voucher('a', ['c1'])],
      ['b', voucher('b', ['c1'])],
      ['c', voucher('c', [])],
    ]);
    const trust = new Map([
      ['a', 0.7],
      ['b', 0.3],
      ['c', 0.9],
    ]);
    const vouches = [vouch('v1', 'a'), vouch('v2', 'b'), vouch('v3', 'c', { reciprocal: true })];
    const shuffled = [...vouches].reverse();
    const a = independence(vouches, vouchers, trust, P);
    const b = independence(shuffled, vouchers, trust, P);
    expect(Object.fromEntries(a)).toEqual(Object.fromEntries(b));
  });
});
