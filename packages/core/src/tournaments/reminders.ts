/**
 * Reminders cron selector (master_plan §2AQ A1, handover §27.5) - decides WHICH recipients get WHICH
 * reminder for a tournament, given the current time, the deadline windows, the tournament's live
 * entries/bare slots, and the set of reminders already sent. Pure and deterministic: no IO, no
 * `Date.now()` (`now` is always injected), so the caller's cron job and its tests share one source of
 * truth for "who is reminded, of what, right now."
 *
 * Idempotent by construction: the caller checks existence of a `notifications` row keyed by
 * `type`/`recipient_id`/`entity_id` before sending (no new schema, §2AQ A1) - this module mirrors that
 * key shape exactly (`${type}:${recipientId}:${entityId}`) so the caller's "already sent" set can be
 * built directly from that same query and handed to `sent` unchanged.
 */

import type { SeatState } from './seat-payments';

export type ReminderType =
  | 'early_bird_ending'
  | 'registration_closing_unpaid'
  | 'registration_closing_choose_division'
  | 'partner_lock_soon';

export interface ReminderTournament {
  id: string;
  name: string;
  slug: string;
  earlyBirdEndsAt: string | null;
  registrationCloseAt: string | null;
  partnerLockEffectiveAt: string | null;
}

export interface ReminderEntry {
  registrationId: string;
  teamSize: number;
  members: { playerId: string; confirmed: boolean }[];
  seats: { playerId: string | null; state: SeatState }[];
  /** registration_status (migration 0008). */
  status: string;
}

export interface ReminderBareSlot {
  playerId: string;
  status: string;
}

export interface ReminderInput {
  now: string;
  tournament: ReminderTournament;
  entries: ReminderEntry[];
  bareSlots: ReminderBareSlot[];
  /** Keys of reminders already sent: `${type}:${recipientId}:${entityId}`. */
  sent: Set<string>;
  windows?: { earlyBirdHours?: number; closeHours?: number; lockHours?: number };
}

export interface ReminderOut {
  type: ReminderType;
  recipientId: string;
  entityType: 'registration' | 'tournament';
  entityId: string;
  deadlineIso: string;
  key: string;
}

const MS_PER_HOUR = 60 * 60 * 1000;

/** master_plan §2AQ A1 defaults. */
export const DEFAULT_EARLY_BIRD_WINDOW_HOURS = 48;
export const DEFAULT_CLOSE_WINDOW_HOURS = 72;
export const DEFAULT_LOCK_WINDOW_HOURS = 72;

/** The same closed set entry-view.ts calls CLOSED_STATUSES - kept local since core does not depend on
 *  apps/web. A closed entry's partner situation is no longer anyone's to fix. */
const CLOSED_STATUSES = new Set(['withdrawn', 'cancelled', 'rejected', 'refunded']);

const UNPAID_SEAT_STATES = new Set<SeatState>(['unpaid', 'declined']);
const PAYABLE_ENTRY_STATUSES = new Set(['payment_pending', 'payment_submitted']);
const LIVE_BARE_SLOT_STATUSES = new Set(['submitted', 'verified']);

/** A window is "open" when the deadline is strictly in the future but no further out than `hours`. */
function windowOpen(nowMs: number, deadlineMs: number, hours: number): boolean {
  const diff = deadlineMs - nowMs;
  return diff > 0 && diff <= hours * MS_PER_HOUR;
}

function seatStateFor(entry: ReminderEntry, playerId: string): SeatState | null {
  const seat = entry.seats.find((s) => s.playerId === playerId);
  return seat ? seat.state : null;
}

