'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { avatarUrl } from '@/lib/storage';
import { getOptionalUser } from '@/lib/auth';
import { checkActorCanInteract, isBlockedBetween } from '@/lib/moderation/enforcement';
import { writeAudit } from '@/lib/moderation/audit';
import { checkDivisionFit } from '@/lib/tournaments/division-fit-check';
import { tournamentTag, getPartnerMatchmakingEnabled } from '@/lib/tournaments/queries';
import { getPartnerSettings } from '@/lib/settings';
import {
  getPartnerDeck,
  loadEligibleDivisions,
  loadLiveSoloTeams,
  manilaDayStartIso,
  mapMatchDoorForViewer,
} from '@/lib/partners/deck';
import { createMatchIfMutual } from '@/lib/partners/match';
import type {
  PartnerActionState,
  PartnerDeckData,
  PartnerMatchView,
  SwipeResult,
} from '@/lib/partners/types';

/**
 * Partner-matchmaking player actions (master_plan §2AV F). Every write goes through the service
 * client, exactly as the schema comment on migration 0047 requires - `partner_searches`/
 * `partner_matches` have no client write policy at all, and `partner_swipes` has no client read
 * policy either, so the server is the only path in or out.
 */

const NOTE_MAX = 120;

async function requireActor(): Promise<{ id: string } | { error: string }> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const statusErr = await checkActorCanInteract(user.id);
  if (statusErr) return { error: statusErr };
  return { id: user.id };
}

async function loadTournamentMini(
  tournamentId: string,
): Promise<{ id: string; slug: string; name: string; status: string } | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('tournaments')
    .select('id, slug, name, status')
    .eq('id', tournamentId)
    .maybeSingle();
  return (data as { id: string; slug: string; name: string; status: string } | null) ?? null;
}

function revalPartnersSurfaces(slug: string): void {
  revalidateTag(tournamentTag(slug));
  revalidatePath(`/tournaments/${slug}/partners`);
}

/**
 * "Find a partner" opt-in (master_plan §2AV B). Reopening reuses the row (`unique (tournament_id,
 * player_id)`), which is also what makes an already-open search idempotent under a double submit.
 */
export async function openPartnerSearch(
  tournamentId: string,
  divisionIds: string[],
  note: string,
): Promise<PartnerActionState> {
  const actor = await requireActor();
  if ('error' in actor) return actor;

  const settings = await getPartnerSettings();
  if (!settings.enabled) return { error: 'Partner matchmaking is not available right now.' };
  // §2AV addendum 3: effective enabled = the Admin global setting AND the organizer's per-tournament
  // switch - mirrors the same defensive read `getPartnerSummary`/`getPartnerDeck` use (deck.ts),
  // fail-open true before migration 0048 is applied.
  if (!(await getPartnerMatchmakingEnabled(tournamentId))) {
    return { error: 'The organizer has turned off partner matchmaking for this tournament.' };
  }

  const tournament = await loadTournamentMini(tournamentId);
  if (!tournament) return { error: 'Tournament not found.' };
  if (tournament.status !== 'registration_open') {
    return { error: 'Registration is not open for this tournament.' };
  }

  const uniqueDivisionIds = Array.from(new Set(divisionIds.filter(Boolean)));
  if (uniqueDivisionIds.length === 0) {
    return { error: 'Choose at least one division.' };
  }

  const eligible = await loadEligibleDivisions(tournamentId);
  const eligibleIds = new Set(eligible.map((d) => d.id));
  for (const id of uniqueDivisionIds) {
    if (!eligibleIds.has(id)) return { error: 'One of those divisions is not open for doubles.' };
  }

  // Every division must be one the viewer FITS, or one they already hold a live seat in (§2AV B: an
  // open-seat entry's division is locked on, fit or not - the money already committed them to it).
  const seatMap = await loadLiveSoloTeams(tournamentId, uniqueDivisionIds, [actor.id]);
  const seatDivisionIds = new Set(seatMap.get(actor.id)?.keys() ?? []);
  for (const id of uniqueDivisionIds) {
    if (seatDivisionIds.has(id)) continue;
    const fitError = await checkDivisionFit(id, [{ playerId: actor.id, subject: 'you' }]);
    if (fitError) return { error: fitError };
  }

  const trimmedNote = note.trim().slice(0, NOTE_MAX) || null;
  const svc = createServiceClient();
  const nowIso = new Date().toISOString();
  const { error } = await svc.from('partner_searches').upsert(
    {
      tournament_id: tournamentId,
      player_id: actor.id,
      division_ids: uniqueDivisionIds,
      note: trimmedNote,
      status: 'open',
      closed_reason: null,
      last_active_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: 'tournament_id,player_id' },
  );
  if (error) return { error: 'Could not start your search. Please try again.' };

  await writeAudit({
    actorId: actor.id,
    action: 'partner.search_opened',
    entityType: 'tournament',
    entityId: tournamentId,
    after: { divisionIds: uniqueDivisionIds, note: trimmedNote },
  });
  revalPartnersSurfaces(tournament.slug);
  return { ok: true };
}

