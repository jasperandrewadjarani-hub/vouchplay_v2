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
import { notifyRegistrationTeam } from '@/lib/notifications/registration-notify';

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
  'id, tournament_id, player_id, registration_id, division_id, status, amount_due, amount_submitted, currency, method, payer_name, transaction_reference, proof_storage_path, early_bird_applied, submitted_at, verified_by, verified_at, rejection_reason, notification_sent_at, created_at, updated_at';

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

/** The bare slot that speaks for this player: a live one first, else the most recent bare row of any
 *  status (so a declined reservation can still say "Declined - pay again"). */
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
    return rows.find((r) => LIVE_STATUSES.includes(r.status)) ?? rows[0] ?? null;
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
  const slots = (slotsByReg.get(registrationId) ?? []).map(toSeatSlotInput);

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
 * Detach every LIVE attached slot on a registration (all members, or one when `playerId` is given) -
 * "the money travels with the person" (master_plan §2AO A4): a partner leaving, a registration closed,
 * a member swapped out. Returns the number of rows detached. Never throws.
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
    const { data, error } = await query.select('id');
    if (error) throw error;
    return (data ?? []).length;
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
