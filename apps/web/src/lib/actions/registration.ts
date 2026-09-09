'use server';

import { revalidateTag } from 'next/cache';
import { partnerInviteSchema } from '@vouchplay/validation';
import { SKILL_BANDS } from '@vouchplay/config';
import { evaluateDivisionFit, describeDivisionFit } from '@vouchplay/core';
import { divisionName } from '@/lib/tournaments/dto';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { isBlockedBetween, checkActorCanInteract } from '@/lib/moderation/enforcement';
import { viewerIsStaff } from '@/lib/moderation/staff';
import { authorizeOrganizer } from '@/lib/tournaments/authz';
import { TOURNAMENTS_LIST_TAG, tournamentTag, getTournamentRules } from '@/lib/tournaments/queries';
import { computeRegistrationEligibility } from '@/lib/eligibility/compute';
import { checkDivisionFit } from '@/lib/tournaments/division-fit-check';
import { notify, notifyMany } from '@/lib/notifications/create';
import {
  getActorMini,
  getTournamentMini,
  getTournamentOrganizerIds,
  getTeamMemberIds,
} from '@/lib/notifications/recipients';
import { notifyRegistrationTeam } from '@/lib/notifications/registration-notify';

export interface RegistrationActionState {
  /** Set when an action creates a registration, so the UI can go straight to its payment step. */
  registrationId?: string;
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
  partner_does_not_fit_division:
    'That player does not fit this division. They need the same skill level and the same gender the division is for.',
  no_partner_to_replace: 'There is no partner on this team to change.',
  same_partner: 'That is already your partner.',
  seat_not_vacant: 'Your partner has not left this team.',
  no_declined_invitation: 'You can only name a replacement after your partner declines.',
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
    // Checked at the point the partner is NAMED, not when they answer (§2D). Sending an invitation
    // that can only be refused wastes the invitee's decision and the inviter's time.
    const fitError = await checkDivisionFit(v.divisionId, [
      { playerId: user.id, subject: 'you' },
      { playerId: inv.id, subject: 'partner', name: (await getActorMini(inv.id)).name },
    ]);
    if (fitError) return { error: fitError };
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

// ---------------------------------------------------------------------------
// Enter with a partner who has not confirmed yet (master_plan §1U)
// ---------------------------------------------------------------------------

/**
 * Create the team, name the partner, and register - in one step, so the player goes straight to
 * payment instead of waiting for somebody else to open the app.
 *
 * The partner is added UNCONFIRMED. `register_team` has always permitted this (it only ever required
 * the actor to be a team member), and the capacity count already treats a submitted receipt as
 * occupying the slot, so nothing about capacity or the waitlist changes.
 *
 * The caller must have acknowledged the warning: they are about to pay on someone else's behalf.
 */
export async function enterWithPendingPartner(
  tournamentId: string,
  _prev: RegistrationActionState,
  formData: FormData,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (formData.get('acknowledged') !== 'on')
    return { error: 'Please confirm you have already agreed with your partner.' };
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
    // A failed QUERY is not a missing PLAYER. Reporting one as the other sent a real end-to-end test
    // hunting for a bad handle when the column name was wrong - the lookup 400d and the null result
    // read as 'no such player'. Never let a query failure wear that message.
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
    if (inv.id === user.id) return { error: 'You cannot enter yourself as your own partner.' };
    if (inv.account_status !== 'active' || !inv.onboarded_at)
      return {
        error: 'That player cannot be entered yet. Ask them to finish their profile first.',
      };
    if (await isBlockedBetween(user.id, inv.id)) return { error: 'That partner is unavailable.' };

    // Both players are checked against the division's skill floor before anyone pays.
    // The division rules - who it is for, and the band it is for - checked for BOTH players before
    // anyone pays (§2D). Same rule as player_fits_division() in SQL, but able to say why.
    const fitError = await checkDivisionFit(v.divisionId, [
      { playerId: user.id, subject: 'you' },
      { playerId: inv.id, subject: 'partner', name: (await getActorMini(inv.id)).name },
    ]);
    if (fitError) return { error: fitError };

    const { data: created, error: teamError } = await svc.rpc('create_team_with_pending_partner', {
      p_tournament_id: tournamentId,
      p_division_id: v.divisionId,
      p_inviter: user.id,
      p_invitee: inv.id,
      p_message: v.message ? v.message.trim() : null,
      p_expires_at: null,
    });
    if (teamError) return { error: friendly(teamError.message) };
    const teamId = (created as { team_id?: string } | null)?.team_id;
    if (!teamId) return { error: 'Could not start your entry. Please try again.' };

    const { data: reg, error: regError } = await svc.rpc('register_team', {
      p_team_id: teamId,
      p_actor: user.id,
    });
    if (regError) return { error: friendly(regError.message) };
    const regId = (reg as { registration_id?: string } | null)?.registration_id;
    const status = (reg as { status?: string } | null)?.status;
    if (regId) await computeRegistrationEligibility(regId);

    const [me, tm] = await Promise.all([getActorMini(user.id), getTournamentMini(tournamentId)]);
    await notify({
      recipientId: inv.id,
      type: 'partner_named_paid',
      actorId: user.id,
      params: { actorName: me.name, tournamentName: tm.name },
      link: tm.slug ? `/tournaments/${tm.slug}?register=1` : '/tournaments',
      entityType: 'tournament',
      entityId: tournamentId,
    });
    await revalTournament(tournamentId);
    return {
      ok: true,
      registrationId: regId,
      message:
        status === 'waitlisted'
          ? 'This division is full, so your team joined the waitlist. Your partner has been notified.'
          : 'Your slot is held. Pay now to reserve it - your partner has been notified and can confirm any time.',
    };
  } catch {
    return { error: 'Registration is temporarily unavailable. Please try again shortly.' };
  }
}

