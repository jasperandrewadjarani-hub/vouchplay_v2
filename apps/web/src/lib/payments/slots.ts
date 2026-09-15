import 'server-only';
import { revalidateTag } from 'next/cache';
import type { TournamentSlotRow } from '@vouchplay/db';
import {
  summarizeEntryPayment,
  type EntryPaymentInput,
  type EntryPaymentSummary,
  type SeatSlotInput,
} from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';
import { isSlotReservationsEnabled, loadSettingNumber } from '@/lib/settings';
import { tournamentTag } from '@/lib/tournaments/queries';
import { notify } from '@/lib/notifications/create';
import { notifyRegistrationTeam } from '@/lib/notifications/registration-notify';
import { sendConfirmationEmailForRegistration } from './confirmation-email';
import { nextEntryRepricing, quoteRegistrationSeats } from '@/lib/tournaments/next-entry';

/**
 * The seat as the unit of payment (master_plan §2AO Decision A). This module is the ONLY place that
 * reads/writes `tournament_slots` from the app layer, so every caller (player actions, organizer
 * actions, the wizard queries, the notification email) shares one definition of "what does this
 * player's money state look like".
 *
 * `tournament_slots` arrives with migration 0042. EVERY read here is defensive: a missing table
 * degrades to "no slots" rather than breaking registration, exactly like the other pre-migration
 * reads in this codebase (`getTournamentRules`, `getPartnerLockAt`).
 */

export type SlotRow = TournamentSlotRow;

const SLOT_COLUMNS =
  'id, tournament_id, player_id, registration_id, division_id, status, amount_due, amount_submitted, currency, method, payer_name, transaction_reference, proof_storage_path, early_bird_applied, price_basis, submitted_at, verified_by, verified_at, rejection_reason, notification_sent_at, created_at, updated_at';

const LIVE_STATUSES = ['submitted', 'verified'];
/** Registration statuses `settleRegistration` is allowed to act on. A confirmed (or otherwise closed)
 *  registration is never touched - this is what makes every transition idempotent and non-downgrading. */
const ACTIONABLE_REG_STATUSES = new Set(['payment_pending', 'payment_submitted', 'under_review']);

async function revalTournament(tournamentId: string): Promise<void> {
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from('tournaments')
      .select('slug')
      .eq('id', tournamentId)
      .maybeSingle();
    const slug = (data as { slug: string } | null)?.slug;
    if (slug) revalidateTag(tournamentTag(slug));
  } catch {
    // best-effort
  }
}

/** Pure: the amount_due that results from attaching a bare slot's price to a division's own quote -
 *  never lower than what the player already committed to pay for their seat (§2AO A5/A7). */
export function raisedAmountDue(existingAmountDue: number, perPlayerDue: number): number {
  return Math.max(existingAmountDue, perPlayerDue);
}

function toSeatSlotInput(row: SlotRow): SeatSlotInput {
  return {
    playerId: row.player_id,
    status: row.status,
    amountDue: Number(row.amount_due),
    amountSubmitted: row.amount_submitted != null ? Number(row.amount_submitted) : null,
    createdAt: row.created_at,
  };
}

/** Every `tournament_slots` row (any status) attached to any of these registrations, grouped by
 *  registration id. Bounded (1000). Defensive - a missing table degrades to an empty map. */
export async function getSlotsByRegistration(
  registrationIds: string[],
): Promise<Map<string, SlotRow[]>> {
  const map = new Map<string, SlotRow[]>();
  const ids = Array.from(new Set(registrationIds.filter(Boolean)));
  if (ids.length === 0) return map;
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('tournament_slots')
      .select(SLOT_COLUMNS)
      .in('registration_id', ids)
      .limit(1000);
    if (error) throw error;
    for (const row of (data ?? []) as SlotRow[]) {
      if (!row.registration_id) continue;
      const list = map.get(row.registration_id) ?? [];
      list.push(row);
      map.set(row.registration_id, list);
    }
  } catch {
    // table missing before migration 0042, or any other read failure - degrade to "no slots".
  }
  return map;
}

