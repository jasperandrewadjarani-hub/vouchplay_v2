import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Recipient resolution for organizer/club fan-out notifications (handover §27.3, §27.2). Uses the
 * service client; callers pass ids already known to be authorized contexts.
 */

/** Owner + active co-organizers of a tournament (§27.3 recipients). */
export async function getTournamentOrganizerIds(tournamentId: string): Promise<string[]> {
  const svc = createServiceClient();
  const [{ data: t }, { data: co }] = await Promise.all([
    svc.from('tournaments').select('owner_organizer_id').eq('id', tournamentId).maybeSingle(),
    svc
      .from('tournament_organizers')
      .select('user_id')
      .eq('tournament_id', tournamentId)
      .eq('status', 'active'),
  ]);
  const ids: string[] = [];
  const owner = (t as { owner_organizer_id: string } | null)?.owner_organizer_id;
  if (owner) ids.push(owner);
  for (const r of (co ?? []) as { user_id: string }[]) ids.push(r.user_id);
  return Array.from(new Set(ids));
}

/** A tournament's slug + name, for notification links/copy. */
export async function getTournamentMini(
  tournamentId: string,
): Promise<{ slug: string | null; name: string }> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('tournaments')
    .select('slug, name')
    .eq('id', tournamentId)
    .maybeSingle();
  const t = data as { slug: string | null; name: string } | null;
  return { slug: t?.slug ?? null, name: t?.name ?? 'a tournament' };
}

/** Player ids on a team (§27.1 recipients). */
export async function getTeamMemberIds(teamId: string): Promise<string[]> {
  const svc = createServiceClient();
  const { data } = await svc.from('team_members').select('player_id').eq('team_id', teamId);
  return ((data ?? []) as { player_id: string }[]).map((m) => m.player_id);
}

/** A display name + slug for an actor, for notification copy/links. */
export async function getActorMini(userId: string): Promise<{ name: string; slug: string | null }> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('profiles')
    .select('first_name, last_name, nickname, slug')
    .eq('id', userId)
    .maybeSingle();
  const p = data as {
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
    slug: string | null;
  } | null;
  const name =
    [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() ||
    p?.nickname ||
    'A VouchPlay player';
  return { name, slug: p?.slug ?? null };
}

/** Owners + admins of a club (§27.2 recipients). */
export async function getClubManagerIds(clubId: string): Promise<string[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('club_memberships')
    .select('user_id')
    .eq('club_id', clubId)
    .eq('status', 'active')
    .in('role', ['owner', 'admin']);
  return Array.from(new Set(((data ?? []) as { user_id: string }[]).map((m) => m.user_id)));
}