/**
 * Name a different partner after the last one declined.
 *
 * Keeps the slot, the payment and the waitlist position. The RPC refuses unless the seat is actually
 * vacant AND the previous invitee declined or expired, so a partner who accepted - or who is still
 * deciding - can never be swapped out (§1D).
 */
export async function replacePendingPartner(
  tournamentId: string,
  _prev: RegistrationActionState,
  formData: FormData,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const teamId = String(formData.get('teamId') ?? '');
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
    const { data: invitee, error: inviteeError } = await svc
      .from('profiles')
      .select('id, account_status, onboarded_at')
      .eq('slug', v.inviteeSlug)
      .maybeSingle();
    if (inviteeError) return { error: 'Could not look up that player. Please try again.' };
    const inv = invitee as {
      id: string;
      account_status: string;
      onboarded_at: string | null;
    } | null;
    if (!inv) return { error: 'No player found with that handle.' };
    if (inv.id === user.id) return { error: 'You cannot enter yourself as your own partner.' };
    if (inv.account_status !== 'active' || !inv.onboarded_at)
      return {
        error: 'That player cannot be entered yet. Ask them to finish their profile first.',
      };
    if (await isBlockedBetween(user.id, inv.id)) return { error: 'That partner is unavailable.' };

    // The division rules - who it is for, and the band it is for - checked for BOTH players before
    // anyone pays (§2D). Same rule as player_fits_division() in SQL, but able to say why.
    const fitError = await checkDivisionFit(v.divisionId, [
      { playerId: user.id, subject: 'you' },
      { playerId: inv.id, subject: 'partner', name: (await getActorMini(inv.id)).name },
    ]);
    if (fitError) return { error: fitError };

    const { error } = await svc.rpc('replace_pending_partner', {
      p_team_id: teamId,
      p_actor: user.id,
      p_new_invitee: inv.id,
      p_message: v.message ? v.message.trim() : null,
      p_expires_at: null,
    });
    if (error) return { error: friendly(error.message) };

    const [me, tm] = await Promise.all([getActorMini(user.id), getTournamentMini(tournamentId)]);
    await notify({
      recipientId: inv.id,
      type: 'partner_named_paid',
      actorId: user.id,
      params: { actorName: me.name, tournamentName: tm.name },
      link: tm.slug ? `/tournaments/${tm.slug}?register=1` : '/tournaments',
      entityType: 'tournament',
      entityId: tournamentId,
    });
    await revalTournament(tournamentId);
    return { ok: true, message: 'New partner named. Your slot and payment are unchanged.' };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
}

