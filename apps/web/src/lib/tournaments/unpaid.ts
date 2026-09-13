import 'server-only';
import { cache } from 'react';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { summarizeRegistration } from '@/lib/payments/slots';

/**
 * The unpaid-slot nudge (master_plan §2AP F): a first link in the app-shell nudge chain, ahead of the
 * reputation strips, for any signed-in player whose OWN slot is unsecured somewhere. Mirrors the
 * per-request `cache()` + user-lookup pattern `getViewerReputationNudge` uses in `lib/auth.ts` - the
 * user identity comes from the already-cached `getOptionalUser()` read, so this adds no new auth
 * round trip; the actual candidate data is read with the service client, column-explicit and bounded
 * (never a tournament-wide scan), per this codebase's non-negotiables. Never throws - any failure
 * degrades to "nothing unsecured" rather than breaking the shell.
 */

const CANDIDATE_LIMIT = 10;

export interface ViewerUnpaidSlots {
  count: number;
  first: { tournamentName: string; slug: string; registrationId: string | null } | null;
}

interface UnpaidEntry {
  tournamentId: string;
  registrationId: string | null;
  createdAt: string;
}

export const getViewerUnpaidSlots = cache(async (): Promise<ViewerUnpaidSlots> => {
  try {
    const user = await getOptionalUser();
    if (!user) return { count: 0, first: null };
    const svc = createServiceClient();

    const entries: UnpaidEntry[] = [];

    // Every CONFIRMED team the viewer is on - bounded, so an unusually prolific player never turns
    // this into a tournament-wide (or account-wide) scan.
    const { data: memberRows } = await svc
      .from('team_members')
      .select('team_id')
      .eq('player_id', user.id)
      .not('confirmed_at', 'is', null)
      .limit(CANDIDATE_LIMIT);
    const teamIds = Array.from(
      new Set(((memberRows ?? []) as { team_id: string }[]).map((m) => m.team_id)),
    );

    if (teamIds.length > 0) {
      const { data: regRows } = await svc
        .from('registrations')
        .select('id, tournament_id, status, created_at')
        .in('team_id', teamIds)
        .in('status', ['payment_pending', 'payment_submitted'])
        .order('created_at', { ascending: true })
        .limit(CANDIDATE_LIMIT);
      const regs = (regRows ?? []) as {
        id: string;
        tournament_id: string;
        status: string;
        created_at: string;
      }[];

      if (regs.length > 0) {
        // Only a tournament that is still `registration_open` counts - a closed one is the
        // organizer's problem now, not a nudge for the player.
        const tournamentIds = Array.from(new Set(regs.map((r) => r.tournament_id)));
        const { data: tournRows } = await svc
          .from('tournaments')
          .select('id, status')
          .in('id', tournamentIds)
          .eq('status', 'registration_open');
        const openTournamentIds = new Set(
          ((tournRows ?? []) as { id: string; status: string }[]).map((t) => t.id),
        );

        // An entry with a PENDING cancellation request is not something to nudge payment for - the
        // player already asked to leave (master_plan §2AT / banner fix). The latest cancellation-family
        // event per registration decides: `cancellation_requested` still open (not withdrawn / approved
        // / declined) means "don't nudge".
        const pendingCancelRegIds = new Set<string>();
        const { data: cancelEvents } = await svc
          .from('registration_events')
          .select('registration_id, event_type, created_at')
          .in(
            'registration_id',
            regs.map((r) => r.id),
          )
          .in('event_type', [
            'cancellation_requested',
            'cancellation_withdrawn',
            'cancellation_approved',
            'cancellation_declined',
          ])
          .order('created_at', { ascending: false });
        const latestCancelSeen = new Set<string>();
        for (const e of (cancelEvents ?? []) as { registration_id: string; event_type: string }[]) {
          if (latestCancelSeen.has(e.registration_id)) continue;
          latestCancelSeen.add(e.registration_id);
          if (e.event_type === 'cancellation_requested') pendingCancelRegIds.add(e.registration_id);
        }

        for (const r of regs) {
          if (!openTournamentIds.has(r.tournament_id)) continue;
          if (pendingCancelRegIds.has(r.id)) continue;
          if (r.status === 'payment_pending') {
            entries.push({
              tournamentId: r.tournament_id,
              registrationId: r.id,
              createdAt: r.created_at,
            });
            continue;
          }
          // `payment_submitted`: only unsecured when the VIEWER'S OWN seat is not covered - the
          // summary is computed only for this bounded handful of candidates, never tournament-wide.
          const summary = await summarizeRegistration(r.id);
          const mySeat = summary?.seats.find((s) => s.playerId === user.id)?.state ?? null;
          if (mySeat === 'unpaid' || mySeat === 'declined' || mySeat === 'topup') {
            entries.push({
              tournamentId: r.tournament_id,
              registrationId: r.id,
              createdAt: r.created_at,
            });
          }
        }
      }
    }

    // A declined bare slot with no live one behind it also counts (master_plan §2AP F) - the player
    // reserved a seat, the organizer rejected the receipt, and nothing else is holding money for
    // them. `tournament_slots` is upserted in place per (player, tournament) for a bare reservation
    // (see `submitSlotReservation`), so the newest row per tournament already speaks for that
    // tournament - deduping here mirrors `getLatestBareSlot` rather than re-reading it once per
    // tournament.
    const { data: bareRows } = await svc
      .from('tournament_slots')
      .select('id, tournament_id, status, created_at, dismissed_at, cancel_requested_at')
      .eq('player_id', user.id)
      .is('registration_id', null)
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_LIMIT);
    const latestBareByTournament = new Map<
      string,
      {
        status: string;
        created_at: string;
        dismissed_at: string | null;
        cancelRequestedAt: string | null;
      }
    >();
    for (const b of (bareRows ?? []) as {
      id: string;
      tournament_id: string;
      status: string;
      created_at: string;
      dismissed_at: string | null;
      cancel_requested_at: string | null;
    }[]) {
      if (!latestBareByTournament.has(b.tournament_id)) {
        latestBareByTournament.set(b.tournament_id, {
          status: b.status,
          created_at: b.created_at,
          dismissed_at: b.dismissed_at,
          cancelRequestedAt: b.cancel_requested_at,
        });
      }
    }
    for (const [tournamentId, latest] of latestBareByTournament) {
      if (latest.status !== 'rejected') continue;
      // The player removed the declined reservation (§2AT D) or asked to cancel it - nothing to nudge.
      if (latest.dismissed_at || latest.cancelRequestedAt) continue;
      entries.push({ tournamentId, registrationId: null, createdAt: latest.created_at });
    }

    if (entries.length === 0) return { count: 0, first: null };

    entries.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const firstEntry = entries[0]!;
    const { data: tournRow } = await svc
      .from('tournaments')
      .select('name, slug')
      .eq('id', firstEntry.tournamentId)
      .maybeSingle();
    const t = tournRow as { name: string; slug: string | null } | null;
    if (!t?.slug) return { count: entries.length, first: null };

    return {
      count: entries.length,
      first: {
        tournamentName: t.name,
        slug: t.slug,
        registrationId: firstEntry.registrationId,
      },
    };
  } catch {
    return { count: 0, first: null };
  }
});
