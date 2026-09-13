import { describe, it, expect } from 'vitest';
import {
  selectReminders,
  DEFAULT_EARLY_BIRD_WINDOW_HOURS,
  DEFAULT_CLOSE_WINDOW_HOURS,
  DEFAULT_LOCK_WINDOW_HOURS,
  type ReminderEntry,
  type ReminderInput,
  type ReminderTournament,
} from './reminders';

const NOW = '2026-09-13T00:00:00Z';

function hoursFromNow(hours: number): string {
  return new Date(Date.parse(NOW) + hours * 60 * 60 * 1000).toISOString();
}

function tournament(over: Partial<ReminderTournament> = {}): ReminderTournament {
  return {
    id: 'tourn-1',
    name: 'Hermosa Open',
    slug: 'hermosa-open',
    earlyBirdEndsAt: null,
    registrationCloseAt: null,
    partnerLockEffectiveAt: null,
    ...over,
  };
}

function entry(over: Partial<ReminderEntry> = {}): ReminderEntry {
  return {
    registrationId: 'reg-1',
    teamSize: 2,
    members: [
      { playerId: 'p1', confirmed: true },
      { playerId: 'p2', confirmed: true },
    ],
    seats: [
      { playerId: 'p1', state: 'unpaid' },
      { playerId: 'p2', state: 'unpaid' },
    ],
    status: 'payment_pending',
    ...over,
  };
}

function baseInput(over: Partial<ReminderInput> = {}): ReminderInput {
  return {
    now: NOW,
    tournament: tournament(),
    entries: [],
    bareSlots: [],
    sent: new Set<string>(),
    ...over,
  };
}

describe('selectReminders - defaults', () => {
  it('defaults the windows to 48h / 72h / 72h (§2AQ A1)', () => {
    expect(DEFAULT_EARLY_BIRD_WINDOW_HOURS).toBe(48);
    expect(DEFAULT_CLOSE_WINDOW_HOURS).toBe(72);
    expect(DEFAULT_LOCK_WINDOW_HOURS).toBe(72);
  });

  it('returns nothing when `now` fails to parse', () => {
    expect(selectReminders(baseInput({ now: 'not-a-date' }))).toEqual([]);
  });

  it('returns nothing when no deadlines are set at all', () => {
    expect(selectReminders(baseInput({ entries: [entry()] }))).toEqual([]);
  });
});

describe('early_bird_ending window (§2AQ A1a)', () => {
  it('reminds a confirmed member with an unpaid seat inside the 48h window', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: hoursFromNow(10) }),
        entries: [entry()],
      }),
    );
    expect(out.map((r) => r.recipientId)).toEqual(['p1', 'p2']);
    for (const r of out) {
      expect(r.type).toBe('early_bird_ending');
      expect(r.entityType).toBe('registration');
      expect(r.entityId).toBe('reg-1');
      expect(r.deadlineIso).toBe(hoursFromNow(10));
      expect(r.key).toBe(`early_bird_ending:${r.recipientId}:reg-1`);
    }
  });

  it('is silent exactly at the deadline (diff = 0, not "> 0")', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: NOW }),
        entries: [entry()],
      }),
    );
    expect(out).toEqual([]);
  });

  it('is silent just past the deadline (already passed)', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: hoursFromNow(-1) }),
        entries: [entry()],
      }),
    );
    expect(out).toEqual([]);
  });

  it('fires exactly at the 48h edge (diff = window, inclusive)', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: hoursFromNow(48) }),
        entries: [entry()],
      }),
    );
    expect(out.length).toBe(2);
  });

  it('is silent just past the 48h edge', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: hoursFromNow(48.01) }),
        entries: [entry()],
      }),
    );
    expect(out).toEqual([]);
  });

  it('a custom window overrides the 48h default', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: hoursFromNow(60) }),
        entries: [entry()],
        windows: { earlyBirdHours: 72 },
      }),
    );
    expect(out.length).toBe(2);
  });

  it('skips a member who is not yet confirmed', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: hoursFromNow(10) }),
        entries: [
          entry({
            members: [
              { playerId: 'p1', confirmed: true },
              { playerId: 'p2', confirmed: false },
            ],
          }),
        ],
      }),
    );
    expect(out.map((r) => r.recipientId)).toEqual(['p1']);
  });

  it('skips a seat that is already paid', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: hoursFromNow(10) }),
        entries: [
          entry({
            seats: [
              { playerId: 'p1', state: 'paid' },
              { playerId: 'p2', state: 'unpaid' },
            ],
          }),
        ],
      }),
    );
    expect(out.map((r) => r.recipientId)).toEqual(['p2']);
  });

  it('skips a submitted seat (already sent a receipt, no need to nag)', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: hoursFromNow(10) }),
        entries: [
          entry({
            seats: [
              { playerId: 'p1', state: 'submitted' },
              { playerId: 'p2', state: 'unpaid' },
            ],
          }),
        ],
      }),
    );
    expect(out.map((r) => r.recipientId)).toEqual(['p2']);
  });

  it('reminds a declined seat too, not just unpaid', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: hoursFromNow(10) }),
        entries: [
          entry({
            seats: [
              { playerId: 'p1', state: 'declined' },
              { playerId: 'p2', state: 'paid' },
            ],
          }),
        ],
      }),
    );
    expect(out.map((r) => r.recipientId)).toEqual(['p1']);
  });

  it('skips entries not in payment_pending/payment_submitted (e.g. confirmed or team_formed)', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: hoursFromNow(10) }),
        entries: [
          entry({ status: 'confirmed' }),
          entry({ status: 'team_formed', registrationId: 'reg-2' }),
        ],
      }),
    );
    expect(out).toEqual([]);
  });

  it('payment_submitted entries are still eligible', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: hoursFromNow(10) }),
        entries: [entry({ status: 'payment_submitted' })],
      }),
    );
    expect(out.length).toBe(2);
  });
});

