import 'server-only';
import { cache } from 'react';
import { createServiceClient } from '@/lib/supabase/service';
import { getViewerContext } from '@/lib/auth';

/**
 * Registration statuses that no longer count as "live" for the player they belong to (mirrors
 * `CLOSED_STATUSES` in `lib/tournaments/entry-view.ts` - kept as a literal set here rather than an
 * import so this module has no dependency on that page-facing file).
 */
const CLOSED_REGISTRATION_STATUSES = ['withdrawn', 'cancelled', 'rejected', 'refunded'];

/**
 * Tournament ids where `playerId` holds a live registration via a CONFIRMED `team_members` row
 * (master_plan §2AW). Bounded: a player's teams, and any one tournament's registrations, are both
 * small relative to the directory-scale ceiling documented in `players/queries.ts`. Service client -
 * `team_members`/`registrations` are not publicly readable, and only ids ever leave this function.
 * Memoised per request (per `playerId`) via React `cache()` - the same player's privilege can be
 * asked about more than once while rendering a single profile.
 */
const liveTournamentIdsForPlayer = cache(async (playerId: string): Promise<string[]> => {
  try {
    const svc = createServiceClient();
    const { data: memberRows } = await svc
      .from('team_members')
      .select('team_id')
      .eq('player_id', playerId)
      .not('confirmed_at', 'is', null);
    const teamIds = Array.from(
      new Set(((memberRows ?? []) as { team_id: string }[]).map((r) => r.team_id)),
    );
    if (teamIds.length === 0) return [];
    const { data: regRows } = await svc
      .from('registrations')
      .select('tournament_id')
      .in('team_id', teamIds)
      .not('status', 'in', `(${CLOSED_REGISTRATION_STATUSES.join(',')})`);
    return Array.from(
      new Set(((regRows ?? []) as { tournament_id: string }[]).map((r) => r.tournament_id)),
    );
  } catch {
    return [];
  }
});

/** Whether `viewerId` owns or is an ACTIVE co-organizer of any tournament in `tournamentIds`. */
async function organizesAnyTournament(viewerId: string, tournamentIds: string[]): Promise<boolean> {
  if (tournamentIds.length === 0) return false;
  try {
    const svc = createServiceClient();
    const { data: owned } = await svc
      .from('tournaments')
      .select('id')
      .in('id', tournamentIds)
      .eq('owner_organizer_id', viewerId)
      .limit(1);
    if ((owned ?? []).length > 0) return true;
    const { data: co } = await svc
      .from('tournament_organizers')
      .select('id')
      .in('tournament_id', tournamentIds)
      .eq('user_id', viewerId)
      .eq('status', 'active')
      .limit(1);
    return (co ?? []).length > 0;
  } catch {
    return false;
  }
}

/**
 * Whether `viewerId` may see `playerId`'s PRIVATE ratings (master_plan §2AW) even though the player
 * hid them from the public: true when the viewer is staff, OR an ACTIVE organizer/co-organizer of a
 * tournament in which the player holds a live registration (via a confirmed `team_members` row on a
 * registration that is not withdrawn/cancelled/rejected/refunded). Two bounded reads - the player's
 * live-tournament id set, then an organizer-of-any-of-those-ids check - both cached per request.
 * Never throws: any failure resolves to `false` (fails toward privacy, not exposure).
 */
export const isPrivilegedViewerFor = cache(
  async (viewerId: string | null, playerId: string): Promise<boolean> => {
    if (!viewerId) return false;
    try {
      const ctx = await getViewerContext();
      if (ctx.viewerId === viewerId && ctx.isStaff) return true;
      const tournamentIds = await liveTournamentIdsForPlayer(playerId);
      if (tournamentIds.length === 0) return false;
      return await organizesAnyTournament(viewerId, tournamentIds);
    } catch {
      return false;
    }
  },
);
