import { describe, it, expect } from 'vitest';
import { detectAnomalies } from './anomalies';
import type { AnomalyParams, V2Voucher, V2Vouch } from './types';

const A: AnomalyParams = {
  velocityWindowHours: 6,
  velocityBurstMin: 8,
  velocityLowTrustShare: 0.6,
  velocityLowTrustVt: 0.5,
  swarmMin: 6,
  ringReciprocalShare: 0.5,
  blocShare: 0.6,
  spikeBands: 2,
};

const NOW = '2026-09-11T12:00:00.000Z';
const IN_WINDOW = '2026-09-11T10:00:00.000Z'; // 2h before now, inside the 6h window
const OUT_OF_WINDOW = '2026-09-11T02:00:00.000Z'; // 10h before now, outside the 6h window

const voucher = (id: string, overrides: Partial<V2Voucher> = {}): V2Voucher => ({
  id,
  anchored: false,
  standingRaw: 0,
  accountAgeDays: 30,
  clubIds: [],
  ...overrides,
});

const vouch = (id: string, voucherId: string, overrides: Partial<V2Vouch> = {}): V2Vouch => ({
  id,
  voucherId,
  level: 5,
  credentialWeight: 1,
  reciprocal: false,
  createdAt: IN_WINDOW,
  ...overrides,
});

function baseInput(overrides: Partial<Parameters<typeof detectAnomalies>[0]> = {}) {
  return {
    now: NOW,
    selfRating: null,
    cslV1: null,
    cslV2: null,
    nEff: 10,
    vouches: [] as V2Vouch[],
    vouchers: new Map<string, V2Voucher>(),
    trust: new Map<string, number>(),
    ...overrides,
  };
}

describe('VELOCITY_BURST', () => {
  it('triggers at >= burstMin in-window vouches with >= lowTrustShare of them low-trust; holds only the low-trust ones', () => {
    const vouchers = new Map<string, V2Voucher>();
    const vouches: V2Vouch[] = [];
    const trust = new Map<string, number>();
    // 6 low-trust in-window
    for (let i = 0; i < 6; i++) {
      const id = `low${i}`;
      vouchers.set(id, voucher(id));
      trust.set(id, 0.1);
      vouches.push(vouch(`vlow${i}`, id));
    }
    // 2 high-trust in-window
    for (let i = 0; i < 2; i++) {
      const id = `high${i}`;
      vouchers.set(id, voucher(id));
      trust.set(id, 0.9);
      vouches.push(vouch(`vhigh${i}`, id));
    }
    // an old vouch outside the window - must not count toward the burst
    vouchers.set('old', voucher('old'));
    trust.set('old', 0.1);
    vouches.push(vouch('vold', 'old', { createdAt: OUT_OF_WINDOW }));

    const flags = detectAnomalies(baseInput({ vouches, vouchers, trust }), A);
    const burst = flags.find((f) => f.type === 'VELOCITY_BURST');
    expect(burst).toBeDefined();
    expect(burst?.severity).toBe('high');
    expect(burst?.reason).not.toMatch(/low0|high0|vlow0/); // no ids/names in the reason text
    expect(burst?.holdVouchIds.sort()).toEqual(
      ['vlow0', 'vlow1', 'vlow2', 'vlow3', 'vlow4', 'vlow5'].sort(),
    );
  });

  it('does not trigger just below burstMin (7 in-window vouches)', () => {
    const vouchers = new Map<string, V2Voucher>();
    const vouches: V2Vouch[] = [];
    const trust = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      const id = `low${i}`;
      vouchers.set(id, voucher(id));
      trust.set(id, 0.1);
      vouches.push(vouch(`v${i}`, id));
    }
    const flags = detectAnomalies(baseInput({ vouches, vouchers, trust }), A);
    expect(flags.find((f) => f.type === 'VELOCITY_BURST')).toBeUndefined();
  });

  it('does not trigger when count clears the bar but the low-trust share does not', () => {
    const vouchers = new Map<string, V2Voucher>();
    const vouches: V2Vouch[] = [];
    const trust = new Map<string, number>();
    // 8 in-window, only 3 low-trust (share 0.375 < 0.6)
    for (let i = 0; i < 8; i++) {
      const id = `u${i}`;
      vouchers.set(id, voucher(id));
      trust.set(id, i < 3 ? 0.1 : 0.9);
      vouches.push(vouch(`v${i}`, id));
    }
    const flags = detectAnomalies(baseInput({ vouches, vouchers, trust }), A);
    expect(flags.find((f) => f.type === 'VELOCITY_BURST')).toBeUndefined();
  });
});

