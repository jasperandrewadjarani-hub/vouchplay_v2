import 'server-only';
import {
  isNextEntry,
  quoteFee,
  quoteSeats,
  type EntryRef,
  type PriceBasis,
  type SeatsQuote,
} from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Next-entry discount, server side (master_plan §2BQ). The rule and the arithmetic are pure
 * (`isNextEntry` / `quoteSeats` in packages/core); this module only gathers the facts they need, so
 * every payment path - team receipt, seat receipt, organizer cash - prices a seat the same way.
 *
 * WHAT COUNTS AS AN ENTRY: a registration in the tournament that is still live (not withdrawn,
 * cancelled, rejected or refunded), in a division that charges a fee, on which the player's team
 * membership is CONFIRMED. Unconfirmed invitations never count - otherwise anyone could invite a player
 * onto a throwaway entry and change what their real entry costs.
 */

const CLOSED_REG_STATUSES = ['withdrawn', 'cancelled', 'rejected', 'refunded'];

export interface PricingDivision {
  id: string;
  tournamentId: string;
  feeAmount: number;
  earlyBirdFeeAmount: number | null;
  nextEntryFeeAmount: number | null;
  currency: string;
  teamSize: number;
}

export interface PricingContext {
  division: PricingDivision;
  earlyBird: { startsAt: string | null; endsAt: string | null };
}

/** The division + tournament facts every quote needs. Null when either cannot be found. */
export async function loadPricingContext(divisionId: string): Promise<PricingContext | null> {
  const svc = createServiceClient();
  const { data: divRow } = await svc
    .from('divisions')
    .select(
      'id, tournament_id, fee_amount, early_bird_fee_amount, next_entry_fee_amount, currency, team_size',
    )
    .eq('id', divisionId)
    .maybeSingle();
  const d = divRow as {
    id: string;
    tournament_id: string;
    fee_amount: number;
    early_bird_fee_amount: number | null;
    next_entry_fee_amount: number | null;
    currency: string;
    team_size: number;
  } | null;
  if (!d) return null;
  const { data: tournRow } = await svc
    .from('tournaments')
    .select('early_bird_starts_at, early_bird_ends_at')
    .eq('id', d.tournament_id)
    .maybeSingle();
  const t = tournRow as {
    early_bird_starts_at: string | null;
    early_bird_ends_at: string | null;
  } | null;
  return {
    division: {
      id: d.id,
      tournamentId: d.tournament_id,
      feeAmount: Number(d.fee_amount),
      earlyBirdFeeAmount: d.early_bird_fee_amount != null ? Number(d.early_bird_fee_amount) : null,
      nextEntryFeeAmount: d.next_entry_fee_amount != null ? Number(d.next_entry_fee_amount) : null,
      currency: d.currency,
      teamSize: d.team_size,
    },
    earlyBird: { startsAt: t?.early_bird_starts_at ?? null, endsAt: t?.early_bird_ends_at ?? null },
  };
}

/** Each player's live entries in paid divisions of the tournament (confirmed membership only). */
export async function getPaidEntriesByPlayer(
  tournamentId: string,
  playerIds: readonly string[],
): Promise<Map<string, EntryRef[]>> {
  const out = new Map<string, EntryRef[]>();
  const ids = Array.from(new Set(playerIds.filter(Boolean)));
  for (const id of ids) out.set(id, []);
  if (ids.length === 0) return out;
  const svc = createServiceClient();
  const { data: memberRows } = await svc
    .from('team_members')
    .select('team_id, player_id, confirmed_at')
    .in('player_id', ids)
    .not('confirmed_at', 'is', null);
  const members = (memberRows ?? []) as { team_id: string; player_id: string }[];
  if (members.length === 0) return out;
  const teamIds = Array.from(new Set(members.map((m) => m.team_id)));
  const [{ data: regRows }, { data: divRows }] = await Promise.all([
    svc
      .from('registrations')
      .select('id, team_id, division_id, status, created_at')
      .eq('tournament_id', tournamentId)
      .in('team_id', teamIds)
      .not('status', 'in', `(${CLOSED_REG_STATUSES.join(',')})`),
    svc.from('divisions').select('id, fee_amount').eq('tournament_id', tournamentId),
  ]);
  const paidDivisions = new Set(
    ((divRows ?? []) as { id: string; fee_amount: number }[])
      .filter((d) => Number(d.fee_amount) > 0)
      .map((d) => d.id),
  );
  const regs = (
    (regRows ?? []) as {
      id: string;
      team_id: string;
      division_id: string;
      created_at: string;
    }[]
  ).filter((r) => paidDivisions.has(r.division_id));
  for (const m of members) {
    const list = out.get(m.player_id);
    if (!list) continue;
    for (const r of regs) {
      if (r.team_id === m.team_id && !list.some((e) => e.registrationId === r.id)) {
        list.push({ registrationId: r.id, createdAt: r.created_at });
      }
    }
  }
  return out;
}

