'use server';

import { revalidateTag } from 'next/cache';
import { partnerInviteSchema } from '@vouchplay/validation';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { isBlockedBetween, checkActorCanInteract } from '@/lib/moderation/enforcement';
import { viewerIsStaff } from '@/lib/moderation/staff';
import { authorizeOrganizer } from '@/lib/tournaments/authz';
import { TOURNAMENTS_LIST_TAG, tournamentTag } from '@/lib/tournaments/queries';
import { computeRegistrationEligibility } from '@/lib/eligibility/compute';
import { notify, notifyMany } from '@/lib/notifications/create';
import {
  getActorMini,
  getTournamentMini,
  getTournamentOrganizerIds,
  getTeamMemberIds,
} from '@/lib/notifications/recipients';
import { notifyRegistrationTeam } from '@/lib/notifications/registration-notify';

export interface RegistrationActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Map a raised RPC exception message to user-safe copy. */
const RPC_ERRORS: Record<string, string> = {
  team_not_found: 'That team could not be found.',
  not_team_member: 'You are not on this team.',
  division_not_found: 'That division could not be found.',
  registration_closed: 'Registration is not open for this tournament.',
  division_closed: 'This division is not open for registration.',
  already_registered: 'This team is already registered for the division.',
  invitation_not_found: 'That invitation could not be found.',
  not_invitee: 'This invitation is not addressed to you.',
  not_pending: 'This invitation is no longer pending.',
  invitation_expired: 'This invitation has expired.',
  partner_conflict: 'One of you is already on a team in this division.',
  invalid_release_status: 'Invalid action.',
  registration_not_found: 'That registration could not be found.',
  player_changes_locked: 'Player registration changes are closed. Contact the organizer for help.',
  player_cancellation_not_allowed: 'This registration can no longer be cancelled by a player.',
  player_division_change_not_allowed: 'Only an unpaid pending registration can change division.',
  payment_already_started:
    'This entry already has payment activity. Contact the organizer for help.',
  target_division_not_found: 'That division is unavailable.',
  target_division_closed: 'That division is not open.',
  target_division_team_mismatch: 'Your team does not fit that division.',
  target_division_full: 'That division no longer has an available slot.',
  same_division: 'Choose a different division.',
  team_has_active_registration: 'Cancel the active registration before changing partner.',
};
function friendly(msg: string | undefined): string {
  if (!msg) return 'That action failed. Please try again.';
  for (const [key, text] of Object.entries(RPC_ERRORS)) if (msg.includes(key)) return text;
  return 'That action failed. Please try again.';
}

const ELIG_REVIEW = new Set(['review', 'skill_mismatch', 'ineligible_hard_rule']);

/** Fan out registration notifications after a team registers (§27.1, §27.3). Best-effort. */
async function notifyAfterRegister(
  tournamentId: string,
  teamId: string,
  registrationId: string,
  status: string | undefined,
) {
  try {
    const svc = createServiceClient();
    const [organizers, tm] = await Promise.all([
      getTournamentOrganizerIds(tournamentId),
      getTournamentMini(tournamentId),
    ]);
    const manageLink = tm.slug ? `/tournaments/${tm.slug}/manage` : '/tournaments';
    const registerLink = tm.slug ? `/tournaments/${tm.slug}?register=1` : '/tournaments';

    await notifyMany(organizers, {
      type: 'registration_submitted',
      params: { tournamentName: tm.name },
      link: manageLink,
      entityType: 'tournament',
      entityId: tournamentId,
    });

    const { data: reg } = await svc
      .from('registrations')
      .select('eligibility_status')
      .eq('id', registrationId)
      .maybeSingle();
    const elig = (reg as { eligibility_status: string } | null)?.eligibility_status;
    if (elig && ELIG_REVIEW.has(elig)) {
      await notifyMany(organizers, {
        type: 'eligibility_review_required',
        params: { tournamentName: tm.name },
        link: manageLink,
        entityType: 'tournament',
        entityId: tournamentId,
      });
    }

    if (status === 'waitlisted') {
      const members = await getTeamMemberIds(teamId);
      await notifyMany(members, {
        type: 'registration_waitlisted',
        params: { tournamentName: tm.name },
        link: registerLink,
        entityType: 'tournament',
        entityId: tournamentId,
      });
    }
  } catch {
    // best-effort
  }
}