/**
 * Swap the other member of a team for someone else, after payment (master_plan §2A).
 *
 * `replacePendingPartner` only ever worked on a seat already vacated by a decline. This is the case
 * where the seat is still occupied and the player simply needs somebody else - which had no route at
 * all before migration 0027.
 *
 * The registration, the payment and the waitlist position are untouched. The removed player is ALWAYS
 * notified: §1D exists so nobody is displaced without their knowledge, and telling them is what keeps
 * that promise.
 */
export async function changePartner(
  tournamentId: string,
  _prev: RegistrationActionState,
  formData: FormData,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const teamId = String(formData.get('teamId') ?? '');
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
    const { data: invitee, error: inviteeError } = await svc
      .from('profiles')
      .select('id, account_status, onboarded_at')
      .eq('slug', v.inviteeSlug)
      .maybeSingle();
    if (inviteeError) return { error: 'Could not look up that player. Please try again.' };
    const inv = invitee as {
      id: string;
      account_status: string;
      onboarded_at: string | null;
    } | null;
    if (!inv) return { error: 'No player found with that handle.' };
    if (inv.id === user.id) return { error: 'You cannot enter yourself as your own partner.' };
    if (inv.account_status !== 'active' || !inv.onboarded_at)
      return {
        error: 'That player cannot be entered yet. Ask them to finish their profile first.',
      };
    if (await isBlockedBetween(user.id, inv.id)) return { error: 'That partner is unavailable.' };

    const { data, error } = await svc.rpc('change_partner', {
      p_team_id: teamId,
      p_actor: user.id,
      p_new_invitee: inv.id,
      p_message: v.message ? v.message.trim() : null,
      p_expires_at: null,
    });
    if (error) return { error: friendly(error.message) };

    const removedPlayer = (data as { removed_player?: string } | null)?.removed_player;
    const registrationId = (data as { registration_id?: string } | null)?.registration_id;
    // Eligibility is recomputed because the team changed, even though the entry did not.
    if (registrationId) await computeRegistrationEligibility(registrationId);

    const [me, tm] = await Promise.all([getActorMini(user.id), getTournamentMini(tournamentId)]);
    const link = tm.slug ? `/tournaments/${tm.slug}?register=1` : '/tournaments';
    await notify({
      recipientId: inv.id,
      type: 'partner_named_paid',
      actorId: user.id,
      params: { actorName: me.name, tournamentName: tm.name },
      link,
      entityType: 'tournament',
      entityId: tournamentId,
    });
    // Non-negotiable: the person removed from the team is told (§1D).
    if (removedPlayer) {
      await notify({
        recipientId: removedPlayer,
        type: 'partner_removed',
        actorId: user.id,
        params: { actorName: me.name, tournamentName: tm.name },
        link,
        entityType: 'tournament',
        entityId: tournamentId,
      });
    }
    await revalTournament(tournamentId);
    return { ok: true, message: 'Partner changed. Your slot and payment are unchanged.' };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
}

export interface PlayerSearchResult {
  slug: string;
  name: string;
  city: string | null;
  /**
   * Why this player cannot be your partner in the division being searched, or null when they can.
   * Present only when a divisionId was supplied (§2D).
   */
  blockedReason: string | null;
}

/** The division columns the fit rule needs. Kept here so the shape is checked in one place. */
interface DivisionRuleShape {
  id: string;
  tournament_id: string;
  name_override: string | null;
  skill_policy: string;
  minimum_skill: number | null;
  maximum_skill: number | null;
  format: string;
  sex_classification: string;
  minimum_age: number | null;
  maximum_age: number | null;
}