describe('LOW_TRUST_SWARM', () => {
  it('triggers at >= swarmMin unanchored, zero-standing vouches', () => {
    const vouchers = new Map<string, V2Voucher>();
    const vouches: V2Vouch[] = [];
    for (let i = 0; i < 6; i++) {
      const id = `u${i}`;
      vouchers.set(id, voucher(id, { anchored: false, standingRaw: 0 }));
      vouches.push(vouch(`v${i}`, id));
    }
    const flags = detectAnomalies(baseInput({ vouches, vouchers }), A);
    const swarm = flags.find((f) => f.type === 'LOW_TRUST_SWARM');
    expect(swarm).toBeDefined();
    expect(swarm?.severity).toBe('medium');
    expect(swarm?.holdVouchIds).toEqual([]);
  });

  it('does not trigger just below swarmMin (5)', () => {
    const vouchers = new Map<string, V2Voucher>();
    const vouches: V2Vouch[] = [];
    for (let i = 0; i < 5; i++) {
      const id = `u${i}`;
      vouchers.set(id, voucher(id, { anchored: false, standingRaw: 0 }));
      vouches.push(vouch(`v${i}`, id));
    }
    const flags = detectAnomalies(baseInput({ vouches, vouchers }), A);
    expect(flags.find((f) => f.type === 'LOW_TRUST_SWARM')).toBeUndefined();
  });

  it('anchored or standing-bearing vouchers do not count toward the swarm', () => {
    const vouchers = new Map<string, V2Voucher>();
    const vouches: V2Vouch[] = [];
    for (let i = 0; i < 6; i++) {
      const id = `u${i}`;
      vouchers.set(id, voucher(id, { anchored: i % 2 === 0, standingRaw: i % 2 === 0 ? 0 : 1 }));
      vouches.push(vouch(`v${i}`, id));
    }
    const flags = detectAnomalies(baseInput({ vouches, vouchers }), A);
    expect(flags.find((f) => f.type === 'LOW_TRUST_SWARM')).toBeUndefined();
  });
});

describe('RECIPROCAL_RING', () => {
  it('triggers at n>=4 and reciprocal share >= ringReciprocalShare', () => {
    const vouchers = new Map<string, V2Voucher>();
    const vouches: V2Vouch[] = [];
    for (let i = 0; i < 4; i++) {
      const id = `u${i}`;
      vouchers.set(id, voucher(id));
      vouches.push(vouch(`v${i}`, id, { reciprocal: i < 2 })); // 2/4 = 0.5
    }
    const flags = detectAnomalies(baseInput({ vouches, vouchers }), A);
    const ring = flags.find((f) => f.type === 'RECIPROCAL_RING');
    expect(ring).toBeDefined();
    expect(ring?.severity).toBe('medium');
  });

  it('does not trigger just below the reciprocal share threshold', () => {
    const vouchers = new Map<string, V2Voucher>();
    const vouches: V2Vouch[] = [];
    for (let i = 0; i < 4; i++) {
      const id = `u${i}`;
      vouchers.set(id, voucher(id));
      vouches.push(vouch(`v${i}`, id, { reciprocal: i < 1 })); // 1/4 = 0.25
    }
    const flags = detectAnomalies(baseInput({ vouches, vouchers }), A);
    expect(flags.find((f) => f.type === 'RECIPROCAL_RING')).toBeUndefined();
  });

  it('does not trigger below n=4 even at 100% reciprocal', () => {
    const vouchers = new Map<string, V2Voucher>([
      ['a', voucher('a')],
      ['b', voucher('b')],
      ['c', voucher('c')],
    ]);
    const vouches: V2Vouch[] = [
      vouch('v1', 'a', { reciprocal: true }),
      vouch('v2', 'b', { reciprocal: true }),
      vouch('v3', 'c', { reciprocal: true }),
    ];
    const flags = detectAnomalies(baseInput({ vouches, vouchers }), A);
    expect(flags.find((f) => f.type === 'RECIPROCAL_RING')).toBeUndefined();
  });
});

