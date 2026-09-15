import 'server-only';
import { revalidateTag } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { checkDivisionFit } from '@/lib/tournaments/division-fit-check';
import { computeRegistrationEligibility } from '@/lib/eligibility/compute';
import { isBlockedBetween } from '@/lib/moderation/enforcement';
import { logRpcRefusal } from '@/lib/moderation/audit';
import { notify, notifyMany } from '@/lib/notifications/create';
import {
  getActorMini,
  getTournamentMini,
  getTournamentOrganizerIds,
  getTeamMemberIds,
} from '@/lib/notifications/recipients';
import { tournamentTag } from '@/lib/tournaments/queries';

/**
 * The three core entry-creating helpers, shared by both the signed-in registration actions
 * (`apps/web/src/lib/actions/registration.ts` - `registerSolo` / `enterDoublesSolo` /
 * `enterWithPendingPartner` / `startEntry`) and the guest wizard (`actions/guest-registration.ts`
 * `startGuestEntry`, master_plan §2AU). Pulled out of `registration.ts` (a `'use server'` file, whose
 * exports must all be async server actions) so a plain profile id - session or guest - can call them
 * directly without going through `checkActorCanInteract`'s session-user gate.
 *
 * This module intentionally keeps its OWN small copies of the RPC-error mapping / notification-fanout
 * helpers those three functions need, rather than importing the private (non-exported) versions still
 * used by the rest of `registration.ts` - the two copies give identical user-facing text, and keeping
 * them separate means this extraction touches nothing else in that 3000+ line file.
 */

/** The shared shape every entry-creating helper below returns, before its exported wrapper adapts it
 *  to `RegistrationActionState` (master_plan §2AO B) or to the guest wizard's own result shape. */
export interface EntryOutcome {
  error?: string;
  refresh?: boolean;
  registrationId?: string;
  teamId?: string;
  status?: string;
  message?: string;
}

/** master_plan §2AP C3: the same stale-team sentence used everywhere this refusal can surface. */
const STALE_TEAM_MESSAGE = 'This team has changed since you opened the page. Refreshing…';

/** Map a raised RPC exception message to user-safe copy - the same mapping `registration.ts` keeps
 *  privately for its own call sites (kept in sync by hand; see module doc above). */
const RPC_ERRORS: Record<string, string> = {
  team_not_found: 'That team could not be found.',
  not_team_member: STALE_TEAM_MESSAGE,
  division_not_found: 'That division could not be found.',
  registration_closed: 'Registration is not open for this tournament.',
  division_closed: 'This division is not open for registration.',
  already_registered: 'This team is already registered for the division.',
  invitation_not_found: 'That invitation could not be found.',
  not_invitee: 'This invitation is not addressed to you.',
  not_pending: 'This invitation is no longer pending.',
  invitation_expired: 'This invitation has expired.',
  partner_conflict: 'That player is already on a team with someone else in this division.',
  team_paid_not_mergeable:
    '{name} already paid for a whole team in this division - ask the organizer to combine your entries.',
  invalid_release_status: 'Invalid action.',
  registration_not_found: 'That registration could not be found.',
  player_changes_locked: 'Player registration changes are closed. Contact the organizer for help.',
  player_cancellation_not_allowed: 'This registration can no longer be cancelled by a player.',
  player_division_change_not_allowed: 'Only an unpaid pending registration can change division.',
  payment_already_started:
    'Your partner has already paid their slot, so this entry can only be cancelled by the organizer. Use Request to cancel.',
  target_division_not_found: 'That division is unavailable.',
  target_division_closed: 'That division is not open.',
  target_division_team_mismatch: 'Your team does not fit that division.',
  target_division_full: 'That division no longer has an available slot.',
  same_division: 'Choose a different division.',
  team_has_active_registration: 'Cancel the active registration before changing partner.',
  partner_does_not_fit_division:
    'That player does not fit this division. They need the same skill level and the same gender the division is for.',
  no_partner_to_replace: 'There is no partner on this team to change.',
  same_partner: 'That is already your partner.',
  seat_not_vacant: 'This team already has a partner.',
  no_declined_invitation: 'You can only name a replacement after your partner declines.',
  partner_lock_passed:
    'The partner lock-in for this tournament has passed. Contact the organizer to change partners.',
  mixed_pair: 'Mixed doubles needs one male and one female player.',
  partner_confirmed_needs_release:
    'Your partner has already confirmed. Ask them to release the seat first.',
  release_already_pending: 'A partner change is already waiting for an answer.',
  not_approver: 'Only your partner can answer this request.',
  invitation_pending: 'Your invited partner has not answered yet. Withdraw that invite first.',
  player_does_not_fit: "That player does not meet this division's rules.",
  no_partner_to_release: 'There is no confirmed partner on this team yet.',
};