/**
 * Search active, onboarded players to name as a partner (§20.1).
 *
 * Pass the division and each result carries its own verdict, so a player who cannot be entered is
 * shown as unavailable WITH the reason rather than offered and then refused on submit. The server
 * still refuses on submit - this is the courtesy, not the gate.
 */
export async function searchInvitablePlayers(
  q: string,
  divisionId?: string,
): Promise<PlayerSearchResult[]> {
  const user = await getOptionalUser();
  if (!user) return [];
  const term = q.trim();
  if (term.length < 2) return [];
  const svc = createServiceClient();
  const safe = term.replace(/[%,()]/g, ' ');
  const { data } = await svc
    .from('profiles')
    .select('id, slug, first_name, last_name, nickname, city, sex, self_rated_skill')
    .eq('account_status', 'active')
    .not('onboarded_at', 'is', null)
    .neq('id', user.id)
    .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,nickname.ilike.%${safe}%`)
    .limit(8);
  const rows = (
    (data ?? []) as {
      id: string;
      slug: string | null;
      first_name: string | null;
      last_name: string | null;
      nickname: string | null;
      city: string | null;
      sex: string | null;
      self_rated_skill: number | null;
    }[]
  ).filter((p) => p.slug);

  const named = rows.map((p) => ({
    ...p,
    displayName:
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
      p.nickname ||
      'VouchPlay player',
  }));

  const reasons = new Map<string, string>();
  if (divisionId && named.length > 0) {
    const [{ data: divRow }, { data: skillRows }] = await Promise.all([
      svc
        .from('divisions')
        .select(
          'id, tournament_id, name_override, skill_policy, minimum_skill, maximum_skill, format, sex_classification, minimum_age, maximum_age',
        )
        .eq('id', divisionId)
        .maybeSingle(),
      svc
        .from('player_skill_profiles')
        .select('player_id, community_skill_level')
        .in(
          'player_id',
          named.map((p) => p.id),
        ),
    ]);
    const div = divRow as DivisionRuleShape | null;
    if (div) {
      const { enforceSkillFloor } = await getTournamentRules(div.tournament_id);
      const community = new Map(
        ((skillRows ?? []) as { player_id: string; community_skill_level: number | null }[]).map(
          (r) => [r.player_id, r.community_skill_level],
        ),
      );
      const bandLabel = (() => {
        if (div.skill_policy === 'open') return null;
        const label = (o: number | null) =>
          o == null ? null : (SKILL_BANDS.find((b) => b.ordinal === o)?.label ?? null);
        const min = label(div.minimum_skill);
        const max = label(div.maximum_skill);
        if (min && max) return min === max ? min : `${min} to ${max}`;
        return min ?? max;
      })();
      for (const p of named) {
        const effectiveSkill = community.get(p.id) ?? p.self_rated_skill ?? null;
        const verdict = evaluateDivisionFit({
          playerSex: p.sex,
          effectiveSkill,
          sexClassification: div.sex_classification,
          skillPolicy: div.skill_policy,
          divisionMinimumSkill: div.minimum_skill,
          divisionMaximumSkill: div.maximum_skill,
          enforceSkillFloor,
        });
        if (!verdict.fits && verdict.reason) {
          reasons.set(
            p.id,
            describeDivisionFit(verdict.reason, {
              subject: 'partner',
              partnerName: p.displayName,
              divisionName: divisionName(div),
              bandLabel,
              playerLevel:
                effectiveSkill == null
                  ? null
                  : (SKILL_BANDS.find((b) => b.ordinal === effectiveSkill)?.label ?? null),
            }),
          );
        }
      }
    }
  }

  return named.map((p) => ({
    slug: p.slug as string,
    name: p.displayName,
    city: p.city,
    blockedReason: reasons.get(p.id) ?? null,
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
      // Frees the seat without cancelling the entry or releasing the slot: the fee is already paid
      // and the organizer has a receipt to rule on (§1U). Only ever removes an UNCONFIRMED
      // membership, so a partner who already accepted is never dropped by this path.
      const { error } = await svc.rpc('decline_partner_invitation', {
        p_invitation_id: invitationId,
        p_actor: user.id,
      });
      if (error) return { error: friendly(error.message) };
      const [me, tm] = await Promise.all([
        getActorMini(user.id),
        getTournamentMini(row.tournament_id),
      ]);
      await notify({
        recipientId: row.inviter_id,
        type: 'partner_declined',
        actorId: user.id,
        params: { actorName: me.name, tournamentName: tm.name },
        link: tm.slug ? `/tournaments/${tm.slug}?register=1` : '/tournaments',
        entityType: 'tournament',
        entityId: row.tournament_id,
      });
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
    const { data: teamRow } = await svc
      .from('teams')
      .select('division_id')
      .eq('id', teamId)
      .maybeSingle();
    const divisionId = (teamRow as { division_id: string } | null)?.division_id;
    if (divisionId) {
      const { data: memberRows } = await svc
        .from('team_members')
        .select('player_id')
        .eq('team_id', teamId);
      const memberIds = ((memberRows ?? []) as { player_id: string }[]).map((m) => m.player_id);
      const names = await Promise.all(
        memberIds
          .filter((id) => id !== user.id)
          .map(async (id) => [id, (await getActorMini(id)).name] as const),
      );
      const nameById = new Map(names);
      const fitError = await checkDivisionFit(
        divisionId,
        memberIds.map((id) =>
          id === user.id
            ? { playerId: id, subject: 'you' as const }
            : { playerId: id, subject: 'partner' as const, name: nameById.get(id) ?? null },
        ),
      );
      if (fitError) return { error: fitError };
    }
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

    const fitError = await checkDivisionFit(divisionId, [{ playerId: user.id, subject: 'you' }]);
    if (fitError) return { error: fitError };

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

/**
 * Ask the organizer to cancel a paid entry.
 *
 * This does NOT cancel anything, and the copy says so. Once a receipt exists the money is out of
 * VouchPlay's hands - it was sent directly to the organizer - so only they can undo it. The request
 * is recorded against the entry and the organizer is told (master_plan §1Y).
 *
 * No new table: `registration_events` is already the immutable per-registration history the organizer
 * reads, and a request is exactly a note on that timeline.
 */
export async function requestRegistrationCancellation(
  registrationId: string,
  tournamentId: string,
  reason: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const trimmed = reason.trim();
  if (trimmed.length < 5) return { error: 'Please say briefly why you need to cancel.' };
  if (trimmed.length > 500) return { error: 'Please keep the reason under 500 characters.' };

  const svc = createServiceClient();
  try {
    const { data: reg, error: regError } = await svc
      .from('registrations')
      .select('id, team_id, tournament_id, status')
      .eq('id', registrationId)
      .maybeSingle();
    if (regError) return { error: 'Could not load that entry. Please try again.' };
    const row = reg as {
      id: string;
      team_id: string;
      tournament_id: string;
      status: string;
    } | null;
    if (!row || row.tournament_id !== tournamentId) return { error: 'Entry not found.' };
    if (['withdrawn', 'cancelled', 'rejected'].includes(row.status))
      return { error: 'This entry is already closed.' };

    const { data: member } = await svc
      .from('team_members')
      .select('player_id')
      .eq('team_id', row.team_id)
      .eq('player_id', user.id)
      .maybeSingle();
    if (!member) return { error: 'You are not on this team.' };

    // One open request at a time, so a frustrated tap does not spam the organizer's timeline.
    const { data: existing } = await svc
      .from('registration_events')
      .select('id')
      .eq('registration_id', registrationId)
      .eq('event_type', 'cancellation_requested')
      .limit(1);
    if ((existing ?? []).length > 0)
      return { error: 'You have already asked the organizer to cancel this entry.' };

    await svc.from('registration_events').insert({
      registration_id: registrationId,
      actor_id: user.id,
      event_type: 'cancellation_requested',
      from_status: row.status,
      to_status: row.status,
      metadata: { reason: trimmed },
    });

    const [me, tm, organizerIds] = await Promise.all([
      getActorMini(user.id),
      getTournamentMini(tournamentId),
      getTournamentOrganizerIds(tournamentId),
    ]);
    if (organizerIds.length) {
      await notifyMany(organizerIds, {
        type: 'registration_cancellation_requested',
        actorId: user.id,
        params: { actorName: me.name, tournamentName: tm.name, reason: trimmed },
        link: tm.slug ? `/tournaments/${tm.slug}/manage` : '/tournaments',
        entityType: 'tournament',
        entityId: tournamentId,
      });
    }
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return {
    ok: true,
    message: 'Sent. The organizer will review your request and get back to you.',
  };
}

/**
 * Retire the team behind a registration that has just closed, if that entry was its last one
 * (master_plan §2C).
 *
 * A team exists to hold an entry. Once the entry is withdrawn, cancelled or rejected the team is
 * history, and leaving it `formed` is what produced a division offering "Register team" beside
 * "waiting for your partner" - two states that cannot both be true. Outstanding invitations are
 * cancelled with it, because an invitation into a closed entry is a decision that no longer exists.
 *
 * Returns the OTHER members, so the caller can notify them in the order that suits its own flow -
 * a rejection has to reach the team before the team is taken apart.
 */
async function disbandTeamIfEntryClosed(
  svc: ReturnType<typeof createServiceClient>,
  registrationId: string,
  actorId: string,
  actorRole: 'player' | 'organizer',
): Promise<string[]> {
  const { data: regRow } = await svc
    .from('registrations')
    .select('team_id')
    .eq('id', registrationId)
    .maybeSingle();
  const teamId = (regRow as { team_id: string | null } | null)?.team_id;
  if (!teamId) return [];
  const { data: stillActive } = await svc
    .from('registrations')
    .select('id')
    .eq('team_id', teamId)
    .not('status', 'in', '(withdrawn,cancelled,rejected)')
    .limit(1);
  if (stillActive && stillActive.length > 0) return [];

  const { data: memberRows } = await svc
    .from('team_members')
    .select('player_id')
    .eq('team_id', teamId);
  const others = ((memberRows ?? []) as { player_id: string }[])
    .map((m) => m.player_id)
    .filter((id) => id !== actorId);
  await svc.from('team_members').delete().eq('team_id', teamId);
  await svc
    .from('teams')
    .update({ status: 'disbanded', updated_at: new Date().toISOString() })
    .eq('id', teamId);
  await svc
    .from('partner_invitations')
    .update({ status: 'cancelled' })
    .eq('team_id', teamId)
    .eq('status', 'sent');
  await svc.from('audit_logs').insert({
    actor_id: actorId,
    actor_role: actorRole,
    action: 'team_dissolved_on_cancellation',
    entity_type: 'team',
    entity_id: teamId,
    before_snapshot: { registration_id: registrationId },
    after_snapshot: { status: 'disbanded' },
  });
  return others;
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
    const others = await disbandTeamIfEntryClosed(svc, registrationId, user.id, 'player');
    const dissolvedWithPartner = others.length > 0;
    if (dissolvedWithPartner) {
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
    // Notify BEFORE the team is taken apart: recipients are resolved from its members, so a
    // rejection sent afterwards would reach nobody.
    await notifyRegistrationTeam(
      registrationId,
      tournamentId,
      'registration_rejected',
      reason.trim() || undefined,
    );
    await disbandTeamIfEntryClosed(svc, registrationId, user.id, 'organizer');
    const promoted = (data as { promoted?: string | null } | null)?.promoted;
    if (promoted) await notifyRegistrationTeam(promoted, tournamentId, 'registration_promoted');
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Registration rejected and slot released.' };
}