describe('CLUB_BLOC', () => {
  it('triggers when one club supplies >= blocShare of n>=4 vouches and the bloc median is far from self-rating', () => {
    const vouchers = new Map<string, V2Voucher>([
      ['a', voucher('a', { clubIds: ['c1'] })],
      ['b', voucher('b', { clubIds: ['c1'] })],
      ['c', voucher('c', { clubIds: ['c1'] })],
      ['d', voucher('d', { clubIds: ['c2'] })],
    ]);
    const vouches: V2Vouch[] = [
      vouch('v1', 'a', { level: 5 }),
      vouch('v2', 'b', { level: 5 }),
      vouch('v3', 'c', { level: 5 }),
      vouch('v4', 'd', { level: 1 }),
    ];
    // bloc = c1 (3/4 = 0.75 >= 0.6); bloc median 5; selfRating 1; distance 4 >= spikeBands(2)
    const flags = detectAnomalies(baseInput({ vouches, vouchers, selfRating: 1 }), A);
    const bloc = flags.find((f) => f.type === 'CLUB_BLOC');
    expect(bloc).toBeDefined();
    expect(bloc?.severity).toBe('high');
  });

  it('does not trigger when the bloc share is just below the threshold', () => {
    const vouchers = new Map<string, V2Voucher>([
      ['a', voucher('a', { clubIds: ['c1'] })],
      ['b', voucher('b', { clubIds: ['c1'] })],
      ['c', voucher('c', { clubIds: ['c2'] })],
      ['d', voucher('d', { clubIds: ['c3'] })],
    ]);
    const vouches: V2Vouch[] = [
      vouch('v1', 'a', { level: 5 }),
      vouch('v2', 'b', { level: 5 }),
      vouch('v3', 'c', { level: 5 }),
      vouch('v4', 'd', { level: 1 }),
    ];
    // largest bloc c1 = 2/4 = 0.5 < 0.6
    const flags = detectAnomalies(baseInput({ vouches, vouchers, selfRating: 1 }), A);
    expect(flags.find((f) => f.type === 'CLUB_BLOC')).toBeUndefined();
  });

  it('does not trigger when the bloc is close to the self-rating (distance below spikeBands)', () => {
    const vouchers = new Map<string, V2Voucher>([
      ['a', voucher('a', { clubIds: ['c1'] })],
      ['b', voucher('b', { clubIds: ['c1'] })],
      ['c', voucher('c', { clubIds: ['c1'] })],
      ['d', voucher('d', { clubIds: ['c2'] })],
    ]);
    const vouches: V2Vouch[] = [
      vouch('v1', 'a', { level: 3 }),
      vouch('v2', 'b', { level: 3 }),
      vouch('v3', 'c', { level: 3 }),
      vouch('v4', 'd', { level: 1 }),
    ];
    // bloc median 3, selfRating 2, distance 1 < spikeBands(2)
    const flags = detectAnomalies(baseInput({ vouches, vouchers, selfRating: 2 }), A);
    expect(flags.find((f) => f.type === 'CLUB_BLOC')).toBeUndefined();
  });
});

describe('SPIKE', () => {
  it('triggers when |cslV2 - cslV1| >= spikeBands', () => {
    const flags = detectAnomalies(baseInput({ cslV1: 2, cslV2: 5 }), A);
    const spike = flags.find((f) => f.type === 'SPIKE');
    expect(spike).toBeDefined();
    expect(spike?.severity).toBe('low');
  });

  it('does not trigger when |cslV2 - cslV1| is just below spikeBands', () => {
    const flags = detectAnomalies(baseInput({ cslV1: 2, cslV2: 3 }), A);
    expect(flags.find((f) => f.type === 'SPIKE')).toBeUndefined();
  });

  it('triggers on |cslV2 - self| >= spikeBands with thin evidence (nEff < 3), even with no V1 to compare', () => {
    const flags = detectAnomalies(baseInput({ cslV1: null, cslV2: 5, selfRating: 2, nEff: 1 }), A);
    expect(flags.find((f) => f.type === 'SPIKE')).toBeDefined();
  });

  it('does not trigger the thin-evidence path once nEff clears 3', () => {
    const flags = detectAnomalies(baseInput({ cslV1: null, cslV2: 5, selfRating: 2, nEff: 3 }), A);
    expect(flags.find((f) => f.type === 'SPIKE')).toBeUndefined();
  });
});

describe('reason text never names/identifies a voucher', () => {
  it('every flag reason omits raw voucher/vouch ids', () => {
    const vouchers = new Map<string, V2Voucher>();
    const vouches: V2Vouch[] = [];
    const trust = new Map<string, number>();
    for (let i = 0; i < 8; i++) {
      const id = `u${i}`;
      vouchers.set(id, voucher(id, { clubIds: ['c1'] }));
      trust.set(id, 0.1);
      vouches.push(vouch(`v${i}`, id, { reciprocal: i < 5, level: 5 }));
    }
    const flags = detectAnomalies(
      baseInput({ vouches, vouchers, trust, selfRating: 1, cslV1: 1, cslV2: 4 }),
      A,
    );
    expect(flags.length).toBeGreaterThan(0);
    for (const flag of flags) {
      for (const id of [...vouchers.keys(), ...vouches.map((v) => v.id)]) {
        expect(flag.reason).not.toContain(id);
      }
    }
  });
});