function friendly(msg: string | undefined, name?: string | null): string {
  if (!msg) return 'That action failed. Please try again.';
  for (const [key, text] of Object.entries(RPC_ERRORS))
    if (msg.includes(key)) return text.replace('{name}', name ?? 'That player');
  return 'That action failed. Please try again.';
}

async function friendlyLogged(
  actorId: string | null,
  fn: string,
  message: string | undefined,
  entity?: { entityType?: string; entityId?: string | null },
  name?: string | null,
): Promise<{ error: string; refresh?: true }> {
  await logRpcRefusal({
    actorId,
    fn,
    code: message ?? 'unknown',
    entityType: entity?.entityType,
    entityId: entity?.entityId ?? null,
  });
  const text = friendly(message, name);
  return message?.includes('not_team_member') ? { error: text, refresh: true } : { error: text };
}

/** One player's `sex`, for the mixed-doubles composition check (§2AM decision 1). */
async function getPlayerSex(
  svc: ReturnType<typeof createServiceClient>,
  playerId: string,
): Promise<'male' | 'female' | null> {
  const { data } = await svc.from('profiles').select('sex').eq('id', playerId).maybeSingle();
  return (data as { sex: 'male' | 'female' | null } | null)?.sex ?? null;
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
}

/**
 * Create the team, name the partner, and register - in one step (master_plan §1U). The partner is
 * added UNCONFIRMED - `register_team` has always permitted this. `userId` is the acting player's
 * profile id: a session user for the signed-in wrapper, or a guest's shadow profile id for the
 * wizard (master_plan §2AU) - never a partner-invite path for guests (they cannot yet invite by
 * email; §2AU deferred phase 2).
 */
export async function doEnterWithPendingPartner(
  tournamentId: string,
  v: { divisionId: string; inviteeSlug: string; message?: string },
  userId: string,
): Promise<EntryOutcome> {
  const svc = createServiceClient();
  const [{ data: division }, { data: invitee, error: inviteeError }] = await Promise.all([
    svc
      .from('divisions')
      .select('id, tournament_id, format, status')
      .eq('id', v.divisionId)
      .maybeSingle(),
    svc
      .from('profiles')
      .select('id, account_status, onboarded_at')
      .eq('slug', v.inviteeSlug)
      .maybeSingle(),
  ]);
  if (inviteeError) return { error: 'Could not look up that player. Please try again.' };
  const div = division as { tournament_id: string; format: string; status: string } | null;
  const inv = invitee as {
    id: string;
    account_status: string;
    onboarded_at: string | null;
  } | null;
  if (!div || div.tournament_id !== tournamentId) return { error: 'Division not found.' };
  if (div.format !== 'doubles') return { error: 'Partner entry is only for doubles divisions.' };
  if (!inv) return { error: 'No player found with that handle.' };
  if (inv.id === userId) return { error: 'You cannot enter yourself as your own partner.' };
  if (inv.account_status !== 'active' || !inv.onboarded_at)
    return {
      error: 'That player cannot be entered yet. Ask them to finish their profile first.',
    };
  if (await isBlockedBetween(userId, inv.id)) return { error: 'That partner is unavailable.' };

  const [actorSex, inviteeSex] = await Promise.all([
    getPlayerSex(svc, userId),
    getPlayerSex(svc, inv.id),
  ]);
  const fitError = await checkDivisionFit(v.divisionId, [
    { playerId: userId, subject: 'you', partnerSex: inviteeSex },
    {
      playerId: inv.id,
      subject: 'partner',
      name: (await getActorMini(inv.id)).name,
      partnerSex: actorSex,
    },
  ]);
  if (fitError) return { error: fitError };

  const { data: created, error: teamError } = await svc.rpc('create_team_with_pending_partner', {
    p_tournament_id: tournamentId,
    p_division_id: v.divisionId,
    p_inviter: userId,
    p_invitee: inv.id,
    p_message: v.message ? v.message.trim() : null,
    p_expires_at: null,
  });
  if (teamError) {
    return await friendlyLogged(
      userId,
      'create_team_with_pending_partner',
      teamError.message,
      undefined,
      (await getActorMini(inv.id)).name,
    );
  }
  const teamId = (created as { team_id?: string } | null)?.team_id;
  if (!teamId) return { error: 'Could not start your entry. Please try again.' };

  const { data: reg, error: regError } = await svc.rpc('register_team', {
    p_team_id: teamId,
    p_actor: userId,
  });
  if (regError) return await friendlyLogged(userId, 'register_team', regError.message);
  const regId = (reg as { registration_id?: string } | null)?.registration_id;
  const status = (reg as { status?: string } | null)?.status;
  if (regId) await computeRegistrationEligibility(regId);

  const [me, tm] = await Promise.all([getActorMini(userId), getTournamentMini(tournamentId)]);
  await notify({
    recipientId: inv.id,
    type: 'partner_named_paid',
    actorId: userId,
    params: { actorName: me.name, tournamentName: tm.name },
    link: tm.slug ? `/tournaments/${tm.slug}#partner-invitations` : '/tournaments',
    entityType: 'tournament',
    entityId: tournamentId,
  });
  await revalTournament(tournamentId);
  return {
    registrationId: regId,
    teamId,
    status,
    message:
      status === 'waitlisted'
        ? 'This division is full, so your team joined the waitlist. Your partner has been notified.'
        : 'Your slot is held. Pay now to reserve it - your partner has been notified and can confirm any time.',
  };
}