/** This player's LIVE (submitted | verified) bare slot for this tournament, or null. The partial
 *  unique index guarantees at most one such row exists. */
export async function getBareSlot(tournamentId: string, playerId: string): Promise<SlotRow | null> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('tournament_slots')
      .select(SLOT_COLUMNS)
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId)
      .is('registration_id', null)
      .in('status', LIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as SlotRow | null) ?? null;
  } catch {
    return null;
  }
}

/** §2AT Decision D (migration 0045): defensive read of `dismissed_at` for a bounded set of slot ids -
 *  the column arrives with 0045 (unapplied at authoring time), so it lives in its OWN query, exactly
 *  like `getSlotCancelRequests` below handles the 0044 cancel columns. A missing column degrades to
 *  "not dismissed" rather than breaking the caller. */
export async function getSlotDismissedAt(slotIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const ids = Array.from(new Set(slotIds.filter(Boolean)));
  if (ids.length === 0) return map;
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('tournament_slots')
      .select('id, dismissed_at')
      .in('id', ids);
    if (error) throw error;
    for (const row of (data ?? []) as { id: string; dismissed_at: string | null }[]) {
      map.set(row.id, row.dismissed_at);
    }
  } catch {
    // Column not present yet (migration 0045 pending) - degrade to "not dismissed".
  }
  return map;
}

/** The bare slot that speaks for this player: a live one first, else the newest `rejected` row that
 *  has not been dismissed (master_plan §2AT Decision D) - so a declined reservation can still say
 *  "Declined - pay again" until the player removes it. NEVER a `refunded` row - once refunded the
 *  reservation is closed for good, same as a dismissed one. */
export async function getLatestBareSlot(
  tournamentId: string,
  playerId: string,
): Promise<SlotRow | null> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('tournament_slots')
      .select(SLOT_COLUMNS)
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId)
      .is('registration_id', null)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    const rows = (data ?? []) as SlotRow[];
    if (rows.length === 0) return null;
    const live = rows.find((r) => LIVE_STATUSES.includes(r.status));
    if (live) return live;
    const rejected = rows.filter((r) => r.status === 'rejected');
    if (rejected.length === 0) return null;
    const dismissed = await getSlotDismissedAt(rejected.map((r) => r.id));
    return rejected.find((r) => !dismissed.get(r.id)) ?? null;
  } catch {
    return null;
  }
}

/** Every slot row for a tournament (bare and attached, any status), newest first. Bounded (1000) -
 *  the organizer "Reserved slots" panel and the notification backfill. */
export async function getOrganizerSlots(tournamentId: string): Promise<SlotRow[]> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('tournament_slots')
      .select(SLOT_COLUMNS)
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    return (data ?? []) as SlotRow[];
  } catch {
    return [];
  }
}

/** §2AS F: `cancel_requested_at`/`cancel_reason` for a bounded set of slot ids, in its OWN query -
 *  these columns arrive with migration 0044 (extended, still unapplied), so they must not share
 *  `SLOT_COLUMNS` (combining them would make the whole slot read fail before that migration lands).
 *  A missing column/table degrades to "no cancel requests" rather than breaking the caller. */
export async function getSlotCancelRequests(
  slotIds: string[],
): Promise<Map<string, { cancelRequestedAt: string | null; cancelReason: string | null }>> {
  const map = new Map<string, { cancelRequestedAt: string | null; cancelReason: string | null }>();
  const ids = Array.from(new Set(slotIds.filter(Boolean)));
  if (ids.length === 0) return map;
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('tournament_slots')
      .select('id, cancel_requested_at, cancel_reason')
      .in('id', ids);
    if (error) throw error;
    for (const row of (data ?? []) as {
      id: string;
      cancel_requested_at: string | null;
      cancel_reason: string | null;
    }[]) {
      map.set(row.id, {
        cancelRequestedAt: row.cancel_requested_at,
        cancelReason: row.cancel_reason,
      });
    }
  } catch {
    // Columns not present yet (migration 0044 extended pending) - degrade to "no cancel requests".
  }
  return map;
}