/** "Stop looking" (master_plan §2AV B) - every card of the searcher's disappears at once because the
 *  deck excludes any non-open search from the candidate pool. */
export async function closePartnerSearch(tournamentId: string): Promise<PartnerActionState> {
  const actor = await requireActor();
  if ('error' in actor) return actor;

  const tournament = await loadTournamentMini(tournamentId);
  if (!tournament) return { error: 'Tournament not found.' };

  const svc = createServiceClient();
  const { error, data } = await svc
    .from('partner_searches')
    .update({ status: 'closed', closed_reason: 'manual', updated_at: new Date().toISOString() })
    .eq('tournament_id', tournamentId)
    .eq('player_id', actor.id)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'Could not stop your search. Please try again.' };
  if (!data) return { error: 'You are not currently looking for a partner here.' };

  await writeAudit({
    actorId: actor.id,
    action: 'partner.search_closed',
    entityType: 'tournament',
    entityId: tournamentId,
    after: { reason: 'manual' },
  });
  revalPartnersSurfaces(tournament.slug);
  return { ok: true };
}

/** Same display-name convention `lib/partners/deck.ts` uses for cards (first+last, falling back to
 *  the nickname) - inlined here rather than imported since deck.ts keeps it private. */
function displayNameFromNames(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  nickname: string | null | undefined,
): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || nickname || 'VouchPlay player';
}

/** Same two-initial convention `lib/partners/deck.ts` uses for cards (first+last, falling back to
 *  the nickname's first letter) - inlined here rather than imported since deck.ts keeps it private. */
function initialsFromNames(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  nickname: string | null | undefined,
): string {
  const a = firstName?.trim()?.[0] ?? '';
  const b = lastName?.trim()?.[0] ?? '';
  const combined = `${a}${b}`.toUpperCase();
  if (combined) return combined;
  return (nickname?.trim()?.[0] ?? '?').toUpperCase();
}

/**
 * Swipe on a candidate (master_plan §2AV F). A right swipe attempts `createMatchIfMutual` right away,
 * in case this swipe is the one that completes an existing right swipe from the target. Two players
 * swiping right at the same instant can each land their own row before either reads the other's, so
 * neither request sees a reciprocal swipe here - `runPartnerMaintenance`'s reconciliation sweep
 * (`lib/partners/maintenance.ts`) catches that rare stranded pair afterward.
 */