export function selectReminders(input: ReminderInput): ReminderOut[] {
  const nowMs = Date.parse(input.now);
  if (Number.isNaN(nowMs)) return [];

  const earlyBirdHours = input.windows?.earlyBirdHours ?? DEFAULT_EARLY_BIRD_WINDOW_HOURS;
  const closeHours = input.windows?.closeHours ?? DEFAULT_CLOSE_WINDOW_HOURS;
  const lockHours = input.windows?.lockHours ?? DEFAULT_LOCK_WINDOW_HOURS;

  const out: ReminderOut[] = [];
  const seen = new Set<string>();

  const push = (
    type: ReminderType,
    recipientId: string,
    entityType: 'registration' | 'tournament',
    entityId: string,
    deadlineIso: string,
  ): void => {
    const key = `${type}:${recipientId}:${entityId}`;
    if (seen.has(key) || input.sent.has(key)) return;
    seen.add(key);
    out.push({ type, recipientId, entityType, entityId, deadlineIso, key });
  };

  // (a) Early bird ending: every CONFIRMED member of a payable entry whose own seat is unpaid/declined.
  const earlyBirdMs = input.tournament.earlyBirdEndsAt
    ? Date.parse(input.tournament.earlyBirdEndsAt)
    : NaN;
  if (!Number.isNaN(earlyBirdMs) && windowOpen(nowMs, earlyBirdMs, earlyBirdHours)) {
    const deadlineIso = new Date(earlyBirdMs).toISOString();
    for (const entry of input.entries) {
      if (!PAYABLE_ENTRY_STATUSES.has(entry.status)) continue;
      for (const member of entry.members) {
        if (!member.confirmed) continue;
        const state = seatStateFor(entry, member.playerId);
        if (!state || !UNPAID_SEAT_STATES.has(state)) continue;
        push(
          'early_bird_ending',
          member.playerId,
          'registration',
          entry.registrationId,
          deadlineIso,
        );
      }
    }
  }

  // (b) Registration closing: same unpaid-confirmed-member recipients get registration_closing_unpaid;
  // live bare slot holders (no division chosen yet) get registration_closing_choose_division.
  const closeMs = input.tournament.registrationCloseAt
    ? Date.parse(input.tournament.registrationCloseAt)
    : NaN;
  if (!Number.isNaN(closeMs) && windowOpen(nowMs, closeMs, closeHours)) {
    const deadlineIso = new Date(closeMs).toISOString();
    for (const entry of input.entries) {
      if (!PAYABLE_ENTRY_STATUSES.has(entry.status)) continue;
      for (const member of entry.members) {
        if (!member.confirmed) continue;
        const state = seatStateFor(entry, member.playerId);
        if (!state || !UNPAID_SEAT_STATES.has(state)) continue;
        push(
          'registration_closing_unpaid',
          member.playerId,
          'registration',
          entry.registrationId,
          deadlineIso,
        );
      }
    }
    for (const slot of input.bareSlots) {
      if (!LIVE_BARE_SLOT_STATUSES.has(slot.status)) continue;
      push(
        'registration_closing_choose_division',
        slot.playerId,
        'tournament',
        input.tournament.id,
        deadlineIso,
      );
    }
  }

  // (c) Partner lock: an entry with an open seat or an unconfirmed member reminds every CONFIRMED
  // member (the unconfirmed one is not "reminded" - they have not answered an invite, which is a
  // different flow entirely).
  const lockMs = input.tournament.partnerLockEffectiveAt
    ? Date.parse(input.tournament.partnerLockEffectiveAt)
    : NaN;
  if (!Number.isNaN(lockMs) && windowOpen(nowMs, lockMs, lockHours)) {
    const deadlineIso = new Date(lockMs).toISOString();
    for (const entry of input.entries) {
      if (CLOSED_STATUSES.has(entry.status)) continue;
      const hasEmptySeat = entry.seats.some((s) => s.playerId === null);
      const hasUnconfirmedMember = entry.members.some((m) => !m.confirmed);
      if (!hasEmptySeat && !hasUnconfirmedMember) continue;
      for (const member of entry.members) {
        if (!member.confirmed) continue;
        push(
          'partner_lock_soon',
          member.playerId,
          'registration',
          entry.registrationId,
          deadlineIso,
        );
      }
    }
  }

  // Deterministic ordering: sort by the same key the caller dedupes on, independent of input order.
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