export interface RegistrationSeatQuote extends SeatsQuote {
  currency: string;
  teamSize: number;
  /** One basis per seat in member order, comma-joined - what `payments.price_basis` stores. */
  basisSummary: string;
}

function summarizeBases(bases: readonly PriceBasis[]): string {
  return bases.join(',');
}

/**
 * Price every seat of an EXISTING registration (member order, open seats padded at full price). The
 * one quote the team receipt, the seat receipt and the organizer's cash button all read.
 */
export async function quoteRegistrationSeats(
  registrationId: string,
  at: Date = new Date(),
): Promise<RegistrationSeatQuote | null> {
  const svc = createServiceClient();
  const { data: regRow } = await svc
    .from('registrations')
    .select('id, team_id, division_id, tournament_id, created_at')
    .eq('id', registrationId)
    .maybeSingle();
  const reg = regRow as {
    id: string;
    team_id: string;
    division_id: string;
    tournament_id: string;
    created_at: string;
  } | null;
  if (!reg) return null;
  const [ctx, { data: memberRows }] = await Promise.all([
    loadPricingContext(reg.division_id),
    svc
      .from('team_members')
      .select('player_id, member_order')
      .eq('team_id', reg.team_id)
      .order('member_order', { ascending: true }),
  ]);
  if (!ctx) return null;
  const size = Math.max(1, ctx.division.teamSize || 1);
  const memberIds = ((memberRows ?? []) as { player_id: string }[])
    .map((m) => m.player_id)
    .slice(0, size);
  const target: EntryRef = { registrationId: reg.id, createdAt: reg.created_at };
  // Only look anything up when this division actually offers a next-entry price.
  const entries =
    ctx.division.nextEntryFeeAmount != null && ctx.division.feeAmount > 0
      ? await getPaidEntriesByPlayer(reg.tournament_id, memberIds)
      : new Map<string, EntryRef[]>();
  const seats = memberIds.map((playerId) => ({
    playerId: playerId as string | null,
    isNextEntry: entries.has(playerId) ? isNextEntry(entries.get(playerId) ?? [], target) : false,
  }));
  while (seats.length < size) seats.push({ playerId: null, isNextEntry: false });
  const quote = quoteSeats(
    {
      feeAmount: ctx.division.feeAmount,
      earlyBirdFeeAmount: ctx.division.earlyBirdFeeAmount,
      earlyBirdStartsAt: ctx.earlyBird.startsAt,
      earlyBirdEndsAt: ctx.earlyBird.endsAt,
      nextEntryFeeAmount: ctx.division.nextEntryFeeAmount,
    },
    seats,
    at,
  );
  return {
    ...quote,
    currency: ctx.division.currency,
    teamSize: size,
    basisSummary: summarizeBases(quote.seats.map((s) => s.basis)),
  };
}

/**
 * Price a team that does NOT exist yet (the wizard's Pay step, before `startEntry`): every named
 * player's seat is a next entry whenever they already hold a live paid entry. Open seats at full.
 */