export async function swipePartner(
  tournamentId: string,
  targetId: string,
  direction: 'right' | 'left',
): Promise<SwipeResult> {
  const actor = await requireActor();
  if ('error' in actor) return { ok: false, error: actor.error };
  const viewerId = actor.id;
  if (viewerId === targetId) return { ok: false, error: 'You cannot swipe on yourself.' };

  const tournament = await loadTournamentMini(tournamentId);
  if (!tournament) return { ok: false, error: 'Tournament not found.' };

  const svc = createServiceClient();
  // Only the VIEWER needs an open search - they are the one actively looking. The target does NOT
  // (master_plan §2AV cold-start fix): the deck surfaces open-seat entries, slot holders and
  // globally looking players who never opened a search here, and a right swipe on them is valid
  // discovery. A match still needs the target's own reciprocal right swipe, which they can only make
  // after opening their own search, so nobody is matched or invited without their action.
  const { data: viewerSearchRow } = await svc
    .from('partner_searches')
    .select('id, status, note, last_active_at')
    .eq('tournament_id', tournamentId)
    .eq('player_id', viewerId)
    .maybeSingle();
  const viewerSearch = viewerSearchRow as {
    id: string;
    status: string;
    note: string | null;
  } | null;
  if (!viewerSearch || viewerSearch.status !== 'open') {
    return { ok: false, error: 'Start looking for a partner here first.' };
  }
  if (await isBlockedBetween(viewerId, targetId)) {
    return { ok: false, error: 'That player is unavailable.' };
  }

  const todayStart = manilaDayStartIso();
  const { count: swipesToday } = await svc
    .from('partner_swipes')
    .select('id', { count: 'exact', head: true })
    .eq('swiper_id', viewerId)
    .eq('tournament_id', tournamentId)
    .gte('created_at', todayStart);
  const settings = await getPartnerSettings();
  if ((swipesToday ?? 0) >= settings.swipeDailyLimit) {
    return { ok: false, error: "You've reached today's swipe limit." };
  }

  const nowIso = new Date().toISOString();
  const { error: swipeError } = await svc.from('partner_swipes').upsert(
    {
      tournament_id: tournamentId,
      swiper_id: viewerId,
      target_id: targetId,
      direction,
      updated_at: nowIso,
    },
    { onConflict: 'tournament_id,swiper_id,target_id' },
  );
  if (swipeError) return { ok: false, error: 'Could not record that. Please try again.' };
  await svc
    .from('partner_searches')
    .update({ last_active_at: nowIso })
    .eq('tournament_id', tournamentId)
    .eq('player_id', viewerId);

  let matched: PartnerMatchView | null = null;

  if (direction === 'right') {
    const created = await createMatchIfMutual(tournamentId, viewerId, targetId);
    if (created) {
      const otherId = created.playerA === viewerId ? created.playerB : created.playerA;
      const { data: otherProfileRow } = await svc
        .from('profiles')
        .select('slug, first_name, last_name, nickname, avatar_path')
        .eq('id', otherId)
        .maybeSingle();
      const otherProfile = otherProfileRow as {
        slug: string | null;
        first_name: string | null;
        last_name: string | null;
        nickname: string | null;
        avatar_path: string | null;
      } | null;
      const otherSlug = otherProfile?.slug ?? null;
      matched = {
        id: created.id,
        partner: {
          playerId: otherId,
          slug: otherSlug ?? otherId,
          displayName: displayNameFromNames(
            otherProfile?.first_name,
            otherProfile?.last_name,
            otherProfile?.nickname,
          ),
          initials: initialsFromNames(
            otherProfile?.first_name,
            otherProfile?.last_name,
            otherProfile?.nickname,
          ),
          avatarUrl: avatarUrl(otherProfile?.avatar_path ?? null),
        },
        divisions: created.divisions,
        matchedAt: created.matchedAt,
        status: 'open',
        door: mapMatchDoorForViewer(created.door, viewerId, otherSlug, tournament.slug),
      };
    }
  }

  revalPartnersSurfaces(tournament.slug);
  const { count: swipesAfter } = await svc
    .from('partner_swipes')
    .select('id', { count: 'exact', head: true })
    .eq('swiper_id', viewerId)
    .eq('tournament_id', tournamentId)
    .gte('created_at', todayStart);
  const swipesLeftToday = Math.max(0, settings.swipeDailyLimit - (swipesAfter ?? 0));
  return {
    ok: true,
    matched,
    swipesLeftToday,
    canUndo: direction === 'left' && !matched,
  };
}

/** Undo the last "Not now" (master_plan §2AV E) - only ever the viewer's own most recent LEFT swipe
 *  in this tournament, and only while it never became a match. */
export async function undoLastSwipe(tournamentId: string): Promise<PartnerActionState> {
  const actor = await requireActor();
  if ('error' in actor) return actor;

  const svc = createServiceClient();
  const { data: lastRow } = await svc
    .from('partner_swipes')
    .select('id, target_id, direction')
    .eq('tournament_id', tournamentId)
    .eq('swiper_id', actor.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = lastRow as { id: string; target_id: string; direction: string } | null;
  if (!last || last.direction !== 'left') {
    return { error: 'There is nothing to undo.' };
  }

  const { error } = await svc.from('partner_swipes').delete().eq('id', last.id);
  if (error) return { error: 'Could not undo that. Please try again.' };

  const tournament = await loadTournamentMini(tournamentId);
  if (tournament) revalPartnersSurfaces(tournament.slug);
  return { ok: true };
}

/** Reload the deck for the signed-in viewer, or null when signed out (master_plan §2AV E). */
export async function refreshPartnerDeck(slug: string): Promise<PartnerDeckData | null> {
  const user = await getOptionalUser();
  if (!user) return null;
  return getPartnerDeck(slug, user.id);
}
