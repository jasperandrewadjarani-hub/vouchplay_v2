'use server';

import type { PriceBasis } from '@vouchplay/core';
import { resolveActor } from '@/lib/guest/session';
import { createServiceClient } from '@/lib/supabase/service';
import { getActorMini } from '@/lib/notifications/recipients';
import { quoteNewEntrySeats, quoteRegistrationSeats } from '@/lib/tournaments/next-entry';

/**
 * The per-seat price a player is about to pay (master_plan §2BQ), for the wizard's Pay and Receipt
 * steps. The client only asks when the division offers a next-entry price - every other division
 * prices exactly as before without a round trip. Read-only; the amount actually charged is always
 * re-quoted by the payment action at submission.
 */

export interface EntryQuoteSeat {
  /** Null for a seat nobody fills yet. */
  playerId: string | null;
  isViewer: boolean;
  /** "You", the partner's name, or "Open seat". */
  label: string;
  perPlayer: number;
  standardPerPlayer: number;
  basis: PriceBasis;
}

export interface EntryQuote {
  currency: string;
  seats: EntryQuoteSeat[];
  total: number;
  saved: number;
}

export async function getEntryQuote(input: {
  divisionId: string;
  /** The entry, once `startEntry` has created it. */
  registrationId?: string | null;
  /** Before it exists: the partner named on the Partner step, if any. */
  partnerSlug?: string | null;
}): Promise<EntryQuote | null> {
  const actor = await resolveActor();
  if (!actor) return null;
  const svc = createServiceClient();
  try {
    let quote;
    if (input.registrationId) {
      const { data: regRow } = await svc
        .from('registrations')
        .select('team_id, division_id')
        .eq('id', input.registrationId)
        .maybeSingle();
      const reg = regRow as { team_id: string; division_id: string } | null;
      if (!reg || reg.division_id !== input.divisionId) return null;
      const { data: member } = await svc
        .from('team_members')
        .select('id')
        .eq('team_id', reg.team_id)
        .eq('player_id', actor.id)
        .maybeSingle();
      if (!member) return null;
      quote = await quoteRegistrationSeats(input.registrationId);
    } else {
      let partnerId: string | null = null;
      if (input.partnerSlug) {
        const { data: p } = await svc
          .from('profiles')
          .select('id')
          .eq('slug', input.partnerSlug)
          .maybeSingle();
        partnerId = (p as { id: string } | null)?.id ?? null;
      }
      quote = await quoteNewEntrySeats(input.divisionId, [actor.id, partnerId]);
    }
    if (!quote) return null;

    const seats = await Promise.all(
      quote.seats.map(async (s): Promise<EntryQuoteSeat> => {
        const isViewer = s.playerId === actor.id;
        const label = isViewer
          ? 'You'
          : s.playerId
            ? (await getActorMini(s.playerId)).name
            : 'Open seat';
        return {
          playerId: s.playerId,
          isViewer,
          label,
          perPlayer: s.perPlayer,
          standardPerPlayer: s.standardPerPlayer,
          basis: s.basis,
        };
      }),
    );
    // The viewer's own line first - it is the one they are most likely paying.
    seats.sort((a, b) => Number(b.isViewer) - Number(a.isViewer));
    return { currency: quote.currency, seats, total: quote.total, saved: quote.saved };
  } catch {
    return null;
  }
}