/** Create a one-player team for a singles division, then register it (§21.2). `userId` is the acting
 *  player's profile id (session or guest). */
export async function doRegisterSolo(
  tournamentId: string,
  divisionId: string,
  userId: string,
  /** §2BS: set when an ORGANIZER enters this player (caller already authorized) - skips division fit. */
  opts: { organizerId?: string } = {},
): Promise<EntryOutcome> {
  const svc = createServiceClient();
  const { data: division } = await svc
    .from('divisions')
    .select('format, status')
    .eq('id', divisionId)
    .maybeSingle();
  const div = division as { format: string; status: string } | null;
  if (!div) return { error: 'Division not found.' };
  if (div.format !== 'singles') return { error: 'This is a doubles division - form a team first.' };

  if (!opts.organizerId) {
    const fitError = await checkDivisionFit(divisionId, [{ playerId: userId, subject: 'you' }]);
    if (fitError) return { error: fitError };
  }

  // Reuse an existing active team for this player in this division, else create a solo team.
  const { data: myTeamRows } = await svc
    .from('team_members')
    .select('team_id')
    .eq('player_id', userId);
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
      player_id: userId,
      member_order: 1,
      confirmed_at: new Date().toISOString(),
    });
  }
  const { data, error } = await svc.rpc('register_team', { p_team_id: teamId, p_actor: userId });
  if (error) return await friendlyLogged(userId, 'register_team', error.message);
  const regId = (data as { registration_id?: string } | null)?.registration_id;
  const status = (data as { status?: string } | null)?.status;
  if (regId) await computeRegistrationEligibility(regId);
  if (regId && teamId) await notifyAfterRegister(tournamentId, teamId, regId, status);
  await revalTournament(tournamentId);
  return {
    registrationId: regId,
    teamId,
    status,
    message: status === 'waitlisted' ? "Division is full - you're on the waitlist." : 'Slot held.',
  };
}

/**
 * "Enter now, choose a partner later" (master_plan §2AM decision 2). Creates a `forming` doubles team
 * with ONE confirmed member (`userId`) and registers it immediately - the open second seat is a
 * first-class state (`seatOpen`).
 */
export async function doEnterDoublesSolo(
  tournamentId: string,
  divisionId: string,
  userId: string,
  /** §2BS: set when an ORGANIZER enters this player (caller already authorized) - skips division fit. */
  opts: { organizerId?: string } = {},
): Promise<EntryOutcome> {
  const svc = createServiceClient();
  const { data: division } = await svc
    .from('divisions')
    .select('format, status')
    .eq('id', divisionId)
    .maybeSingle();
  const div = division as { format: string; status: string } | null;
  if (!div) return { error: 'Division not found.' };
  if (div.format !== 'doubles')
    return { error: 'This is a singles division - use Register instead.' };

  if (!opts.organizerId) {
    const fitError = await checkDivisionFit(divisionId, [{ playerId: userId, subject: 'you' }]);
    if (fitError) return { error: fitError };
  }

  const { data: created, error: teamError } = opts.organizerId
    ? await svc.rpc('organizer_create_solo_doubles_team', {
        p_tournament_id: tournamentId,
        p_division_id: divisionId,
        p_player: userId,
        p_actor: opts.organizerId,
      })
    : await svc.rpc('create_solo_doubles_team', {
        p_tournament_id: tournamentId,
        p_division_id: divisionId,
        p_actor: userId,
      });
  if (teamError) return await friendlyLogged(userId, 'create_solo_doubles_team', teamError.message);
  const teamId = (created as { team_id?: string } | null)?.team_id;
  if (!teamId) return { error: 'Could not start your entry. Please try again.' };

  const { data: reg, error: regError } = await svc.rpc('register_team', {
    p_team_id: teamId,
    p_actor: userId,
  });
  if (regError) return await friendlyLogged(userId, 'register_team', regError.message);
  const regId = (reg as { registration_id?: string } | null)?.registration_id;
  const status = (reg as { status?: string } | null)?.status;
  if (regId) await computeRegistrationEligibility(regId);
  if (regId) await notifyAfterRegister(tournamentId, teamId, regId, status);
  await revalTournament(tournamentId);
  return {
    registrationId: regId,
    teamId,
    status,
    message:
      status === 'waitlisted'
        ? 'This division is full, so you joined the waitlist. Choose a partner any time before the lock-in.'
        : 'Your slot is held. Pay now to reserve it - then choose your partner before the lock-in.',
  };
}
