import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { computeAutoBadges } from '@/lib/badges/compute';
import { reweightGivenVouches } from '@/lib/vouches/reweight';

/**
 * Side effects of a Coach / Organizer role change (§2BR): the matching badge is awarded or retired
 * straight away instead of at the nightly run, and - for Coach - the vouches this person gave AS a coach
 * move to coach weight (granted) or back to player weight (removed), re-scoring the players they vouched
 * for. Best-effort: the role change itself has already been saved.
 */
export async function afterRoleBadgeChange(
  userId: string,
  role: string,
  change: { actorId: string; granted: boolean },
): Promise<void> {
  if (role !== 'coach' && role !== 'organizer') return;
  try {
    const svc = createServiceClient();
    // The badge now follows the role, so a HAND-tagged copy (from before §2BR) is retired - otherwise
    // it would outlive a later role removal, because the badge job never touches granted rows.
    await svc
      .from('player_badges')
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: change.actorId,
        revoke_reason: 'Replaced by the role badge (master_plan 2BR)',
      })
      .eq('player_id', userId)
      .eq('badge_key', role)
      .eq('source', 'grant')
      .is('revoked_at', null);
    // Granting the role is an explicit decision to show its badge: lift any earlier "keep it off".
    if (change.granted) {
      await svc
        .from('player_badges')
        .update({ auto_blocked: false })
        .eq('player_id', userId)
        .eq('badge_key', role)
        .eq('auto_blocked', true);
    }
  } catch {
    // best-effort
  }
  await computeAutoBadges({ playerIds: [userId] }).catch(() => undefined);
  if (role === 'coach') await reweightGivenVouches(userId);
}