describe('registration closing window (§2AQ A1b)', () => {
  it('reminds unpaid confirmed members with registration_closing_unpaid', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ registrationCloseAt: hoursFromNow(20) }),
        entries: [entry()],
      }),
    );
    expect(out.every((r) => r.type === 'registration_closing_unpaid')).toBe(true);
    expect(out.map((r) => r.recipientId).sort()).toEqual(['p1', 'p2']);
  });

  it('reminds live bare slot holders with registration_closing_choose_division, entity = tournament', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ registrationCloseAt: hoursFromNow(20) }),
        bareSlots: [{ playerId: 'p9', status: 'submitted' }],
      }),
    );
    expect(out).toEqual([
      {
        type: 'registration_closing_choose_division',
        recipientId: 'p9',
        entityType: 'tournament',
        entityId: 'tourn-1',
        deadlineIso: hoursFromNow(20),
        key: 'registration_closing_choose_division:p9:tourn-1',
      },
    ]);
  });

  it('a verified bare slot is also live; a rejected/refunded one is not', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ registrationCloseAt: hoursFromNow(20) }),
        bareSlots: [
          { playerId: 'verified', status: 'verified' },
          { playerId: 'rejected', status: 'rejected' },
          { playerId: 'refunded', status: 'refunded' },
        ],
      }),
    );
    expect(out.map((r) => r.recipientId)).toEqual(['verified']);
  });

  it('is silent outside the 72h window and fires exactly at the edge', () => {
    const tooFar = selectReminders(
      baseInput({
        tournament: tournament({ registrationCloseAt: hoursFromNow(72.5) }),
        entries: [entry()],
      }),
    );
    expect(tooFar).toEqual([]);
    const atEdge = selectReminders(
      baseInput({
        tournament: tournament({ registrationCloseAt: hoursFromNow(72) }),
        entries: [entry()],
      }),
    );
    expect(atEdge.length).toBe(2);
  });

  it('a custom closeHours window overrides the 72h default', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ registrationCloseAt: hoursFromNow(10) }),
        bareSlots: [{ playerId: 'p9', status: 'submitted' }],
        windows: { closeHours: 12 },
      }),
    );
    expect(out.length).toBe(1);
    const outTooFar = selectReminders(
      baseInput({
        tournament: tournament({ registrationCloseAt: hoursFromNow(10) }),
        bareSlots: [{ playerId: 'p9', status: 'submitted' }],
        windows: { closeHours: 5 },
      }),
    );
    expect(outTooFar).toEqual([]);
  });
});

describe('partner lock window (§2AQ A1c)', () => {
  it('reminds every confirmed member of an entry with an empty seat', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ partnerLockEffectiveAt: hoursFromNow(30) }),
        entries: [
          entry({
            members: [{ playerId: 'p1', confirmed: true }],
            seats: [
              { playerId: 'p1', state: 'unpaid' },
              { playerId: null, state: 'empty' },
            ],
          }),
        ],
      }),
    );
    expect(out).toEqual([
      {
        type: 'partner_lock_soon',
        recipientId: 'p1',
        entityType: 'registration',
        entityId: 'reg-1',
        deadlineIso: hoursFromNow(30),
        key: 'partner_lock_soon:p1:reg-1',
      },
    ]);
  });

  it('reminds every confirmed member (not the unconfirmed one) when a partner is unconfirmed', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ partnerLockEffectiveAt: hoursFromNow(30) }),
        entries: [
          entry({
            members: [
              { playerId: 'p1', confirmed: true },
              { playerId: 'p2', confirmed: false },
            ],
          }),
        ],
      }),
    );
    expect(out.map((r) => r.recipientId)).toEqual(['p1']);
  });

  it('does nothing for a fully confirmed, fully seated entry', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ partnerLockEffectiveAt: hoursFromNow(30) }),
        entries: [entry()],
      }),
    );
    expect(out).toEqual([]);
  });

  it('skips closed entries even with an open seat', () => {
    for (const status of ['withdrawn', 'cancelled', 'rejected', 'refunded']) {
      const out = selectReminders(
        baseInput({
          tournament: tournament({ partnerLockEffectiveAt: hoursFromNow(30) }),
          entries: [
            entry({
              status,
              members: [{ playerId: 'p1', confirmed: true }],
              seats: [
                { playerId: 'p1', state: 'unpaid' },
                { playerId: null, state: 'empty' },
              ],
            }),
          ],
        }),
      );
      expect(out, status).toEqual([]);
    }
  });

  it('is silent outside the 72h window and fires exactly at the edge', () => {
    const openSeatEntry = entry({
      members: [{ playerId: 'p1', confirmed: true }],
      seats: [
        { playerId: 'p1', state: 'unpaid' },
        { playerId: null, state: 'empty' },
      ],
    });
    const tooFar = selectReminders(
      baseInput({
        tournament: tournament({ partnerLockEffectiveAt: hoursFromNow(72.5) }),
        entries: [openSeatEntry],
      }),
    );
    expect(tooFar).toEqual([]);
    const atEdge = selectReminders(
      baseInput({
        tournament: tournament({ partnerLockEffectiveAt: hoursFromNow(72) }),
        entries: [openSeatEntry],
      }),
    );
    expect(atEdge.length).toBe(1);
  });

  it('a custom lockHours window overrides the 72h default', () => {
    const openSeatEntry = entry({
      members: [{ playerId: 'p1', confirmed: true }],
      seats: [
        { playerId: 'p1', state: 'unpaid' },
        { playerId: null, state: 'empty' },
      ],
    });
    const out = selectReminders(
      baseInput({
        tournament: tournament({ partnerLockEffectiveAt: hoursFromNow(90) }),
        entries: [openSeatEntry],
        windows: { lockHours: 96 },
      }),
    );
    expect(out.length).toBe(1);
  });
});

