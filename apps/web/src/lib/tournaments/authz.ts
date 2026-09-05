import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Server-side tournament authorization (handover §17.1, §17.4). Owner has every permission; a
 * co-organizer must hold the specific permission in their permissions jsonb. `manage_organizers` is
 * owner-only. Used by both the tournament and registration server actions.
 */
export type OrganizerPerm =
  | 'edit'
  | 'manage_divisions'
  | 'send_announcements'
  | 'manage_organizers'
  | 'approve_registrations'
  | 'manage_payments'
  | 'export';

export async function authorizeOrganizer(
  userId: string,
  tournamentId: string,
  perm?: OrganizerPerm,
): Promise<{ isOwner: boolean } | null> {
  const svc = createServiceClient();
  const { data: t } = await svc
    .from('tournaments')
    .select('owner_organizer_id')
    .eq('id', tournamentId)
    .maybeSingle();
  const owner = (t as { owner_organizer_id: string } | null)?.owner_organizer_id;
  if (!owner) return null;
  if (owner === userId) return { isOwner: true };
  if (perm === 'manage_organizers') return null; // owner-only
  const { data: co } = await svc
    .from('tournament_organizers')
    .select('permissions')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (!co) return null;
  if (!perm) return { isOwner: false };
  const perms = (co as { permissions: Record<string, unknown> }).permissions ?? {};
  return perms[perm] === true ? { isOwner: false } : null;
}

/** True when the user holds an approved organizer/admin/super_admin role (§17.1). */
export async function hasOrganizerRole(userId: string): Promise<boolean> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('status', 'active')
    .in('role', ['organizer', 'admin', 'super_admin']);
  return (data ?? []).length > 0;
}