async function revalTournament(tournamentId: string) {
  const svc = createServiceClient();
  const { data } = await svc
    .from('tournaments')
    .select('slug')
    .eq('id', tournamentId)
    .maybeSingle();
  const slug = (data as { slug: string } | null)?.slug;
  if (slug) revalidateTag(tournamentTag(slug));
  revalidateTag(TOURNAMENTS_LIST_TAG);
}

// ---------------------------------------------------------------------------
// Partner invitations (§20)
// ---------------------------------------------------------------------------
export async function invitePartner(
  tournamentId: string,
  _prev: RegistrationActionState,
  formData: FormData,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const parsed = partnerInviteSchema.safeParse({
    divisionId: formData.get('divisionId'),
    inviteeSlug: formData.get('inviteeSlug') ?? '',
    message: formData.get('message') ?? '',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const v = parsed.data;

  const statusErr = await checkActorCanInteract(user.id);
  if (statusErr) return { error: statusErr };

  const svc = createServiceClient();
  try {
    const [{ data: division }, { data: invitee }] = await Promise.all([
      svc
        .from('divisions')
        .select('id, tournament_id, format, status')
        .eq('id', v.divisionId)
        .maybeSingle(),
      svc.from('profiles').select('id, account_status').eq('slug', v.inviteeSlug).maybeSingle(),
    ]);
    const div = division as { tournament_id: string; format: string; status: string } | null;
    const inv = invitee as { id: string; account_status: string } | null;
    if (!div || div.tournament_id !== tournamentId) return { error: 'Division not found.' };
    if (div.format !== 'doubles')
      return { error: 'Partner invites are only for doubles divisions.' };
    if (!inv) return { error: 'No player found with that handle.' };
    if (inv.id === user.id) return { error: 'You cannot invite yourself.' };
    if (inv.account_status !== 'active') return { error: 'That player is unavailable.' };
    if (await isBlockedBetween(user.id, inv.id)) return { error: 'That invite is unavailable.' };
    // Conflicting-team prevention is authoritatively enforced in accept_partner_invitation (§20.3).

    const { error } = await svc.from('partner_invitations').insert({
      tournament_id: tournamentId,
      division_id: v.divisionId,
      inviter_id: user.id,
      invitee_id: inv.id,
      message: v.message ? v.message.trim() : null,
      expires_at: new Date(Date.now() + 7 * DAY_MS).toISOString(),
    });
    if (error) {
      if (String(error.message).includes('uq_partner_invitations_pending')) {
        return { error: 'You already have a pending invite to this player for this division.' };
      }
      return { error: 'Could not send the invite. Please try again.' };
    }
    const [me, tm] = await Promise.all([getActorMini(user.id), getTournamentMini(tournamentId)]);
    await notify({
      recipientId: inv.id,
      type: 'partner_invite_received',
      actorId: user.id,
      params: { actorName: me.name, tournamentName: tm.name },
      link: tm.slug ? `/tournaments/${tm.slug}?register=1` : '/tournaments',
      entityType: 'tournament',
      entityId: tournamentId,
    });
    await revalTournament(tournamentId);
  } catch {
    return { error: 'Invites are temporarily unavailable. Please try again shortly.' };
  }
  return { ok: true, message: 'Partner invite sent.' };
}

export interface PlayerSearchResult {
  slug: string;
  name: string;
  city: string | null;
}

/** Search active, onboarded players by name/nickname/city to invite as a partner (§20.1). */
export async function searchInvitablePlayers(q: string): Promise<PlayerSearchResult[]> {
  const user = await getOptionalUser();
  if (!user) return [];
  const term = q.trim();
  if (term.length < 2) return [];
  const svc = createServiceClient();
  const safe = term.replace(/[%,()]/g, ' ');
  const { data } = await svc
    .from('profiles')
    .select('slug, first_name, last_name, nickname, city')
    .eq('account_status', 'active')
    .not('onboarded_at', 'is', null)
    .neq('id', user.id)
    .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,nickname.ilike.%${safe}%`)
    .limit(8);
  return (
    (data ?? []) as {
      slug: string | null;
      first_name: string | null;
      last_name: string | null;
      nickname: string | null;
      city: string | null;
    }[]
  )
    .filter((p) => p.slug)
    .map((p) => ({
      slug: p.slug as string,
      name:
        [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
        p.nickname ||
        'VouchPlay player',
      city: p.city,
    }));
}

export async function respondInvitation(
  invitationId: string,
  accept: boolean,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { data: inv } = await svc
      .from('partner_invitations')
      .select('id, inviter_id, invitee_id, tournament_id, status')
      .eq('id', invitationId)
      .maybeSingle();
    const row = inv as {
      inviter_id: string;
      invitee_id: string;
      tournament_id: string;
      status: string;
    } | null;
    if (!row || row.invitee_id !== user.id) return { error: 'Invitation not found.' };
    if (row.status !== 'sent') return { error: 'This invitation is no longer pending.' };

    if (accept) {
      const { error } = await svc.rpc('accept_partner_invitation', {
        p_invitation_id: invitationId,
        p_actor: user.id,
      });
      if (error) return { error: friendly(error.message) };
      // Notify the inviter that their invite was accepted and the team is formed (§27.1).
      const [me, tm] = await Promise.all([
        getActorMini(user.id),
        getTournamentMini(row.tournament_id),
      ]);
      await notify({
        recipientId: row.inviter_id,
        type: 'partner_accepted',
        actorId: user.id,
        params: { actorName: me.name, tournamentName: tm.name },
        link: tm.slug ? `/tournaments/${tm.slug}?register=1` : '/tournaments',
        entityType: 'tournament',
        entityId: row.tournament_id,
      });
    } else {
      await svc.from('partner_invitations').update({ status: 'declined' }).eq('id', invitationId);
    }
    await revalTournament(row.tournament_id);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return {
    ok: true,
    message: accept ? 'Partner confirmed - your team is formed.' : 'Invitation declined.',
  };
}

export async function cancelInvitation(invitationId: string): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { data: inv } = await svc
      .from('partner_invitations')
      .select('inviter_id, tournament_id, status')
      .eq('id', invitationId)
      .maybeSingle();
    const row = inv as { inviter_id: string; tournament_id: string; status: string } | null;
    if (!row || row.inviter_id !== user.id) return { error: 'Invitation not found.' };
    if (row.status !== 'sent') return { error: 'This invitation is no longer pending.' };
    await svc.from('partner_invitations').update({ status: 'cancelled' }).eq('id', invitationId);
    await revalTournament(row.tournament_id);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Invitation cancelled.' };
}

// ---------------------------------------------------------------------------
// Registration (§21, §23) - transactional via RPCs
// ---------------------------------------------------------------------------
export async function registerTeam(
  teamId: string,
  tournamentId: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const statusErr = await checkActorCanInteract(user.id);
  if (statusErr) return { error: statusErr };
  const svc = createServiceClient();
  try {
    const { data, error } = await svc.rpc('register_team', { p_team_id: teamId, p_actor: user.id });
    if (error) return { error: friendly(error.message) };
    const regId = (data as { registration_id?: string } | null)?.registration_id;
    const status = (data as { status?: string } | null)?.status;
    if (regId) await computeRegistrationEligibility(regId);
    if (regId) await notifyAfterRegister(tournamentId, teamId, regId, status);
    await revalTournament(tournamentId);
    return {
      ok: true,
      message:
        status === 'waitlisted'
          ? 'Division is full - your team is on the waitlist.'
          : 'Slot held. Complete the next steps before the hold expires.',
    };
  } catch {
    return { error: 'Registration is temporarily unavailable.' };
  }
}

/** Create a one-player team for a singles division, then register it (§21.2). */
export async function registerSolo(
  tournamentId: string,
  divisionId: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const statusErr = await checkActorCanInteract(user.id);
  if (statusErr) return { error: statusErr };
  const svc = createServiceClient();
  try {
    const { data: division } = await svc
      .from('divisions')
      .select('format, status')
      .eq('id', divisionId)
      .maybeSingle();
    const div = division as { format: string; status: string } | null;
    if (!div) return { error: 'Division not found.' };
    if (div.format !== 'singles')
      return { error: 'This is a doubles division - form a team first.' };

    // Reuse an existing active team for this player in this division, else create a solo team.
    const { data: myTeamRows } = await svc
      .from('team_members')
      .select('team_id')
      .eq('player_id', user.id);
    const myTeamIds = ((myTeamRows ?? []) as { team_id: string }[]).map((r) => r.team_id);
    let teamId: string | undefined;
    if (myTeamIds.length > 0) {
      const { data: activeTeam } = await svc
        .from('teams')
        .select('id')
        .in('id', myTeamIds)
        .eq('division_id', divisionId)
        .in('status', ['forming', 'formed', 'locked'])
        .maybeSingle();
      teamId = (activeTeam as { id: string } | null)?.id;
    }
    if (!teamId) {
      const { data: team, error: teamErr } = await svc
        .from('teams')
        .insert({ tournament_id: tournamentId, division_id: divisionId, status: 'formed' })
        .select('id')
        .single();
      if (teamErr || !team) return { error: 'Could not create your entry.' };
      teamId = (team as { id: string }).id;
      await svc.from('team_members').insert({
        team_id: teamId,
        player_id: user.id,
        member_order: 1,
        confirmed_at: new Date().toISOString(),
      });
    }
    const { data, error } = await svc.rpc('register_team', { p_team_id: teamId, p_actor: user.id });
    if (error) return { error: friendly(error.message) };
    const regId = (data as { registration_id?: string } | null)?.registration_id;
    const status = (data as { status?: string } | null)?.status;
    if (regId) await computeRegistrationEligibility(regId);
    if (regId && teamId) await notifyAfterRegister(tournamentId, teamId, regId, status);
    await revalTournament(tournamentId);
    return {
      ok: true,
      message:
        status === 'waitlisted' ? "Division is full - you're on the waitlist." : 'Slot held.',
    };
  } catch {
    return { error: 'Registration is temporarily unavailable.' };
  }
}

export async function withdrawRegistration(
  registrationId: string,
  tournamentId: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { data: policyRows } = await svc
      .from('system_settings')
      .select('key')
      .in('key', [
        'player_registration_self_service_enabled',
        'player_registration_change_lock_hours_before_start',
      ]);
    const policyReady = (policyRows ?? []).length === 2;
    let data: unknown;
    let error: { message: string } | null;
    if (policyReady) {
      const result = await svc.rpc('player_cancel_registration', {
        p_registration_id: registrationId,
        p_actor: user.id,
      });
      data = result.data;
      error = result.error;
    } else {
      // Pre-0021 compatibility: retain the existing server-authorized cancellation path while the
      // new policy RPC is deliberately unavailable.
      const { data: reg } = await svc
        .from('registrations')
        .select('team_id')
        .eq('id', registrationId)
        .maybeSingle();
      const teamId = (reg as { team_id: string } | null)?.team_id;
      if (!teamId) return { error: 'Registration not found.' };
      const { data: member } = await svc
        .from('team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('player_id', user.id)
        .maybeSingle();
      if (!member) return { error: 'You are not on this team.' };
      const result = await svc.rpc('release_slot', {
        p_registration_id: registrationId,
        p_actor: user.id,
        p_new_status: 'withdrawn',
      });
      data = result.data;
      error = result.error;
    }
    if (error) return { error: friendly(error.message) };

    // Cancelling dissolves the team so both players are immediately free to register again with a new
    // partner - no separate "leave team" step. The partner is notified. We only dissolve once the team
    // has no remaining active registration (the one just cancelled was its only active entry).
    let dissolvedWithPartner = false;
    const { data: regRow } = await svc
      .from('registrations')
      .select('team_id')
      .eq('id', registrationId)
      .maybeSingle();
    const teamId = (regRow as { team_id: string } | null)?.team_id;
    if (teamId) {
      const { data: stillActive } = await svc
        .from('registrations')
        .select('id')
        .eq('team_id', teamId)
        .not('status', 'in', '(withdrawn,cancelled,rejected)')
        .limit(1);
      if (!stillActive || stillActive.length === 0) {
        const { data: memberRows } = await svc
          .from('team_members')
          .select('player_id')
          .eq('team_id', teamId);
        const others = ((memberRows ?? []) as { player_id: string }[])
          .map((m) => m.player_id)
          .filter((id) => id !== user.id);
        await svc.from('team_members').delete().eq('team_id', teamId);
        await svc
          .from('teams')
          .update({ status: 'disbanded', updated_at: new Date().toISOString() })
          .eq('id', teamId);
        await svc.from('audit_logs').insert({
          actor_id: user.id,
          actor_role: 'player',
          action: 'team_dissolved_on_cancellation',
          entity_type: 'team',
          entity_id: teamId,
          before_snapshot: { registration_id: registrationId },
          after_snapshot: { status: 'disbanded' },
        });
        if (others.length > 0) {
          dissolvedWithPartner = true;
          const [me, tmName] = await Promise.all([
            getActorMini(user.id),
            getTournamentMini(tournamentId),
          ]);
          await notifyMany(others, {
            type: 'partner_team_left',
            actorId: user.id,
            params: { actorName: me.name, tournamentName: tmName.name },
            link: tmName.slug ? `/tournaments/${tmName.slug}?register=1` : '/tournaments',
            entityType: 'tournament',
            entityId: tournamentId,
          });
        }
      }
    }

    // Notify organizers of the withdrawal, and any promoted team (§27.1, §27.3).
    const [organizers, tm] = await Promise.all([
      getTournamentOrganizerIds(tournamentId),
      getTournamentMini(tournamentId),
    ]);
    await notifyMany(organizers, {
      type: 'team_withdrawn',
      params: { tournamentName: tm.name },
      link: tm.slug ? `/tournaments/${tm.slug}/manage` : '/tournaments',
      entityType: 'tournament',
      entityId: tournamentId,
    });
    const promoted = (data as { promoted?: string | null } | null)?.promoted;
    if (promoted) await notifyRegistrationTeam(promoted, tournamentId, 'registration_promoted');
    await revalTournament(tournamentId);
    return {
      ok: true,
      message: dissolvedWithPartner
        ? 'Registration cancelled. Your team was dissolved and your partner was notified.'
        : 'Registration cancelled. You can register again anytime.',
    };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
}

/** Move an unpaid pending team into an immediately available compatible division (§1D). */
export async function moveRegistrationDivision(
  registrationId: string,
  targetDivisionId: string,
  tournamentId: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const statusErr = await checkActorCanInteract(user.id);
  if (statusErr) return { error: statusErr };
  const svc = createServiceClient();
  try {
    const { data, error } = await svc.rpc('move_player_registration', {
      p_registration_id: registrationId,
      p_target_division_id: targetDivisionId,
      p_actor: user.id,
    });
    if (error) return { error: friendly(error.message) };
    const movedId = (data as { registration_id?: string } | null)?.registration_id;
    if (movedId) await computeRegistrationEligibility(movedId);
    await revalTournament(tournamentId);
  } catch {
    return { error: 'Division changes are temporarily unavailable.' };
  }
  return { ok: true, message: 'Division changed. Your team and payment deadline were kept.' };
}

/** Leave a cancelled team before inviting a different partner. Active registered teams cannot change. */
export async function leaveTeamAfterCancellation(
  teamId: string,
  tournamentId: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { data, error } = await svc.rpc('leave_team_after_cancel', {
      p_team_id: teamId,
      p_actor: user.id,
    });
    if (error) return { error: friendly(error.message) };
    const remaining = (
      (data as { remaining_player_ids?: string[] } | null)?.remaining_player_ids ?? []
    ).filter((id): id is string => typeof id === 'string');
    if (remaining.length > 0) {
      const [me, tm] = await Promise.all([getActorMini(user.id), getTournamentMini(tournamentId)]);
      await notifyMany(remaining, {
        type: 'partner_team_left',
        actorId: user.id,
        params: { actorName: me.name, tournamentName: tm.name },
        link: tm.slug ? `/tournaments/${tm.slug}?register=1` : '/tournaments',
        entityType: 'tournament',
        entityId: tournamentId,
      });
    }
    await revalTournament(tournamentId);
  } catch {
    return { error: 'Partner changes are temporarily unavailable.' };
  }
  return { ok: true, message: 'You left the cancelled team. You can invite a new partner now.' };
}

// ---------------------------------------------------------------------------
// Club representation (§22) - player selects the clubs they represent for a tournament.
// ---------------------------------------------------------------------------
export async function setClubRepresentations(
  tournamentId: string,
  clubIds: string[],
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { data: t } = await svc
      .from('tournaments')
      .select('club_lock_at, max_clubs_per_player')
      .eq('id', tournamentId)
      .maybeSingle();
    const tourn = t as { club_lock_at: string | null; max_clubs_per_player: number } | null;
    if (!tourn) return { error: 'Tournament not found.' };
    // Single tournament-wide deadline (handover Phase 13.5). Edits are allowed even after payment
    // submission or confirmation, but never after this lock; only an organizer/Admin can override.
    if (tourn.club_lock_at && new Date(tourn.club_lock_at) < new Date()) {
      return { error: 'Club selections are locked. Contact the organizer for changes.' };
    }
    const ids = Array.from(new Set(clubIds)).slice(0, tourn.max_clubs_per_player);
    if (clubIds.length > tourn.max_clubs_per_player) {
      return { error: `You can represent at most ${tourn.max_clubs_per_player} clubs.` };
    }

    // Every selected club must be one the player is an ACTIVE member of (§22.2 default).
    if (ids.length > 0) {
      const { data: memberships } = await svc
        .from('club_memberships')
        .select('club_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .in('club_id', ids);
      const allowed = new Set(((memberships ?? []) as { club_id: string }[]).map((m) => m.club_id));
      if (ids.some((id) => !allowed.has(id))) {
        return { error: 'You can only represent clubs you are an active member of.' };
      }
    }

    // Snapshot the prior non-override selection for the immutable audit record.
    const { data: priorRows } = await svc
      .from('tournament_player_club_representations')
      .select('club_id, display_order')
      .eq('tournament_id', tournamentId)
      .eq('player_id', user.id)
      .eq('organizer_override', false)
      .order('display_order');
    const priorIds = ((priorRows ?? []) as { club_id: string }[]).map((r) => r.club_id);

    // Replace the player's non-override representations for this tournament.
    await svc
      .from('tournament_player_club_representations')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('player_id', user.id)
      .eq('organizer_override', false);
    if (ids.length > 0) {
      const rows = ids.map((club_id, i) => ({
        tournament_id: tournamentId,
        player_id: user.id,
        club_id,
        display_order: i + 1,
        membership_verified_at_selection: true,
        created_by: user.id,
      }));
      const { error } = await svc.from('tournament_player_club_representations').insert(rows);
      if (error) return { error: 'Could not save your club selection.' };
    }
    await svc.from('audit_logs').insert({
      actor_id: user.id,
      actor_role: 'player',
      action: 'club_representation_updated',
      entity_type: 'tournament',
      entity_id: tournamentId,
      before_snapshot: { player_id: user.id, club_ids: priorIds },
      after_snapshot: { player_id: user.id, club_ids: ids },
    });
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Club representation updated.' };
}

/**
 * Post-lock organizer/Admin override of a player's club representation (handover Phase 13.5). Allowed
 * after the tournament-wide club lock only for an authorized organizer (edit permission) or staff
 * Admin, requires a reason, and appends an immutable audit record. It sets the player's clubs but
 * never changes their team, division, fee, payment state, or eligibility.
 */
export async function overrideClubRepresentations(
  tournamentId: string,
  playerId: string,
  clubIds: string[],
  reason: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 4) return { error: 'Add a short reason for this override.' };

  const [organizer, staff] = await Promise.all([
    authorizeOrganizer(user.id, tournamentId, 'edit'),
    viewerIsStaff(),
  ]);
  if (!organizer && !staff) {
    return { error: 'You do not have permission to override club representation.' };
  }

  const svc = createServiceClient();
  try {
    const { data: t } = await svc
      .from('tournaments')
      .select('max_clubs_per_player')
      .eq('id', tournamentId)
      .maybeSingle();
    const tourn = t as { max_clubs_per_player: number } | null;
    if (!tourn) return { error: 'Tournament not found.' };
    const ids = Array.from(new Set(clubIds)).slice(0, tourn.max_clubs_per_player);

    const { data: priorRows } = await svc
      .from('tournament_player_club_representations')
      .select('club_id')
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId)
      .order('display_order');
    const priorIds = ((priorRows ?? []) as { club_id: string }[]).map((r) => r.club_id);

    await svc
      .from('tournament_player_club_representations')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId);
    if (ids.length > 0) {
      const rows = ids.map((club_id, i) => ({
        tournament_id: tournamentId,
        player_id: playerId,
        club_id,
        display_order: i + 1,
        membership_verified_at_selection: false,
        organizer_override: true,
        override_reason: trimmedReason,
        created_by: user.id,
      }));
      const { error } = await svc.from('tournament_player_club_representations').insert(rows);
      if (error) return { error: 'Could not save the override.' };
    }
    await svc.from('audit_logs').insert({
      actor_id: user.id,
      actor_role: staff && !organizer ? 'admin' : 'organizer',
      action: 'club_representation_override',
      entity_type: 'tournament',
      entity_id: tournamentId,
      before_snapshot: { player_id: playerId, club_ids: priorIds },
      after_snapshot: { player_id: playerId, club_ids: ids, reason: trimmedReason },
    });
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Club representation override saved.' };
}

// ---------------------------------------------------------------------------
// Organizer actions on registrations (§26.4) - confirm / reject.
// ---------------------------------------------------------------------------
export async function confirmRegistration(
  registrationId: string,
  tournamentId: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'approve_registrations'))) {
    return { error: 'You do not have permission to approve registrations.' };
  }
  const svc = createServiceClient();
  try {
    const { data: reg } = await svc
      .from('registrations')
      .select('status')
      .eq('id', registrationId)
      .maybeSingle();
    const prev = (reg as { status: string } | null)?.status;
    if (!prev) return { error: 'Registration not found.' };
    if (
      prev === 'waitlisted' ||
      prev === 'withdrawn' ||
      prev === 'cancelled' ||
      prev === 'rejected'
    ) {
      return { error: 'That registration cannot be confirmed from its current state.' };
    }
    await svc
      .from('registrations')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), reviewed_by: user.id })
      .eq('id', registrationId);
    await svc.from('registration_events').insert({
      registration_id: registrationId,
      actor_id: user.id,
      event_type: 'confirmed',
      from_status: prev,
      to_status: 'confirmed',
    });
    await notifyRegistrationTeam(registrationId, tournamentId, 'registration_confirmed');
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Registration confirmed.' };
}

export async function rejectRegistration(
  registrationId: string,
  tournamentId: string,
  reason: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'approve_registrations'))) {
    return { error: 'You do not have permission to reject registrations.' };
  }
  const svc = createServiceClient();
  try {
    const { data, error } = await svc.rpc('release_slot', {
      p_registration_id: registrationId,
      p_actor: user.id,
      p_new_status: 'rejected',
    });
    if (error) return { error: friendly(error.message) };
    if (reason.trim()) {
      await svc
        .from('registrations')
        .update({ review_reason: reason.trim() })
        .eq('id', registrationId);
    }
    await notifyRegistrationTeam(
      registrationId,
      tournamentId,
      'registration_rejected',
      reason.trim() || undefined,
    );
    const promoted = (data as { promoted?: string | null } | null)?.promoted;
    if (promoted) await notifyRegistrationTeam(promoted, tournamentId, 'registration_promoted');
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Registration rejected and slot released.' };
}