export interface BuiltEntryPayment {
  input: EntryPaymentInput;
  registration: {
    id: string;
    tournament_id: string;
    team_id: string;
    division_id: string;
    status: string;
  };
  division: {
    fee_amount: number;
    early_bird_fee_amount: number | null;
    currency: string;
    team_size: number;
  };
  members: { player_id: string; confirmed_at: string | null }[];
}

/** Every column `summarizeEntryPayment` needs for one registration, gathered in one place so the
 *  player card, the organizer list, the email, and `settleRegistration` never disagree. Null when the
 *  registration or its division cannot be found. */
export async function buildEntryPaymentInput(
  registrationId: string,
): Promise<BuiltEntryPayment | null> {
  const svc = createServiceClient();
  const { data: regRow } = await svc
    .from('registrations')
    .select('id, tournament_id, team_id, division_id, status')
    .eq('id', registrationId)
    .maybeSingle();
  const registration = regRow as {
    id: string;
    tournament_id: string;
    team_id: string;
    division_id: string;
    status: string;
  } | null;
  if (!registration) return null;

  const { data: divRow } = await svc
    .from('divisions')
    .select('fee_amount, early_bird_fee_amount, currency, team_size')
    .eq('id', registration.division_id)
    .maybeSingle();
  const divisionRow = divRow as {
    fee_amount: number;
    early_bird_fee_amount: number | null;
    currency: string;
    team_size: number;
  } | null;
  if (!divisionRow) return null;

  const [{ data: memberRows }, { data: payRow }, slotsByReg] = await Promise.all([
    svc
      .from('team_members')
      .select('player_id, member_order, confirmed_at')
      .eq('team_id', registration.team_id)
      .order('member_order', { ascending: true }),
    svc.from('payments').select('status').eq('registration_id', registrationId).maybeSingle(),
    getSlotsByRegistration([registrationId]),
  ]);
  const members = (memberRows ?? []) as {
    player_id: string;
    member_order: number;
    confirmed_at: string | null;
  }[];
  const teamPayment = payRow as { status: string } | null;
  const slotRows = slotsByReg.get(registrationId) ?? [];
  // §2BQ: a seat paid at the next-entry price whose earlier entry was since cancelled is a 1st entry
  // now, and owes the difference - surfaced through the existing top-up state.
  const repriced = await nextEntryRepricing(
    registrationId,
    slotRows
      .filter((row) => LIVE_STATUSES.includes(row.status))
      .map((row) => ({
        id: row.id,
        playerId: row.player_id,
        priceBasis: row.price_basis,
        amountDue: Number(row.amount_due),
        submittedAt: row.submitted_at,
      })),
  );
  const slots = slotRows.map((row) => {
    const input = toSeatSlotInput(row);
    const due = repriced.get(row.id);
    return due != null ? { ...input, amountDue: due } : input;
  });

  const division = {
    fee_amount: Number(divisionRow.fee_amount),
    early_bird_fee_amount:
      divisionRow.early_bird_fee_amount != null ? Number(divisionRow.early_bird_fee_amount) : null,
    currency: divisionRow.currency,
    team_size: divisionRow.team_size,
  };

  const input: EntryPaymentInput = {
    teamSize: division.team_size,
    memberIds: members.map((m) => m.player_id),
    teamPayment: teamPayment ? { status: teamPayment.status } : null,
    slots,
    feeOwed: division.fee_amount > 0,
  };

  return {
    input,
    registration,
    division,
    members: members.map((m) => ({ player_id: m.player_id, confirmed_at: m.confirmed_at })),
  };
}

/** The one shared verdict on a registration's money state (master_plan §2AO A2). Null when the
 *  registration cannot be found. */