export async function quoteNewEntrySeats(
  divisionId: string,
  playerIds: readonly (string | null)[],
  at: Date = new Date(),
): Promise<RegistrationSeatQuote | null> {
  const ctx = await loadPricingContext(divisionId);
  if (!ctx) return null;
  const size = Math.max(1, ctx.division.teamSize || 1);
  const named = playerIds.filter((p): p is string => Boolean(p)).slice(0, size);
  const entries =
    ctx.division.nextEntryFeeAmount != null && ctx.division.feeAmount > 0
      ? await getPaidEntriesByPlayer(ctx.division.tournamentId, named)
      : new Map<string, EntryRef[]>();
  const seats = named.map((playerId) => ({
    playerId: playerId as string | null,
    isNextEntry: isNextEntry(entries.get(playerId) ?? [], null),
  }));
  while (seats.length < size) seats.push({ playerId: null, isNextEntry: false });
  const quote = quoteSeats(
    {
      feeAmount: ctx.division.feeAmount,
      earlyBirdFeeAmount: ctx.division.earlyBirdFeeAmount,
      earlyBirdStartsAt: ctx.earlyBird.startsAt,
      earlyBirdEndsAt: ctx.earlyBird.endsAt,
      nextEntryFeeAmount: ctx.division.nextEntryFeeAmount,
    },
    seats,
    at,
  );
  return {
    ...quote,
    currency: ctx.division.currency,
    teamSize: size,
    basisSummary: summarizeBases(quote.seats.map((s) => s.basis)),
  };
}

/**
 * §2BQ loose end "cancelling the 1st entry": a seat PAID at the next-entry price whose registration is
 * no longer that player's next entry (their earlier entry was cancelled) owes the difference. Read-time,
 * so every cancellation path - player withdraw, organizer reject, hold expiry, refund - is covered
 * without each one having to remember to re-price. Returns the amount each such seat should now be due,
 * keyed by slot id; seats that are still next entries (or were never discounted) are absent.
 */
export async function nextEntryRepricing(
  registrationId: string,
  slots: readonly {
    id: string;
    playerId: string;
    priceBasis: string | null | undefined;
    amountDue: number;
    submittedAt: string | null;
  }[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const discounted = slots.filter((s) => s.priceBasis === 'next_entry');
  if (discounted.length === 0) return out;
  try {
    const svc = createServiceClient();
    const { data: regRow } = await svc
      .from('registrations')
      .select('id, division_id, tournament_id, created_at')
      .eq('id', registrationId)
      .maybeSingle();
    const reg = regRow as {
      id: string;
      division_id: string;
      tournament_id: string;
      created_at: string;
    } | null;
    if (!reg) return out;
    const [ctx, entries] = await Promise.all([
      loadPricingContext(reg.division_id),
      getPaidEntriesByPlayer(
        reg.tournament_id,
        discounted.map((s) => s.playerId),
      ),
    ]);
    if (!ctx) return out;
    const target: EntryRef = { registrationId: reg.id, createdAt: reg.created_at };
    for (const s of discounted) {
      if (isNextEntry(entries.get(s.playerId) ?? [], target)) continue;
      // No longer a next entry: the seat is owed what a 1st entry cost when its receipt was sent
      // (early bird still counts if the window was open then).
      const at = s.submittedAt ? new Date(s.submittedAt) : new Date();
      const firstEntry = quoteFee(
        {
          feeAmount: ctx.division.feeAmount,
          earlyBirdFeeAmount: ctx.division.earlyBirdFeeAmount,
          earlyBirdStartsAt: ctx.earlyBird.startsAt,
          earlyBirdEndsAt: ctx.earlyBird.endsAt,
          teamSize: 1,
        },
        at,
      );
      if (firstEntry.perPlayer > s.amountDue) out.set(s.id, firstEntry.perPlayer);
    }
  } catch {
    // Best-effort: a failed read leaves the stored amount as it is.
  }
  return out;
}
