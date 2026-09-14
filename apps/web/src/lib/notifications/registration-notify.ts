import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { notifyMany } from './create';
import { getTeamMemberIds, getTournamentMini } from './recipients';

/** master_plan §2BE B: the extra copy the newer organizer-powers notifications need (who did it,
 *  which division) - optional so every existing call site (which passes none of this) is unaffected. */
export interface NotifyRegistrationTeamExtra {
  actorId?: string | null;
  actorName?: string;
  divisionName?: string;
}

/**
 * Notify a registration's team members about a lifecycle change (handover §27.1). Shared by the
 * registration + payment actions. Best-effort - never throws into the caller.
 */
export async function notifyRegistrationTeam(
  registrationId: string,
  tournamentId: string,
  type: string,
  reason?: string,
  extra?: NotifyRegistrationTeamExtra,
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
      actorId: extra?.actorId ?? undefined,
      params: {
        tournamentName: tm.name,
        reason,
        actorName: extra?.actorName,
        divisionName: extra?.divisionName,
      },
      link: tm.slug ? `/tournaments/${tm.slug}?register=1` : '/tournaments',
      entityType: 'tournament',
      entityId: tournamentId,
    });
  } catch {
    // best-effort
  }
}