export async function summarizeRegistration(
  registrationId: string,
): Promise<EntryPaymentSummary | null> {
  const built = await buildEntryPaymentInput(registrationId);
  if (!built) return null;
  return summarizeEntryPayment(built.input);
}

/**
 * Attach a player's live bare slot to a registration (master_plan §2AO A4): entering a division with
 * a reserved seat, or a partner accepting an invitation with one already in hand. Raises `amount_due`
 * to at least the division's own per-player quote (never lowers it - a pricier division tops up, a
 * cheaper one does not refund). Returns false (a no-op) when reservations are disabled or the player
 * has no live bare slot - the caller falls back to "tell them a seat payment is due".
 */
export async function attachBareSlot(
  tournamentId: string,
  playerId: string,
  registrationId: string,
  perPlayerDue: number,
): Promise<boolean> {
  if (!(await isSlotReservationsEnabled())) return false;
  try {
    const slot = await getBareSlot(tournamentId, playerId);
    if (!slot) return false;
    const svc = createServiceClient();
    const { data: regRow } = await svc
      .from('registrations')
      .select('division_id')
      .eq('id', registrationId)
      .maybeSingle();
    const divisionId = (regRow as { division_id: string } | null)?.division_id ?? null;
    const { error } = await svc
      .from('tournament_slots')
      .update({
        registration_id: registrationId,
        division_id: divisionId,
        amount_due: raisedAmountDue(Number(slot.amount_due), perPlayerDue),
        updated_at: new Date().toISOString(),
      })
      .eq('id', slot.id)
      // Only attach if still bare - guards a race with a second attach attempt on the same slot.
      .is('registration_id', null);
    if (error) throw error;
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort `slot_released` notification for every player whose LIVE slot was just detached
 * (master_plan §2AP C5/Finding 2e): "a leaving player's slot detaches silently - they are not told it
 * is theirs to reuse." Grouped by tournament so a multi-row detach sends at most one notification per
 * player per tournament. Never throws - a notification failure must not surface as a detach failure.
 */
async function notifySlotsReleased(
  rows: { player_id: string; tournament_id: string }[],
): Promise<void> {
  if (rows.length === 0) return;
  try {
    const svc = createServiceClient();
    const byTournament = new Map<string, Set<string>>();
    for (const r of rows) {
      const set = byTournament.get(r.tournament_id) ?? new Set<string>();
      set.add(r.player_id);
      byTournament.set(r.tournament_id, set);
    }
    for (const [tournamentId, playerIds] of byTournament) {
      const { data } = await svc
        .from('tournaments')
        .select('name, slug')
        .eq('id', tournamentId)
        .maybeSingle();
      const t = data as { name: string; slug: string | null } | null;
      const link = t?.slug ? `/tournaments/${t.slug}?register=1` : '/tournaments';
      for (const playerId of playerIds) {
        await notify({
          recipientId: playerId,
          type: 'slot_released',
          params: { tournamentName: t?.name ?? 'a tournament' },
          link,
          entityType: 'tournament',
          entityId: tournamentId,
        });
      }
    }
  } catch {
    // best-effort
  }
}

/**
 * Detach every LIVE attached slot on a registration (all members, or one when `playerId` is given) -
 * "the money travels with the person" (master_plan §2AO A4): a partner leaving, a registration closed,
 * a member swapped out. Every player actually detached is notified `slot_released` (master_plan §2AP
 * C5) - the one shared place every detach site in `registration.ts` funnels through. Returns the
 * number of rows detached. Never throws.
 */
export async function detachSlots(registrationId: string, playerId?: string): Promise<number> {
  try {
    const svc = createServiceClient();
    let query = svc
      .from('tournament_slots')
      .update({ registration_id: null, updated_at: new Date().toISOString() })
      .eq('registration_id', registrationId)
      .in('status', LIVE_STATUSES);
    if (playerId) query = query.eq('player_id', playerId);
    const { data, error } = await query.select('id, player_id, tournament_id');
    if (error) throw error;
    const rows = (data ?? []) as { id: string; player_id: string; tournament_id: string }[];
    await notifySlotsReleased(rows);
    return rows.length;
  } catch {
    return 0;
  }
}

/**
 * Confirmation = fully paid (master_plan §2AO A3). Called after every payment/slot status change and
 * every seat change. No-op for a free division or a registration whose status is not one of
 * `payment_pending | payment_submitted | under_review` (a confirmed registration is NEVER downgraded).
 * Idempotent: calling it twice in a row for the same state never re-fires an event or notification.
 */
export async function settleRegistration(
  registrationId: string,
  actorId: string | null,
): Promise<EntryPaymentSummary | null> {
  const built = await buildEntryPaymentInput(registrationId);
  if (!built) return null;
  const { input, registration } = built;
  const summary = summarizeEntryPayment(input);

  if (!input.feeOwed) return summary;
  if (!ACTIONABLE_REG_STATUSES.has(registration.status)) return summary;

  const svc = createServiceClient();
  const now = new Date().toISOString();

  try {
    if (summary.fullyPaid) {
      await svc
        .from('registrations')
        .update({ status: 'confirmed', confirmed_at: now, reviewed_by: actorId })
        .eq('id', registrationId);
      await svc.from('registration_events').insert({
        registration_id: registrationId,
        actor_id: actorId,
        event_type: 'payment_verified',
        from_status: registration.status,
        to_status: 'confirmed',
      });
      await notifyRegistrationTeam(registrationId, registration.tournament_id, 'payment_verified');
      // §2AS D: best-effort confirmation email, never throws - covers single verify, bulk verify,
      // and every other path that reaches this branch (they all funnel through `settleRegistration`).
      await sendConfirmationEmailForRegistration(registrationId);
      await revalTournament(registration.tournament_id);
      return summary;
    }

    if (summary.anyReceipt && registration.status === 'payment_pending') {
      const graceHours = await loadSettingNumber('submitted_payment_review_grace_hours', 24);
      await svc
        .from('registrations')
        .update({
          status: 'payment_submitted',
          submitted_at: now,
          review_grace_expires_at: new Date(Date.now() + graceHours * 3600 * 1000).toISOString(),
        })
        .eq('id', registrationId);
      await revalTournament(registration.tournament_id);
      return summary;
    }

    if (!summary.anyReceipt && registration.status === 'payment_submitted') {
      const holdMin = await loadSettingNumber('slot_hold_minutes', 30);
      await svc
        .from('registrations')
        .update({
          status: 'payment_pending',
          review_grace_expires_at: null,
          slot_hold_expires_at: new Date(Date.now() + holdMin * 60 * 1000).toISOString(),
        })
        .eq('id', registrationId);
      await svc.from('registration_events').insert({
        registration_id: registrationId,
        actor_id: actorId,
        event_type: 'payment_reverted',
        from_status: 'payment_submitted',
        to_status: 'payment_pending',
        metadata: { reason: 'no live receipt on file' },
      });
      await revalTournament(registration.tournament_id);
      return summary;
    }
  } catch {
    // best-effort: the summary itself is still returned even when the state transition failed - the
    // next settle (or the review-grace/hold cron) will retry.
  }

  return summary;
}

/**
 * §2BS: an organizer merged a player's own solo entry (`fromRegistrationId`, now withdrawn) into
 * another team's entry (`toRegistrationId`). The player's money follows them:
 *  - a live seat slot on the old entry is re-attached to the new one;
 *  - otherwise a live TEAM receipt on the old entry (player paid for "the whole team" while alone) is
 *    copied into a seat slot on the new entry - same status, proof, reference and amount sent - so the
 *    organizer sees it on the kept team (any excess shows as overpaid for them to settle). The old
 *    payments row stays on the withdrawn entry as history.
 * Never lowers or duplicates: if the player already has a live seat on the new entry nothing moves.
 * Best-effort; returns what happened for the caller's audit/message.
 */
export async function moveMergedPlayerMoney(
  fromRegistrationId: string,
  toRegistrationId: string,
  playerId: string,
  actorId: string,
): Promise<{ movedSlot: boolean; copiedTeamReceipt: boolean }> {
  const out = { movedSlot: false, copiedTeamReceipt: false };
  try {
    const svc = createServiceClient();
    const { data: toRow } = await svc
      .from('registrations')
      .select('id, division_id, tournament_id')
      .eq('id', toRegistrationId)
      .maybeSingle();
    const toReg = toRow as { id: string; division_id: string; tournament_id: string } | null;
    if (!toReg) return out;

    const { data: existingRows } = await svc
      .from('tournament_slots')
      .select('id')
      .eq('registration_id', toRegistrationId)
      .eq('player_id', playerId)
      .in('status', LIVE_STATUSES)
      .limit(1);
    if ((existingRows ?? []).length > 0) return out;

    const { data: oldSlots } = await svc
      .from('tournament_slots')
      .select('id')
      .eq('registration_id', fromRegistrationId)
      .eq('player_id', playerId)
      .in('status', LIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1);
    const oldSlot = ((oldSlots ?? []) as { id: string }[])[0];
    if (oldSlot) {
      const { error } = await svc
        .from('tournament_slots')
        .update({
          registration_id: toRegistrationId,
          division_id: toReg.division_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', oldSlot.id);
      if (!error) {
        out.movedSlot = true;
        await svc.from('registration_events').insert({
          registration_id: toRegistrationId,
          actor_id: actorId,
          event_type: 'merged_payment_moved',
          metadata: {
            player_id: playerId,
            slot_id: oldSlot.id,
            from_registration: fromRegistrationId,
          },
        });
      }
      return out;
    }

    const { data: payRow } = await svc
      .from('payments')
      .select(
        'id, status, amount_submitted, amount_due, currency, method, payer_name, transaction_reference, proof_storage_path, submitted_at, verified_by, verified_at',
      )
      .eq('registration_id', fromRegistrationId)
      .in('status', LIVE_STATUSES)
      .maybeSingle();
    const pay = payRow as {
      id: string;
      status: string;
      amount_submitted: number | null;
      amount_due: number;
      currency: string;
      method: string | null;
      payer_name: string | null;
      transaction_reference: string | null;
      proof_storage_path: string | null;
      submitted_at: string | null;
      verified_by: string | null;
      verified_at: string | null;
    } | null;
    if (!pay) return out;

    const quote = await quoteRegistrationSeats(toRegistrationId);
    const seat = quote?.seats.find((s) => s.playerId === playerId);
    const sent = Number(pay.amount_submitted ?? pay.amount_due);
    const { data: inserted, error } = await svc
      .from('tournament_slots')
      .insert({
        tournament_id: toReg.tournament_id,
        player_id: playerId,
        registration_id: toRegistrationId,
        division_id: toReg.division_id,
        status: pay.status,
        amount_due: seat?.perPlayer ?? sent,
        amount_submitted: sent,
        currency: pay.currency,
        method: pay.method,
        payer_name: pay.payer_name,
        transaction_reference: pay.transaction_reference,
        proof_storage_path: pay.proof_storage_path,
        early_bird_applied: seat?.basis === 'early_bird',
        price_basis: seat?.basis ?? null,
        submitted_at: pay.submitted_at ?? new Date().toISOString(),
        verified_by: pay.verified_by,
        verified_at: pay.verified_at,
      })
      .select('id')
      .single();
    if (!error && inserted) {
      out.copiedTeamReceipt = true;
      await svc.from('registration_events').insert({
        registration_id: toRegistrationId,
        actor_id: actorId,
        event_type: 'merged_payment_moved',
        metadata: {
          player_id: playerId,
          slot_id: (inserted as { id: string }).id,
          from_registration: fromRegistrationId,
          from_payment: pay.id,
        },
      });
    }
  } catch {
    // best-effort - the organizer can still mark the seat paid by hand
  }
  return out;
}
