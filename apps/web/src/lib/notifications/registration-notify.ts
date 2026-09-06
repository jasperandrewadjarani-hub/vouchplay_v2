import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { notifyMany } from './create';
import { getTeamMemberIds, getTournamentMini } from './recipients';

/**
 * Notify a registration's team members about a lifecycle change (handover §27.1). Shared by the
 * registration + payment actions. Best-effort - never throws into the caller.
 */
export async function notifyRegistrationTeam(
  registrationId: string,
  tournamentId: string,
  type: string,
  reason?: string,
): Promise<void> {
  try {
    const svc = createServiceClient();
    const { data: reg } = await svc
      .from('registrations')
      .select('team_id')
      .eq('id', registrationId)
      .maybeSingle();
    const teamId = (reg as { team_id: string } | null)?.team_id;
    if (!teamId) return;
    const [members, tm] = await Promise.all([
      getTeamMemberIds(teamId),
      getTournamentMini(tournamentId),
    ]);
    await notifyMany(members, {
      type,
      params: { tournamentName: tm.name, reason },
      link: tm.slug ? `/tournaments/${tm.slug}?register=1` : '/tournaments',
      entityType: 'tournament',
      entityId: tournamentId,
    });
  } catch {
    // best-effort
  }
}