describe('dedupe + already-sent skip', () => {
  it('dedupes identical keys within one call (same member appearing via two seat rows would still collapse)', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: hoursFromNow(10) }),
        entries: [
          entry({
            members: [{ playerId: 'p1', confirmed: true }],
            seats: [
              { playerId: 'p1', state: 'unpaid' },
              { playerId: 'p1', state: 'declined' },
            ],
          }),
        ],
      }),
    );
    expect(out.length).toBe(1);
  });

  it('drops a reminder whose key is already in `sent`', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: hoursFromNow(10) }),
        entries: [entry()],
        sent: new Set(['early_bird_ending:p1:reg-1']),
      }),
    );
    expect(out.map((r) => r.recipientId)).toEqual(['p2']);
  });

  it('sent-skip is scoped to the exact type/recipient/entity - a different type for the same pair still fires', () => {
    const out = selectReminders(
      baseInput({
        tournament: tournament({
          earlyBirdEndsAt: hoursFromNow(10),
          registrationCloseAt: hoursFromNow(10),
        }),
        entries: [entry({ members: [{ playerId: 'p1', confirmed: true }] })],
        sent: new Set(['early_bird_ending:p1:reg-1']),
      }),
    );
    expect(out.map((r) => r.type)).toEqual(['registration_closing_unpaid']);
  });
});

describe('mixed cases + deterministic ordering', () => {
  it('all three windows can fire together for one tournament, sorted deterministically by key', () => {
    const openSeatEntry = entry({
      registrationId: 'reg-lock',
      members: [{ playerId: 'zz', confirmed: true }],
      seats: [
        { playerId: 'zz', state: 'paid' },
        { playerId: null, state: 'empty' },
      ],
      status: 'confirmed',
    });
    const input = baseInput({
      tournament: tournament({
        earlyBirdEndsAt: hoursFromNow(10),
        registrationCloseAt: hoursFromNow(20),
        partnerLockEffectiveAt: hoursFromNow(30),
      }),
      entries: [entry(), openSeatEntry],
      bareSlots: [{ playerId: 'p9', status: 'submitted' }],
    });
    const out = selectReminders(input);
    const keys = out.map((r) => r.key);
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
    expect(new Set(out.map((r) => r.type))).toEqual(
      new Set([
        'early_bird_ending',
        'registration_closing_unpaid',
        'registration_closing_choose_division',
        'partner_lock_soon',
      ]),
    );
  });

  it('output order does not depend on input order (same entries, reversed)', () => {
    const a = entry({ registrationId: 'reg-a', members: [{ playerId: 'a1', confirmed: true }] });
    const b = entry({ registrationId: 'reg-b', members: [{ playerId: 'b1', confirmed: true }] });
    const forward = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: hoursFromNow(10) }),
        entries: [a, b],
      }),
    );
    const backward = selectReminders(
      baseInput({
        tournament: tournament({ earlyBirdEndsAt: hoursFromNow(10) }),
        entries: [b, a],
      }),
    );
    expect(forward).toEqual(backward);
  });

  it('an empty entries/bareSlots list with every deadline open yields nothing', () => {
    expect(
      selectReminders(
        baseInput({
          tournament: tournament({
            earlyBirdEndsAt: hoursFromNow(10),
            registrationCloseAt: hoursFromNow(10),
            partnerLockEffectiveAt: hoursFromNow(10),
          }),
        }),
      ),
    ).toEqual([]);
  });
});
