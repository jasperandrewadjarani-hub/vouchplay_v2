import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { isBlockedBetween } from '@/lib/moderation/enforcement';
import { checkDivisionFit } from '@/lib/tournaments/division-fit-check';
import { notify } from '@/lib/notifications/create';
import { getActorMini, getTournamentMini } from '@/lib/notifications/recipients';
import { tournamentTag } from '@/lib/tournaments/queries';
import { revalidateTag } from 'next/cache';

/**
 * The body of `invitePartner` (master_plan §20, extracted for §2AV F), pulled out of
 * `apps/web/src/lib/actions/registration.ts` (a `'use server'` file whose exports must all be async
 * server actions) into a callable, non-'use server' core - the same pattern `entry-core.ts` already
 * uses for the entry-creating RPC wrappers.
 *
 * Two callers, byte-for-byte identical behaviour:
 *  - `registration.ts`'s `invitePartner` (the wizard/form path) - a thin wrapper that resolves the
 *    session user, parses the form, and calls this with `inviteeSlug`.
 *  - The partner-matchmaking match door (`actions/partners.ts`, master_plan §2AV F) - the seat
 *    holder's swipe IS the consent, so it calls this directly with the other player's `inviteeId`
 *    (already known - no slug round trip) on the holder's behalf.
 */
export interface InviteOutcome {
  error?: string;
  ok?: true;
  message?: string;
  /** The created `partner_invitations` row id, when the invite was sent. */
  invitationId?: string;
}

export interface DoInvitePartnerInput {
  tournamentId: string;
  divisionId: string;
  /** The invitee's profile id - preferred when the caller already has it (e.g. the match door). */
  inviteeId?: string;
  /** The invitee's handle - used when only a slug is in hand (the wizard/form path). */
  inviteeSlug?: string;
  message?: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function revalTournament(tournamentId: string): Promise<void> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('tournaments')
    .select('slug')
    .eq('id', tournamentId)
    .maybeSingle();
  const slug = (data as { slug: string } | null)?.slug;
  if (slug) revalidateTag(tournamentTag(slug));
}

/**
 * Send a partner invitation for a doubles division. `userId` is the inviter - a session user for the
 * form path, or a seat holder being invited on their own behalf by the match door (§2AV F: "the
 * holder's swipe is the consent"). Every check `invitePartner` ran before this extraction still runs
 * here, in the same order, with the same user-facing copy.
 */
export async function doInvitePartner(
  userId: string,
  input: DoInvitePartnerInput,
): Promise<InviteOutcome> {
  const svc = createServiceClient();
  const message = input.message?.trim() ? input.message.trim() : null;
  try {
    const [{ data: division }, { data: invitee }] = await Promise.all([
      svc
        .from('divisions')
        .select('id, tournament_id, format, status')
        .eq('id', input.divisionId)
        .maybeSingle(),
      input.inviteeId
        ? svc.from('profiles').select('id, account_status').eq('id', input.inviteeId).maybeSingle()
        : svc
            .from('profiles')
            .select('id, account_status')
            .eq('slug', input.inviteeSlug ?? '')
            .maybeSingle(),
    ]);
    const div = division as { tournament_id: string; format: string; status: string } | null;
    const inv = invitee as { id: string; account_status: string } | null;
    if (!div || div.tournament_id !== input.tournamentId) return { error: 'Division not found.' };
    if (div.format !== 'doubles')
      return { error: 'Partner invites are only for doubles divisions.' };
    if (!inv) return { error: 'No player found with that handle.' };
    if (inv.id === userId) return { error: 'You cannot invite yourself.' };
    if (inv.account_status !== 'active') return { error: 'That player is unavailable.' };
    if (await isBlockedBetween(userId, inv.id)) return { error: 'That invite is unavailable.' };
    // Checked at the point the partner is NAMED, not when they answer (§2D). Sending an invitation
    // that can only be refused wastes the invitee's decision and the inviter's time.
    const fitError = await checkDivisionFit(input.divisionId, [
      { playerId: userId, subject: 'you' },
      { playerId: inv.id, subject: 'partner', name: (await getActorMini(inv.id)).name },
    ]);
    if (fitError) return { error: fitError };
    // Conflicting-team prevention is authoritatively enforced in accept_partner_invitation (§20.3).

    const { data: created, error } = await svc
      .from('partner_invitations')
      .insert({
        tournament_id: input.tournamentId,
        division_id: input.divisionId,
        inviter_id: userId,
        invitee_id: inv.id,
        message,
        expires_at: new Date(Date.now() + 7 * DAY_MS).toISOString(),
      })
      .select('id')
      .single();
    if (error) {
      if (String(error.message).includes('uq_partner_invitations_pending')) {
        return { error: 'You already have a pending invite to this player for this division.' };
      }
      return { error: 'Could not send the invite. Please try again.' };
    }
    const invitationId = (created as { id: string } | null)?.id;

    const [me, tm] = await Promise.all([
      getActorMini(userId),
      getTournamentMini(input.tournamentId),
    ]);
    await notify({
      recipientId: inv.id,
      type: 'partner_invite_received',
      actorId: userId,
      params: { actorName: me.name, tournamentName: tm.name },
      // The invitee ACCEPTS / declines this on the Partner invitations card, not in the registration
      // wizard `?register=1` used to open (§2AS fix).
      link: tm.slug ? `/tournaments/${tm.slug}#partner-invitations` : '/tournaments',
      entityType: 'tournament',
      entityId: input.tournamentId,
    });
    await revalTournament(input.tournamentId);
    return { ok: true, message: 'Partner invite sent.', invitationId };
  } catch {
    return { error: 'Invites are temporarily unavailable. Please try again shortly.' };
  }
}
