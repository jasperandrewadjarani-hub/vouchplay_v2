'use server';

import { revalidateTag } from 'next/cache';
import { partnerInviteSchema } from '@vouchplay/validation';
import { SKILL_BANDS, parseVisibility } from '@vouchplay/config';
import { redactRatings } from '@/lib/players/dto';
import {
  ageAtDate,
  evaluateDivisionFit,
  describeDivisionFit,
  quoteFee,
  formatFee,
} from '@vouchplay/core';
import { divisionName } from '@/lib/tournaments/dto';
import { formatDate } from '@/lib/format-date';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { isBlockedBetween, checkActorCanInteract } from '@/lib/moderation/enforcement';
import { viewerIsStaff } from '@/lib/moderation/staff';
import { authorizeOrganizer } from '@/lib/tournaments/authz';
import { TOURNAMENTS_LIST_TAG, tournamentTag, getTournamentRules } from '@/lib/tournaments/queries';
import { computeRegistrationEligibility } from '@/lib/eligibility/compute';
import { checkDivisionFit } from '@/lib/tournaments/division-fit-check';
import { logRpcRefusal, writeAudit } from '@/lib/moderation/audit';
import { notify, notifyMany } from '@/lib/notifications/create';
import {
  getActorMini,
  getTournamentMini,
  getTournamentOrganizerIds,
  getTeamMemberIds,
} from '@/lib/notifications/recipients';
import { notifyRegistrationTeam } from '@/lib/notifications/registration-notify';
import {
  attachBareSlot,
  detachSlots,
  settleRegistration,
  summarizeRegistration,
  getSlotCancelRequests,
} from '@/lib/payments/slots';
import { sendConfirmationEmailForRegistration } from '@/lib/payments/confirmation-email';
import {
  doRegisterSolo,
  doEnterDoublesSolo,
  doEnterWithPendingPartner,
  type EntryOutcome,
} from '@/lib/registrations/entry-core';
import { doInvitePartner } from '@/lib/registrations/invite-core';
import { markRefunded } from './payment';

export interface RegistrationActionState {
  /** Set when an action creates a registration, so the UI can go straight to its payment step. */
  registrationId?: string;
  /** Set alongside `registrationId` by the entry-creating actions (master_plan §2AO B). */
  teamId?: string;
  /** The registration_status the RPC returned (e.g. 'waitlisted'), when an entry was created. */
  status?: string;
  ok?: boolean;
  error?: string;
  message?: string;
  /** Set alongside a stale-team error (master_plan §2AP C3): the team changed since the page was
   *  opened (a decline, a cancel, a race), so the component should `router.refresh()` rather than
   *  strand the player on a page that can no longer act. */
  refresh?: boolean;
}

// `EntryOutcome` - the shared shape every entry-creating helper returns, before its exported wrapper
// adapts it to `RegistrationActionState` (master_plan §2AO B) - now lives in
// `@/lib/registrations/entry-core` alongside `doRegisterSolo` / `doEnterDoublesSolo` /
// `doEnterWithPendingPartner` themselves (master_plan §2AU: pulled out so the guest wizard can call
// them directly with a guest profile id, bypassing the session-only gate below).

/** master_plan §2AP C3: a stale page (a decline, a cancel, a race elsewhere) can no longer act on a
 *  team it thinks it still has - this is the one sentence for that, everywhere it can surface. */
const STALE_TEAM_MESSAGE = 'This team has changed since you opened the page. Refreshing…';

/** Map a raised RPC exception message to user-safe copy. */
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
  // §2AT Decision A (migration 0045): a solo entry in the division no longer conflicts by itself - it
  // may be MERGEABLE - so this refusal now only ever means the other player is on a team WITH SOMEONE
  // ELSE. The old "one of you is already on a team" wording stopped being true the day a lone solo
  // entrant became a valid partner.
  partner_conflict: 'That player is already on a team with someone else in this division.',
  // §2AT Decision A: the specific non-mergeable case - the invitee's own solo team already carries a
  // team receipt in `submitted`/`verified`, so folding it in would tangle two payments together. The
  // `{name}` placeholder is filled in by `friendly()` below with whichever player's name the caller
  // could resolve, else "That player".
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
  // master_plan §2AM - open seats, mixed-doubles composition, and consented partner release.
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
/** `name` fills the `{name}` placeholder on templated copy (currently only `team_paid_not_mergeable`,
 *  §2AT Decision A) - resolved by the caller where possible, else "That player". Every other entry in
 *  `RPC_ERRORS` ignores it. */
function friendly(msg: string | undefined, name?: string | null): string {
  if (!msg) return 'That action failed. Please try again.';
  for (const [key, text] of Object.entries(RPC_ERRORS))
    if (msg.includes(key)) return text.replace('{name}', name ?? 'That player');
  return 'That action failed. Please try again.';
}

/**
 * One-line replacement for every `if (error) return { error: friendly(error.message) };` call site
 * (master_plan §2AP C8/C3): logs the raw refusal code (best-effort, never throws) before mapping it
 * to player-facing copy, and flags `refresh: true` when the refusal was a stale-team one, so the
 * component can `router.refresh()` instead of stranding the player on a page that can no longer act.
 */
async function friendlyLogged(
  actorId: string | null,
  fn: string,
  message: string | undefined,
  entity?: { entityType?: string; entityId?: string | null },
  /** §2AT Decision A: the name to fill `{name}` with on `team_paid_not_mergeable` (and any future
   *  templated code) - the caller resolves whichever player the refusal is actually about. */
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

/**
 * The TS-side twin of the same stale-team refusal (master_plan §2AP C3): a direct `team_members`
 * lookup, rather than an RPC, came back empty. Logged and worded identically to the RPC path above.
 */
async function staleTeamError(
  actorId: string,
  fn: string,
  entityId?: string | null,
): Promise<{ error: string; refresh: true }> {
  await logRpcRefusal({
    actorId,
    fn,
    code: 'not_team_member',
    entityType: 'registration',
    entityId: entityId ?? null,
  });
  return { error: STALE_TEAM_MESSAGE, refresh: true };
}

const ELIG_REVIEW = new Set(['review', 'skill_mismatch', 'ineligible_hard_rule']);

/** One player's `sex`, for the mixed-doubles composition check (§2AM decision 1). */
async function getPlayerSex(
  svc: ReturnType<typeof createServiceClient>,
  playerId: string,
): Promise<'male' | 'female' | null> {
  const { data } = await svc.from('profiles').select('sex').eq('id', playerId).maybeSingle();
  return (data as { sex: 'male' | 'female' | null } | null)?.sex ?? null;
}

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

  // Thin wrapper (master_plan §2AV F): the actual body lives in `doInvitePartner`
  // (`lib/registrations/invite-core.ts`), shared byte-for-byte with the partner-matchmaking match
  // door, which calls it directly with the other player's id instead of a form-submitted slug.
  const outcome = await doInvitePartner(user.id, {
    tournamentId,
    divisionId: v.divisionId,
    inviteeSlug: v.inviteeSlug,
    message: v.message,
  });
  if (outcome.error) return { error: outcome.error };
  return { ok: true, message: outcome.message ?? 'Partner invite sent.' };
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

  try {
    const outcome = await doEnterWithPendingPartner(tournamentId, v, user.id);
    if (outcome.error) return { error: outcome.error };
    return { ok: true, registrationId: outcome.registrationId, message: outcome.message ?? '' };
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
    // anyone pays (§2D). Same rule as player_fits_division() in SQL, but able to say why. Each
    // candidate carries the OTHER seat's sex, so a mixed-doubles same-sex pair is refused here too
    // (§2AM decision 1), not only at the SQL backstop.
    const [actorSex, inviteeSex] = await Promise.all([
      getPlayerSex(svc, user.id),
      getPlayerSex(svc, inv.id),
    ]);
    const fitError = await checkDivisionFit(v.divisionId, [
      { playerId: user.id, subject: 'you', partnerSex: inviteeSex },
      {
        playerId: inv.id,
        subject: 'partner',
        name: (await getActorMini(inv.id)).name,
        partnerSex: actorSex,
      },
    ]);
    if (fitError) return { error: fitError };

    const { error } = await svc.rpc('replace_pending_partner', {
      p_team_id: teamId,
      p_actor: user.id,
      p_new_invitee: inv.id,
      p_message: v.message ? v.message.trim() : null,
      p_expires_at: null,
    });
    if (error) {
      return await friendlyLogged(
        user.id,
        'replace_pending_partner',
        error.message,
        undefined,
        (await getActorMini(inv.id)).name,
      );
    }

    const [me, tm] = await Promise.all([getActorMini(user.id), getTournamentMini(tournamentId)]);
    await notify({
      recipientId: inv.id,
      type: 'partner_named_paid',
      actorId: user.id,
      params: { actorName: me.name, tournamentName: tm.name },
      // The named partner confirms on the Partner invitations card, not the registration wizard (§2AS).
      link: tm.slug ? `/tournaments/${tm.slug}#partner-invitations` : '/tournaments',
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

    // Same TS gate as the other partner paths (§2AM decision 1): each candidate carries the OTHER
    // seat's sex, so a mixed-doubles same-sex pair is refused here too. The RPC call itself is
    // unchanged - it now also refuses a CONFIRMED partner with `partner_confirmed_needs_release`,
    // mapped by `friendly()` below.
    const [actorSex, inviteeSex] = await Promise.all([
      getPlayerSex(svc, user.id),
      getPlayerSex(svc, inv.id),
    ]);
    const fitError = await checkDivisionFit(v.divisionId, [
      { playerId: user.id, subject: 'you', partnerSex: inviteeSex },
      {
        playerId: inv.id,
        subject: 'partner',
        name: (await getActorMini(inv.id)).name,
        partnerSex: actorSex,
      },
    ]);
    if (fitError) return { error: fitError };

    const { data, error } = await svc.rpc('change_partner', {
      p_team_id: teamId,
      p_actor: user.id,
      p_new_invitee: inv.id,
      p_message: v.message ? v.message.trim() : null,
      p_expires_at: null,
    });
    if (error) {
      return await friendlyLogged(
        user.id,
        'change_partner',
        error.message,
        undefined,
        (await getActorMini(inv.id)).name,
      );
    }

    const removedPlayer = (data as { removed_player?: string } | null)?.removed_player;
    const registrationId = (data as { registration_id?: string } | null)?.registration_id;
    // Eligibility is recomputed because the team changed, even though the entry did not.
    if (registrationId) await computeRegistrationEligibility(registrationId);
    // §2AO A4: the removed player's money travels with them - detach their slot, then re-settle the
    // entry's money state (a still-open seat may move it back out of 'confirmed').
    if (registrationId && removedPlayer) {
      await detachSlots(registrationId, removedPlayer);
      await settleRegistration(registrationId, user.id);
    }

    const [me, tm] = await Promise.all([getActorMini(user.id), getTournamentMini(tournamentId)]);
    const link = tm.slug ? `/tournaments/${tm.slug}?register=1` : '/tournaments';
    await notify({
      recipientId: inv.id,
      type: 'partner_named_paid',
      actorId: user.id,
      params: { actorName: me.name, tournamentName: tm.name },
      // The named partner confirms on the Partner invitations card (§2AS fix); the removed player
      // below keeps the re-register link since they are now off the team.
      link: tm.slug ? `/tournaments/${tm.slug}#partner-invitations` : '/tournaments',
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
  /**
   * §2AT Decision A: set when this player already has their own solo entry in the division AND it is
   * MERGEABLE (one member, no invite sent from it, no submitted/verified team receipt) - choosing them
   * folds that entry into yours instead of starting fresh. Null otherwise (including when they are not
   * on a team at all, or when `blockedReason` already rules them out).
   */
  mergeNote?: string | null;
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
  /** The acting/inviting player, for the mixed-doubles composition check below (§2AM decision 1).
   *  Defaults to the signed-in user - the acting user is the inviter on every current caller. */
  inviterId?: string,
  /** master_plan §2AW: true on an organizer-scoped caller (e.g. the organizer's "Assign partner"
   *  form) - the candidate's real community/self rating is used in the fit-mismatch reason text
   *  instead of being redacted. The eligibility VERDICT itself never depends on this - it always uses
   *  the real effective skill, exactly as before (§2AW decision E: matchmaking is unaffected). */
  privileged = false,
): Promise<PlayerSearchResult[]> {
  const user = await getOptionalUser();
  if (!user) return [];
  const actorId = inviterId ?? user.id;
  const term = q.trim();
  if (term.length < 2) return [];
  const staffSearcher = privileged || (await viewerIsStaff());
  const svc = createServiceClient();
  const safe = term.replace(/[%,()]/g, ' ');
  const { data } = await svc
    .from('profiles')
    .select(
      'id, slug, first_name, last_name, nickname, city, sex, self_rated_skill, date_of_birth, profile_visibility',
    )
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
      date_of_birth: string | null;
      profile_visibility: unknown;
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
    const [{ data: divRow }, { data: skillRows }, { data: actorRow }] = await Promise.all([
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
      // §2AM decision 1: the acting player's own sex, so a same-sex candidate in a mixed doubles
      // division is greyed with the composition reason instead of being offered and refused on pick.
      svc.from('profiles').select('sex').eq('id', actorId).maybeSingle(),
    ]);
    const div = divRow as DivisionRuleShape | null;
    const actorSex = (actorRow as { sex: 'male' | 'female' | null } | null)?.sex ?? null;
    if (div) {
      const { enforceSkillFloor } = await getTournamentRules(div.tournament_id);
      // §2AP B: age at the door, same rule as `checkDivisionFit` - one shared tournament start read.
      const { data: tournRow } = await svc
        .from('tournaments')
        .select('start_at')
        .eq('id', div.tournament_id)
        .maybeSingle();
      const tournamentStartAt = (tournRow as { start_at: string | null } | null)?.start_at ?? null;
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
        // The VERDICT always uses the real effective skill, unaffected by the candidate's own
        // ratings-privacy setting (master_plan §2AW decision E - matchmaking sees the real numbers;
        // only what is DISPLAYED follows the setting). Redaction only touches the "Their level is…"
        // text below.
        const effectiveSkill = community.get(p.id) ?? p.self_rated_skill ?? null;
        const verdict = evaluateDivisionFit({
          playerSex: p.sex,
          effectiveSkill,
          sexClassification: div.sex_classification,
          skillPolicy: div.skill_policy,
          divisionMinimumSkill: div.minimum_skill,
          divisionMaximumSkill: div.maximum_skill,
          enforceSkillFloor,
          partnerSex: actorSex,
          format: div.format,
          ageAtStart: ageAtDate(p.date_of_birth, tournamentStartAt),
          divisionMinimumAge: div.minimum_age,
          divisionMaximumAge: div.maximum_age,
        });
        if (!verdict.fits && verdict.reason) {
          // §2AW: an unprivileged searcher never sees a candidate's actual private rating in the
          // reason text, even though the verdict above already used it correctly.
          const displayRatings = staffSearcher
            ? {
                communitySkillLevel: community.get(p.id) ?? null,
                selfRatedSkill: p.self_rated_skill,
              }
            : redactRatings(
                {
                  id: p.id,
                  communitySkillLevel: community.get(p.id) ?? null,
                  selfRatedSkill: p.self_rated_skill,
                },
                parseVisibility(p.profile_visibility),
                { viewerId: actorId, privileged: false },
              );
          const displayEffectiveSkill =
            displayRatings.communitySkillLevel ?? displayRatings.selfRatedSkill ?? null;
          reasons.set(
            p.id,
            describeDivisionFit(verdict.reason, {
              subject: 'partner',
              partnerName: p.displayName,
              divisionName: divisionName(div),
              bandLabel,
              playerLevel:
                displayEffectiveSkill == null
                  ? null
                  : (SKILL_BANDS.find((b) => b.ordinal === displayEffectiveSkill)?.label ?? null),
            }),
          );
        }
      }
    }
  }

  // §2AT Decision A (migration 0045): a candidate already on a LIVE team in this division is not an
  // automatic refusal any more - their team may be MERGEABLE (exactly one member - them, confirmed -
  // no invite `sent` from it, and no team receipt in `submitted`/`verified`). This mirrors the SQL
  // `mergeable_solo_team` rule in TS so the search can tell the two cases apart BEFORE a pick, instead
  // of everyone reading the same refusal the RPC used to raise for both (master_plan Finding 1: "the
  // invitation search shows her as choosable, then the RPC refuses - the worst order"). Only checked
  // for candidates the fit pass above did not already rule out - a fit failure is about the candidate
  // themselves and takes priority over a team-conflict verdict.
  const mergeNotes = new Map<string, string>();
  if (divisionId && named.length > 0) {
    const candidateIds = named.filter((p) => !reasons.has(p.id)).map((p) => p.id);
    if (candidateIds.length > 0) {
      const { data: myTeamRows } = await svc
        .from('team_members')
        .select('team_id, player_id')
        .in('player_id', candidateIds);
      const teamIdsByPlayer = new Map<string, string[]>();
      for (const r of (myTeamRows ?? []) as { team_id: string; player_id: string }[]) {
        const list = teamIdsByPlayer.get(r.player_id) ?? [];
        list.push(r.team_id);
        teamIdsByPlayer.set(r.player_id, list);
      }
      const allTeamIds = Array.from(new Set(Array.from(teamIdsByPlayer.values()).flat()));
      if (allTeamIds.length > 0) {
        const { data: teamRows } = await svc
          .from('teams')
          .select('id')
          .eq('division_id', divisionId)
          .in('status', ['forming', 'formed', 'locked'])
          .in('id', allTeamIds);
        const liveTeamIds = new Set(((teamRows ?? []) as { id: string }[]).map((t) => t.id));
        // A player has at most one active team per division (the same invariant every seating RPC
        // relies on) - so at most one of their team ids can be live here.
        const liveTeamByPlayer = new Map<string, string>();
        for (const [playerId, teamIds] of teamIdsByPlayer) {
          const live = teamIds.find((id) => liveTeamIds.has(id));
          if (live) liveTeamByPlayer.set(playerId, live);
        }
        const teamIdsInPlay = Array.from(new Set(liveTeamByPlayer.values()));
        if (teamIdsInPlay.length > 0) {
          const [{ data: allMemberRows }, { data: sentInviteRows }, { data: regRows }] =
            await Promise.all([
              svc
                .from('team_members')
                .select('team_id, player_id, confirmed_at')
                .in('team_id', teamIdsInPlay),
              svc
                .from('partner_invitations')
                .select('team_id')
                .in('team_id', teamIdsInPlay)
                .eq('status', 'sent'),
              svc
                .from('registrations')
                .select('id, team_id')
                .in('team_id', teamIdsInPlay)
                .not('status', 'in', '(withdrawn,cancelled,rejected)'),
            ]);
          const membersByTeam = new Map<
            string,
            { player_id: string; confirmed_at: string | null }[]
          >();
          for (const m of (allMemberRows ?? []) as {
            team_id: string;
            player_id: string;
            confirmed_at: string | null;
          }[]) {
            const list = membersByTeam.get(m.team_id) ?? [];
            list.push(m);
            membersByTeam.set(m.team_id, list);
          }
          const teamsWithSentInvite = new Set(
            ((sentInviteRows ?? []) as { team_id: string | null }[])
              .map((r) => r.team_id)
              .filter((id): id is string => !!id),
          );
          const regByTeam = new Map<string, string>();
          for (const r of (regRows ?? []) as { id: string; team_id: string }[])
            regByTeam.set(r.team_id, r.id);
          const liveRegIds = Array.from(new Set(Array.from(regByTeam.values())));
          const paidRegIds = new Set<string>();
          if (liveRegIds.length > 0) {
            const { data: payRows } = await svc
              .from('payments')
              .select('registration_id')
              .in('registration_id', liveRegIds)
              .in('status', ['submitted', 'verified']);
            for (const p of (payRows ?? []) as { registration_id: string }[])
              paidRegIds.add(p.registration_id);
          }
          for (const p of named) {
            const teamId = liveTeamByPlayer.get(p.id);
            if (!teamId || reasons.has(p.id)) continue;
            const members = membersByTeam.get(teamId) ?? [];
            const soleConfirmed = members.length === 1 && Boolean(members[0]?.confirmed_at);
            const hasSentInvite = teamsWithSentInvite.has(teamId);
            const regId = regByTeam.get(teamId);
            const teamPaid = regId ? paidRegIds.has(regId) : false;
            if (!soleConfirmed || hasSentInvite) {
              reasons.set(p.id, 'Already on a team with someone else in this division');
            } else if (teamPaid) {
              reasons.set(p.id, 'Already paid for a whole team - ask the organizer');
            } else {
              mergeNotes.set(p.id, 'Has their own entry here - it will merge into yours');
            }
          }
        }
      }
    }
  }

  return named.map((p) => ({
    slug: p.slug as string,
    name: p.displayName,
    city: p.city,
    blockedReason: reasons.get(p.id) ?? null,
    mergeNote: mergeNotes.get(p.id) ?? null,
  }));
}

export interface PlayerBySlugResult {
  slug: string;
  name: string;
}

/**
 * Minimal exact-slug lookup for the partner-matchmaking wizard prefill (`?partner=<slug>`, master_plan
 * §2AV F "enter together" door) - `searchInvitablePlayers` above only matches by name (min 2 chars),
 * so a direct slug link needs its own tiny lookup instead of stretching that search. The candidate
 * already passed the partner-fit check both ways when the deck offered the swipe, so this is just a
 * display-name resolve for the wizard's pre-selected screen, not a second eligibility pass - the real
 * check still happens at `createEntry`/`startEntry` like every other partner pick.
 */
export async function getPlayerBySlugForInvite(slug: string): Promise<PlayerBySlugResult | null> {
  const user = await getOptionalUser();
  if (!user) return null;
  const trimmed = slug.trim();
  if (!trimmed) return null;
  const svc = createServiceClient();
  const { data } = await svc
    .from('profiles')
    .select('slug, first_name, last_name, nickname')
    .eq('slug', trimmed)
    .eq('account_status', 'active')
    .not('onboarded_at', 'is', null)
    .neq('id', user.id)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    slug: string;
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
  };
  const name =
    [row.first_name, row.last_name].filter(Boolean).join(' ').trim() ||
    row.nickname ||
    'VouchPlay player';
  return { slug: row.slug, name };
}

/**
 * Candidates for `assignPartner` (master_plan §2AQ A3). `searchInvitablePlayers` already accepts an
 * `inviterId` used purely for the mixed-doubles composition check against the OTHER seat's sex - so
 * passing the team's confirmed member here reuses that same fit filtering verbatim, checked against
 * the actual seat-holder rather than the organizer running the search. No new filtering logic.
 */
export async function searchAssignablePlayers(
  q: string,
  divisionId: string,
  teamId: string,
): Promise<PlayerSearchResult[]> {
  const user = await getOptionalUser();
  if (!user) return [];
  const svc = createServiceClient();
  const { data: memberRows } = await svc
    .from('team_members')
    .select('player_id, confirmed_at')
    .eq('team_id', teamId);
  const confirmed = (
    (memberRows ?? []) as { player_id: string; confirmed_at: string | null }[]
  ).find((m) => m.confirmed_at);
  // master_plan §2AW: this is always an organizer-scoped search (Manage → assign a partner), so the
  // fit-mismatch reason may name the candidate's real rating rather than redacting it.
  return searchInvitablePlayers(q, divisionId, confirmed?.player_id, true);
}

/** Map an `organizer_assign_partner` refusal to player-facing copy (master_plan §2AQ A3). Distinct
 *  from the shared `RPC_ERRORS`/`friendly()` above: the same raw code (e.g. `seat_not_vacant`) reads
 *  differently from the organizer's side of the desk than from a player's. */
const ASSIGN_PARTNER_ERRORS: Record<string, string> = {
  reason_required: 'Add a short reason.',
  team_not_found: 'That team could not be found.',
  team_not_active: 'This team is no longer active.',
  not_organizer: "Only this tournament's organizers can do that.",
  no_confirmed_member: 'This team has no open seat.',
  self_partner: 'That player is already on this team.',
  seat_not_vacant: 'This team has no open seat.',
  player_does_not_fit: "That player doesn't meet this division's rules.",
  mixed_pair: 'Mixed doubles needs one male and one female player.',
  partner_conflict: 'One of you is already on a team in this division.',
};
function friendlyAssignPartner(msg: string | undefined): string {
  if (!msg) return 'That action failed. Please try again.';
  for (const [key, text] of Object.entries(ASSIGN_PARTNER_ERRORS))
    if (msg.includes(key)) return text;
  return 'That action failed. Please try again.';
}
async function assignPartnerLogged(
  actorId: string,
  message: string | undefined,
  teamId: string,
): Promise<{ error: string }> {
  await logRpcRefusal({
    actorId,
    fn: 'organizer_assign_partner',
    code: message ?? 'unknown',
    entityType: 'team',
    entityId: teamId,
  });
  return { error: friendlyAssignPartner(message) };
}

/**
 * Organizer override: seat a player into a team's open seat as CONFIRMED, with a reason (master_plan
 * §2AQ A3, migration 0044 `organizer_assign_partner`). Fit, composition and conflict rules apply; the
 * partner lock-in does not - this exists for exactly the "partner never confirmed / never named"
 * cases the lock surfaces. Any pending invitation on the team is cancelled by the RPC; an unconfirmed
 * invitee displaced that way is told separately below (the RPC itself only writes the audit trail).
 */
export async function assignPartner(
  teamId: string,
  tournamentId: string,
  playerSlug: string,
  reason: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'approve_registrations'))) {
    return { error: "Only this tournament's organizers can do that." };
  }
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 3) return { error: 'Add a short reason.' };

  const svc = createServiceClient();
  try {
    const { data: player, error: playerError } = await svc
      .from('profiles')
      .select('id, account_status, onboarded_at')
      .eq('slug', playerSlug)
      .maybeSingle();
    if (playerError) return { error: 'Could not look up that player. Please try again.' };
    const p = player as { id: string; account_status: string; onboarded_at: string | null } | null;
    if (!p) return { error: 'No player found with that handle.' };
    if (p.account_status !== 'active' || !p.onboarded_at) {
      return {
        error: 'That player cannot be assigned yet. Ask them to finish their profile first.',
      };
    }

    // Snapshot the unconfirmed member (if any) BEFORE the RPC runs - it cancels any pending invite on
    // the team, and whoever that invite named needs to be told afterwards that they were displaced.
    const { data: beforeMembers } = await svc
      .from('team_members')
      .select('player_id, confirmed_at')
      .eq('team_id', teamId);
    const displacedCandidateId = (
      (beforeMembers ?? []) as { player_id: string; confirmed_at: string | null }[]
    ).find((m) => !m.confirmed_at)?.player_id;

    const { data, error } = await svc.rpc('organizer_assign_partner', {
      p_team_id: teamId,
      p_actor: user.id,
      p_player: p.id,
      p_reason: trimmedReason,
    });
    if (error) return await assignPartnerLogged(user.id, error.message, teamId);

    const result = data as {
      team_id: string;
      registration_id: string | null;
      other_member: string | null;
      assigned: string;
    } | null;
    const registrationId = result?.registration_id ?? null;
    const otherMember = result?.other_member ?? null;

    // Best-effort follow-through: the seat is already assigned, so a failure past this point must not
    // be reported as a failed assignment.
    try {
      if (registrationId) {
        const { data: regRow } = await svc
          .from('registrations')
          .select('division_id')
          .eq('id', registrationId)
          .maybeSingle();
        const divisionId = (regRow as { division_id: string } | null)?.division_id ?? null;
        if (divisionId) {
          const { data: divRow } = await svc
            .from('divisions')
            .select('fee_amount, early_bird_fee_amount')
            .eq('id', divisionId)
            .maybeSingle();
          const div = divRow as { fee_amount: number; early_bird_fee_amount: number | null } | null;
          if (div && Number(div.fee_amount) > 0) {
            const { data: tournRow } = await svc
              .from('tournaments')
              .select('early_bird_starts_at, early_bird_ends_at')
              .eq('id', tournamentId)
              .maybeSingle();
            const tr = tournRow as {
              early_bird_starts_at: string | null;
              early_bird_ends_at: string | null;
            } | null;
            // §2AO A4 pattern (same as `startEntry`): the assigned player's own live bare slot, if any,
            // attaches immediately at the division's per-player quote.
            const quote = quoteFee({
              feeAmount: Number(div.fee_amount),
              earlyBirdFeeAmount:
                div.early_bird_fee_amount != null ? Number(div.early_bird_fee_amount) : null,
              earlyBirdStartsAt: tr?.early_bird_starts_at ?? null,
              earlyBirdEndsAt: tr?.early_bird_ends_at ?? null,
              teamSize: 1,
            });
            await attachBareSlot(tournamentId, p.id, registrationId, quote.perPlayer);
          }
        }
        await settleRegistration(registrationId, user.id);
      }

      const [assignedMini, otherMini, tm] = await Promise.all([
        getActorMini(p.id),
        otherMember ? getActorMini(otherMember) : Promise.resolve(null),
        getTournamentMini(tournamentId),
      ]);
      const link = tm.slug
        ? `/tournaments/${tm.slug}?entered=${registrationId ?? ''}#my-registrations`
        : '/tournaments';
      if (otherMember) {
        await notify({
          recipientId: otherMember,
          type: 'partner_assigned',
          actorId: user.id,
          params: { actorName: assignedMini.name, tournamentName: tm.name, reason: trimmedReason },
          link,
          entityType: 'registration',
          entityId: registrationId ?? teamId,
        });
      }
      await notify({
        recipientId: p.id,
        type: 'partner_assigned',
        actorId: user.id,
        params: {
          actorName: otherMini?.name ?? 'your partner',
          tournamentName: tm.name,
          reason: trimmedReason,
        },
        link,
        entityType: 'registration',
        entityId: registrationId ?? teamId,
      });

      // The displaced unconfirmed invitee (their invite was cancelled by the RPC) is told separately -
      // they are neither `assigned` nor `other_member` in the RPC's result.
      if (
        displacedCandidateId &&
        displacedCandidateId !== p.id &&
        displacedCandidateId !== otherMember
      ) {
        await notify({
          recipientId: displacedCandidateId,
          type: 'partner_removed',
          actorId: user.id,
          params: { actorName: assignedMini.name, tournamentName: tm.name, reason: trimmedReason },
          link: tm.slug ? `/tournaments/${tm.slug}?register=1` : '/tournaments',
          entityType: 'team',
          entityId: teamId,
        });
      }

      await revalTournament(tournamentId);
    } catch {
      // best-effort
    }

    return {
      ok: true,
      teamId,
      registrationId: registrationId ?? undefined,
      message: 'Partner assigned.',
    };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
}

/** Seat states that count as "paid enough to ask your partner to hurry up" / "still owes money"
 *  (master_plan §2AQ A2). */
const REMINDER_SELF_PAID_STATES = new Set<string>(['paid', 'submitted', 'topup']);
const REMINDER_PARTNER_UNPAID_STATES = new Set<string>(['unpaid', 'declined']);

/**
 * A paying player nudges their unpaid doubles partner (master_plan §2AQ A2). Throttled to once per
 * 24 h per entry, checked against the partner's own `seat_payment_reminder` history for this
 * registration (existence-based - no new table).
 */
export async function remindPartner(
  registrationId: string,
  tournamentId: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { data: regRow } = await svc
      .from('registrations')
      .select('team_id, division_id')
      .eq('id', registrationId)
      .maybeSingle();
    const reg = regRow as { team_id: string; division_id: string } | null;
    if (!reg) return { error: 'That registration could not be found.' };

    const { data: memberRows } = await svc
      .from('team_members')
      .select('player_id, confirmed_at')
      .eq('team_id', reg.team_id);
    const members = (memberRows ?? []) as { player_id: string; confirmed_at: string | null }[];
    const me = members.find((m) => m.player_id === user.id && m.confirmed_at);
    if (!me) return await staleTeamError(user.id, 'remindPartner', registrationId);
    const partner = members.find((m) => m.player_id !== user.id && m.confirmed_at);
    if (!partner) return { error: 'There is no confirmed partner on this team yet.' };

    const summary = await summarizeRegistration(registrationId);
    if (!summary) return { error: 'That registration could not be found.' };
    const mySeat = summary.seats.find((s) => s.playerId === user.id);
    const partnerSeat = summary.seats.find((s) => s.playerId === partner.player_id);
    if (!mySeat || !REMINDER_SELF_PAID_STATES.has(mySeat.state)) {
      return { error: 'Pay your own seat first.' };
    }
    if (!partnerSeat || !REMINDER_PARTNER_UNPAID_STATES.has(partnerSeat.state)) {
      return { error: "Your partner's seat is already settled." };
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await svc
      .from('notifications')
      .select('id')
      .eq('type', 'seat_payment_reminder')
      .eq('recipient_id', partner.player_id)
      .eq('entity_id', registrationId)
      .gte('created_at', since)
      .limit(1);
    if (recent && recent.length > 0) {
      return { error: 'Reminded already - try again tomorrow.' };
    }

    const { data: divRow } = await svc
      .from('divisions')
      .select('currency')
      .eq('id', reg.division_id)
      .maybeSingle();
    const currency = (divRow as { currency: string } | null)?.currency ?? 'PHP';

    const [actorMini, tm] = await Promise.all([
      getActorMini(user.id),
      getTournamentMini(tournamentId),
    ]);
    await notify({
      recipientId: partner.player_id,
      type: 'seat_payment_reminder',
      actorId: user.id,
      params: {
        actorName: actorMini.name,
        tournamentName: tm.name,
        amount: formatFee(currency, partnerSeat.amountDue),
        currency,
      },
      link: tm.slug
        ? `/tournaments/${tm.slug}?entered=${registrationId}#my-registrations`
        : '/tournaments',
      entityType: 'registration',
      entityId: registrationId,
    });
    return { ok: true, message: 'Reminder sent.' };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
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
      .select('id, inviter_id, invitee_id, tournament_id, team_id, status')
      .eq('id', invitationId)
      .maybeSingle();
    const row = inv as {
      inviter_id: string;
      invitee_id: string;
      tournament_id: string;
      team_id: string | null;
      status: string;
    } | null;
    if (!row || row.invitee_id !== user.id) return { error: 'Invitation not found.' };
    if (row.status !== 'sent') return { error: 'This invitation is no longer pending.' };

    if (accept) {
      const { data: acceptData, error } = await svc.rpc('accept_partner_invitation', {
        p_invitation_id: invitationId,
        p_actor: user.id,
      });
      if (error) {
        // §2AT Decision A: `team_paid_not_mergeable` here is about the accepting player's OWN solo
        // team (the one migration 0045 would otherwise fold into the inviter's) - resolve their own
        // name, same "best-effort, else That player" rule as every other call site.
        return await friendlyLogged(
          user.id,
          'accept_partner_invitation',
          error.message,
          undefined,
          (await getActorMini(user.id)).name,
        );
      }
      // §2AT Decision A (migration 0045): a mergeable solo entry folds into the team just joined - the
      // RPC already withdrew that registration (event `merged_into_team`) and disbanded its solo team;
      // the money and the notice are this server's job below, alongside the ordinary acceptance flow.
      const mergedRegistrationId =
        (acceptData as { merged_registration_id?: string } | null)?.merged_registration_id ?? null;
      const mergedTeamId =
        (acceptData as { merged_team_id?: string } | null)?.merged_team_id ?? null;
      if (mergedRegistrationId) {
        // The invitee's own money follows them: detach it from the now-withdrawn merged registration
        // so it is a live bare slot again, in time for the ordinary bare-slot attach below to reuse it
        // on the joined entry (§2AO A4's existing pattern, unchanged).
        await detachSlots(mergedRegistrationId, user.id);
      }
      // The snapshot now covers both members - re-check fit + composition at acceptance, not only
      // at invite (a community skill level can move between the two, §2AM decision 3).
      let liveRegId: string | null = null;
      if (row.team_id) {
        const { data: regRows } = await svc
          .from('registrations')
          .select('id')
          .eq('team_id', row.team_id)
          .not('status', 'in', '(withdrawn,cancelled,rejected)');
        const regs = (regRows ?? []) as { id: string }[];
        liveRegId = regs[0]?.id ?? null;
        for (const r of regs) {
          await computeRegistrationEligibility(r.id);
        }
      }
      // §2AO A4: the invitee's own bare slot (if they have one) attaches to the entry now; otherwise,
      // when the entry has no team-scope payment and the division charges a fee, tell them a seat
      // payment is due (critical - it both informs and blocks their team from being fully paid).
      if (liveRegId) {
        try {
          const { data: liveRegRow } = await svc
            .from('registrations')
            .select('division_id')
            .eq('id', liveRegId)
            .maybeSingle();
          const divisionId = (liveRegRow as { division_id: string } | null)?.division_id;
          if (divisionId) {
            const { data: divRow } = await svc
              .from('divisions')
              .select('fee_amount, early_bird_fee_amount, currency')
              .eq('id', divisionId)
              .maybeSingle();
            const div = divRow as {
              fee_amount: number;
              early_bird_fee_amount: number | null;
              currency: string;
            } | null;
            if (div && Number(div.fee_amount) > 0) {
              const [tourn, payRow] = await Promise.all([
                svc
                  .from('tournaments')
                  .select('name, slug, early_bird_starts_at, early_bird_ends_at')
                  .eq('id', row.tournament_id)
                  .maybeSingle(),
                svc.from('payments').select('id').eq('registration_id', liveRegId).maybeSingle(),
              ]);
              const t = tourn.data as {
                name: string;
                slug: string | null;
                early_bird_starts_at: string | null;
                early_bird_ends_at: string | null;
              } | null;
              const quote = quoteFee({
                feeAmount: Number(div.fee_amount),
                earlyBirdFeeAmount:
                  div.early_bird_fee_amount != null ? Number(div.early_bird_fee_amount) : null,
                earlyBirdStartsAt: t?.early_bird_starts_at ?? null,
                earlyBirdEndsAt: t?.early_bird_ends_at ?? null,
                teamSize: 1,
              });
              const attached = await attachBareSlot(
                row.tournament_id,
                user.id,
                liveRegId,
                quote.perPlayer,
              );
              if (!attached && !payRow.data) {
                const seatDueParams = {
                  tournamentName: t?.name ?? 'a tournament',
                  amount: formatFee(div.currency, quote.perPlayer),
                  currency: div.currency,
                  deadline:
                    quote.earlyBirdApplied && quote.earlyBirdEndsAt
                      ? formatDate(quote.earlyBirdEndsAt)
                      : undefined,
                };
                await notify({
                  recipientId: user.id,
                  type: 'seat_payment_due',
                  params: seatDueParams,
                  link: t?.slug
                    ? `/tournaments/${t.slug}?entered=${liveRegId}#my-registrations`
                    : '/tournaments',
                  entityType: 'tournament',
                  entityId: row.tournament_id,
                });
              }
            }
          }
          await settleRegistration(liveRegId, user.id);
        } catch {
          // best-effort
        }
      }
      const [me, tm] = await Promise.all([
        getActorMini(user.id),
        getTournamentMini(row.tournament_id),
      ]);
      // §2AT Decision A: settle the folded-away registration (best-effort - it is already `withdrawn`
      // by the RPC, so this is only ever a no-op safety net) and tell the invitee their own entry is
      // now this team's, before the ordinary "invite accepted" notice to the inviter below.
      if (mergedRegistrationId) {
        try {
          await settleRegistration(mergedRegistrationId, user.id);
          const inviterMini = await getActorMini(row.inviter_id);
          await notify({
            recipientId: user.id,
            type: 'entry_merged',
            actorId: row.inviter_id,
            params: { actorName: inviterMini.name, tournamentName: tm.name },
            link: tm.slug ? `/tournaments/${tm.slug}#my-registrations` : '/tournaments',
            entityType: 'registration',
            entityId: mergedRegistrationId,
          });
          await writeAudit({
            actorId: user.id,
            action: 'registration.merged',
            entityType: 'registration',
            entityId: mergedRegistrationId,
            after: { merged_team_id: mergedTeamId, joined_registration_id: liveRegId },
          });
        } catch {
          // best-effort
        }
      }
      // Notify the inviter that their invite was accepted and the team is formed (§27.1).
      await notify({
        recipientId: row.inviter_id,
        type: 'partner_accepted',
        actorId: user.id,
        params: { actorName: me.name, tournamentName: tm.name },
        // The inviter manages their now-formed team in My registrations, not the wizard (§2AS fix).
        link: tm.slug ? `/tournaments/${tm.slug}#my-registrations` : '/tournaments',
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
      if (error) return await friendlyLogged(user.id, 'decline_partner_invitation', error.message);
      const [me, tm] = await Promise.all([
        getActorMini(user.id),
        getTournamentMini(row.tournament_id),
      ]);
      await notify({
        recipientId: row.inviter_id,
        type: 'partner_declined',
        actorId: user.id,
        params: { actorName: me.name, tournamentName: tm.name },
        // The inviter re-invites into the now-open seat from My registrations, not the wizard (§2AS).
        link: tm.slug ? `/tournaments/${tm.slug}#my-registrations` : '/tournaments',
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

/**
 * Withdraw an unanswered invite and free the seat, atomically (master_plan §2AM decision 3/4).
 *
 * Withdrawing an UNCONFIRMED invitee stays unilateral - they consented to nothing. The previous
 * version only flipped the invitation row and left the zombie unconfirmed team_members row behind,
 * so the seat read "not vacant" and nobody could be named into it. The RPC removes both in one
 * transaction; the invitee is told either way.
 */
export async function cancelInvitation(invitationId: string): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { data: inv } = await svc
      .from('partner_invitations')
      .select('inviter_id, tournament_id, team_id, status')
      .eq('id', invitationId)
      .maybeSingle();
    const row = inv as {
      inviter_id: string;
      tournament_id: string;
      team_id: string | null;
      status: string;
    } | null;
    if (!row || row.inviter_id !== user.id) return { error: 'Invitation not found.' };
    if (row.status !== 'sent') return { error: 'This invitation is no longer pending.' };

    const { data, error } = await svc.rpc('cancel_partner_invitation', {
      p_invitation_id: invitationId,
      p_actor: user.id,
    });
    if (error) return await friendlyLogged(user.id, 'cancel_partner_invitation', error.message);
    const inviteeId = (data as { invitee_id?: string } | null)?.invitee_id;

    // §2AO A4: the withdrawn invitee's money travels with them (they were never a confirmed member,
    // but a bare slot could already have been attached in the meantime).
    if (row.team_id && inviteeId) {
      try {
        const { data: regRow } = await svc
          .from('registrations')
          .select('id')
          .eq('team_id', row.team_id)
          .not('status', 'in', '(withdrawn,cancelled,rejected)')
          .maybeSingle();
        const regId = (regRow as { id: string } | null)?.id;
        if (regId) {
          await detachSlots(regId, inviteeId);
          await settleRegistration(regId, user.id);
        }
      } catch {
        // best-effort
      }
    }

    if (inviteeId) {
      const [me, tm] = await Promise.all([
        getActorMini(user.id),
        getTournamentMini(row.tournament_id),
      ]);
      await notify({
        recipientId: inviteeId,
        type: 'partner_invite_withdrawn',
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
  return { ok: true, message: 'Invite withdrawn - the seat is open again.' };
}

// ---------------------------------------------------------------------------
// Consented partner change on a CONFIRMED team (master_plan §2AM decision 4)
// ---------------------------------------------------------------------------

/**
 * Start a partner-release request: either member may ask to remove the OTHER confirmed member
 * ("ask them to release the seat") or themselves ("leave this team"). The approver is always the
 * other confirmed member - the one being asked to agree, whichever direction the request runs.
 * Nothing changes until they answer: the registration, slot and payment stay with the entry.
 */
export async function requestPartnerRelease(
  teamId: string,
  leavingPlayerId: string,
  message?: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { data, error } = await svc.rpc('request_partner_release', {
      p_team_id: teamId,
      p_actor: user.id,
      p_leaving_player: leavingPlayerId,
      p_message: message?.trim() || null,
    });
    if (error) return await friendlyLogged(user.id, 'request_partner_release', error.message);
    const approverId = (data as { approver_id?: string } | null)?.approver_id;
    const leavingPlayer =
      (data as { leaving_player?: string } | null)?.leaving_player ?? leavingPlayerId;

    const { data: teamRow } = await svc
      .from('teams')
      .select('tournament_id')
      .eq('id', teamId)
      .maybeSingle();
    const tournamentId = (teamRow as { tournament_id: string } | null)?.tournament_id;

    let approverName = 'your partner';
    if (approverId && tournamentId) {
      const [me, tm, approver] = await Promise.all([
        getActorMini(user.id),
        getTournamentMini(tournamentId),
        getActorMini(approverId),
      ]);
      approverName = approver.name;
      await notify({
        recipientId: approverId,
        type: 'partner_release_requested',
        actorId: user.id,
        params: { actorName: me.name, tournamentName: tm.name },
        // The approver ACTS on this in My registrations (Accept / Decline the release), so land them
        // there - not on `?register=1`, which opened the registration wizard instead (§2AS fix).
        link: tm.slug ? `/tournaments/${tm.slug}#my-registrations` : '/tournaments',
        entityType: 'tournament',
        entityId: tournamentId,
      });
      await revalTournament(tournamentId);
    }
    return {
      ok: true,
      message:
        leavingPlayer === user.id
          ? `Your request to leave the team was sent to ${approverName}.`
          : `We asked ${approverName} to release the seat. Nothing changes until they answer.`,
    };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
}

/** Answer an incoming partner-release request. Accepting removes the leaving member and opens the
 *  seat; declining leaves the team exactly as it was. Either way the requester is told. */
export async function respondPartnerRelease(
  requestId: string,
  accept: boolean,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { data: reqRow } = await svc
      .from('partner_release_requests')
      .select('id, team_id, tournament_id, requested_by, leaving_player')
      .eq('id', requestId)
      .maybeSingle();
    const row = reqRow as {
      id: string;
      team_id: string;
      tournament_id: string;
      requested_by: string;
      leaving_player: string;
    } | null;
    if (!row) return { error: 'That request could not be found.' };

    const { data, error } = await svc.rpc('respond_partner_release', {
      p_request_id: requestId,
      p_actor: user.id,
      p_accept: accept,
    });
    if (error) return await friendlyLogged(user.id, 'respond_partner_release', error.message);

    const [me, tm] = await Promise.all([
      getActorMini(user.id),
      getTournamentMini(row.tournament_id),
    ]);
    const link = tm.slug ? `/tournaments/${tm.slug}?register=1` : '/tournaments';

    if (accept) {
      await notify({
        recipientId: row.requested_by,
        type: 'partner_release_accepted',
        actorId: user.id,
        params: { actorName: me.name, tournamentName: tm.name },
        link,
        entityType: 'tournament',
        entityId: row.tournament_id,
      });
      // §1D: tell the person actually removed too, when that is neither the actor nor the
      // requester who already got the notice above (the two-player common case has nobody left).
      const removedPlayer =
        (data as { removed_player?: string } | null)?.removed_player ?? row.leaving_player;
      if (removedPlayer && removedPlayer !== user.id && removedPlayer !== row.requested_by) {
        await notify({
          recipientId: removedPlayer,
          type: 'partner_removed',
          actorId: user.id,
          params: { actorName: me.name, tournamentName: tm.name },
          link,
          entityType: 'tournament',
          entityId: row.tournament_id,
        });
      }
      // The team now has an open seat - recompute every active registration so the snapshot stops
      // demanding a second player who is no longer there.
      const { data: regRows } = await svc
        .from('registrations')
        .select('id, status')
        .eq('team_id', row.team_id)
        .not('status', 'in', '(withdrawn,cancelled,rejected)');
      // §2AP C4: the team member left BEHIND, if this release drops the entry out of fully paid -
      // resolved once, outside the loop (an accepted release removes at most one player).
      let remainingConfirmed: string[] = [];
      if (removedPlayer) {
        const { data: memberRows } = await svc
          .from('team_members')
          .select('player_id, confirmed_at')
          .eq('team_id', row.team_id);
        remainingConfirmed = (
          (memberRows ?? []) as { player_id: string; confirmed_at: string | null }[]
        )
          .filter((m) => m.confirmed_at && m.player_id !== removedPlayer)
          .map((m) => m.player_id);
      }
      for (const r of (regRows ?? []) as { id: string; status: string }[]) {
        const wasConfirmed = r.status === 'confirmed';
        await computeRegistrationEligibility(r.id);
        // §2AO A4: the leaving player's money travels with them.
        if (removedPlayer) {
          await detachSlots(r.id, removedPlayer);
          const summary = await settleRegistration(r.id, user.id);
          // §2AP C4/Finding 2b: a CONFIRMED entry that drops out of fully paid through this release
          // keeps its `confirmed` status (§2AM) but nothing else told the remaining player their
          // partner's seat is now open money - this is that notice.
          if (wasConfirmed && summary && !summary.fullyPaid && remainingConfirmed.length > 0) {
            const leavingName = (await getActorMini(removedPlayer)).name;
            await notifyMany(remainingConfirmed, {
              type: 'partner_left_pay_pending',
              actorId: user.id,
              params: { actorName: leavingName, tournamentName: tm.name },
              link: tm.slug
                ? `/tournaments/${tm.slug}?entered=${r.id}#my-registrations`
                : '/tournaments',
              entityType: 'tournament',
              entityId: row.tournament_id,
            });
          }
        }
      }
    } else {
      await notify({
        recipientId: row.requested_by,
        type: 'partner_release_declined',
        actorId: user.id,
        params: { actorName: me.name, tournamentName: tm.name },
        // The requester is still on the team - send them to their entry, not the registration
        // wizard (§2AS fix). `accepted`/`removed` keep the re-register link: those players are off.
        link: tm.slug ? `/tournaments/${tm.slug}#my-registrations` : '/tournaments',
        entityType: 'tournament',
        entityId: row.tournament_id,
      });
    }
    await revalTournament(row.tournament_id);
    return {
      ok: true,
      message: accept ? 'Accepted. The seat is now open.' : 'Declined. Nothing changed.',
    };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
}

/** Withdraw an outgoing partner-release request before it is answered. */
export async function cancelPartnerRelease(requestId: string): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { data: reqRow } = await svc
      .from('partner_release_requests')
      .select('tournament_id')
      .eq('id', requestId)
      .maybeSingle();
    const tournamentId = (reqRow as { tournament_id: string } | null)?.tournament_id;
    const { error } = await svc.rpc('cancel_partner_release', {
      p_request_id: requestId,
      p_actor: user.id,
    });
    if (error) return await friendlyLogged(user.id, 'cancel_partner_release', error.message);
    if (tournamentId) await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Request withdrawn.' };
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
    if (error) return await friendlyLogged(user.id, 'register_team', error.message);
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
  try {
    const outcome = await doRegisterSolo(tournamentId, divisionId, user.id);
    if (outcome.error) return { error: outcome.error };
    return {
      ok: true,
      registrationId: outcome.registrationId,
      message: outcome.message ?? 'Slot held.',
    };
  } catch {
    return { error: 'Registration is temporarily unavailable.' };
  }
}

/**
 * "Enter now, choose a partner later" (master_plan §2AM decision 2).
 *
 * Creates a `forming` doubles team with ONE confirmed member (the actor) and registers it
 * immediately - the slot hold, and then payment, run exactly like any other entry. The open second
 * seat is a first-class state (`seatOpen`): ELIG_V1 evaluates the present member and does not demand
 * a partner that does not exist yet. A partner can be named any time before the lock-in.
 */
export async function enterDoublesSolo(
  tournamentId: string,
  divisionId: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const statusErr = await checkActorCanInteract(user.id);
  if (statusErr) return { error: statusErr };
  try {
    const outcome = await doEnterDoublesSolo(tournamentId, divisionId, user.id);
    if (outcome.error) return { error: outcome.error };
    return { ok: true, registrationId: outcome.registrationId, message: outcome.message ?? '' };
  } catch {
    return { error: 'Registration is temporarily unavailable. Please try again shortly.' };
  }
}

/**
 * Orchestrate the wizard's single "start entry" call (master_plan §2AO B): dispatches to
 * `doRegisterSolo` / `doEnterWithPendingPartner` / `doEnterDoublesSolo` by division format and whether
 * a partner slug was given, then attaches the actor's own live bare slot (if any) and settles the
 * registration's money state in one round trip, so the hold starts exactly as the Pay step appears.
 */
export async function startEntry(
  tournamentId: string,
  input: {
    divisionId: string;
    partnerSlug: string | null;
    acknowledgedPartner: boolean;
    acknowledgedPlayDown: boolean;
  },
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const statusErr = await checkActorCanInteract(user.id);
  if (statusErr) return { error: statusErr };

  const svc = createServiceClient();
  let outcome: EntryOutcome;
  try {
    const { data: division } = await svc
      .from('divisions')
      .select('format')
      .eq('id', input.divisionId)
      .maybeSingle();
    const format = (division as { format: string } | null)?.format;
    if (!format) return { error: 'Division not found.' };

    if (format === 'singles') {
      outcome = await doRegisterSolo(tournamentId, input.divisionId, user.id);
    } else if (input.partnerSlug) {
      if (!input.acknowledgedPartner) {
        return { error: 'Please confirm you have agreed to play together.' };
      }
      outcome = await doEnterWithPendingPartner(
        tournamentId,
        { divisionId: input.divisionId, inviteeSlug: input.partnerSlug, message: '' },
        user.id,
      );
    } else {
      outcome = await doEnterDoublesSolo(tournamentId, input.divisionId, user.id);
    }
  } catch {
    return { error: 'Registration is temporarily unavailable. Please try again shortly.' };
  }
  if (outcome.error) return { error: outcome.error };
  const regId = outcome.registrationId;
  if (!regId) return { error: 'Could not start your entry. Please try again.' };

  // Best-effort: the registration above already succeeded, so a failure past this point must not be
  // reported as a failed entry - the wizard/pay-step can always settle again.
  try {
    if (outcome.teamId) {
      const { data: divRow } = await svc
        .from('divisions')
        .select('fee_amount, early_bird_fee_amount')
        .eq('id', input.divisionId)
        .maybeSingle();
      const div = divRow as { fee_amount: number; early_bird_fee_amount: number | null } | null;
      if (div) {
        const { data: tournRow } = await svc
          .from('tournaments')
          .select('early_bird_starts_at, early_bird_ends_at')
          .eq('id', tournamentId)
          .maybeSingle();
        const t = tournRow as {
          early_bird_starts_at: string | null;
          early_bird_ends_at: string | null;
        } | null;
        const quote = quoteFee({
          feeAmount: Number(div.fee_amount),
          earlyBirdFeeAmount:
            div.early_bird_fee_amount != null ? Number(div.early_bird_fee_amount) : null,
          earlyBirdStartsAt: t?.early_bird_starts_at ?? null,
          earlyBirdEndsAt: t?.early_bird_ends_at ?? null,
          teamSize: 1,
        });
        // §2AO A4: entering a division with a live bare slot in hand attaches it immediately.
        await attachBareSlot(tournamentId, user.id, regId, quote.perPlayer);
      }
    }
    await settleRegistration(regId, user.id);
    if (input.acknowledgedPlayDown) {
      await svc.from('registration_events').insert({
        registration_id: regId,
        actor_id: user.id,
        event_type: 'play_down_acknowledged',
        from_status: outcome.status ?? null,
        to_status: outcome.status ?? null,
      });
    }
  } catch {
    // best-effort
  }

  return {
    ok: true,
    registrationId: regId,
    teamId: outcome.teamId,
    status: outcome.status,
    message: outcome.message ?? 'Slot held.',
  };
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
    if (!member)
      return await staleTeamError(user.id, 'requestRegistrationCancellation', registrationId);

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

// ---------------------------------------------------------------------------
// Cancel-my-reservation (master_plan §2AS F) - a LIVE bare (no-division-yet) slot only. A slot already
// attached to an entry uses `requestRegistrationCancellation` above instead.
// ---------------------------------------------------------------------------

/**
 * A player asks to cancel their own reserved (bare) slot. Sets `cancel_requested_at`/`cancel_reason`
 * defensively (migration 0044, extended - still unapplied) and notifies the organizers; the organizer
 * then decides via `decideSlotCancellation` below. No new table: the request lives on the slot row
 * itself, the same pattern `requestRegistrationCancellation` uses for entries.
 */
export async function requestSlotCancellation(
  slotId: string,
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
    const { data: slotRow } = await svc
      .from('tournament_slots')
      .select('id, tournament_id, player_id, registration_id, status')
      .eq('id', slotId)
      .maybeSingle();
    const slot = slotRow as {
      id: string;
      tournament_id: string;
      player_id: string;
      registration_id: string | null;
      status: string;
    } | null;
    if (!slot || slot.tournament_id !== tournamentId) return { error: 'Reserved slot not found.' };
    if (slot.registration_id) {
      return { error: 'This slot is attached to an entry - cancel the entry instead.' };
    }
    if (slot.player_id !== user.id) return { error: 'You do not own this reserved slot.' };
    // §2AT (2): the UI no longer offers this on a declined slot - a rejected reservation has nothing
    // to cancel, only to remove (`dismissSlot`) or replace with a new receipt.
    if (!['submitted', 'verified'].includes(slot.status)) {
      return { error: 'Only an active reservation can be cancelled.' };
    }

    try {
      await svc
        .from('tournament_slots')
        .update({ cancel_requested_at: new Date().toISOString(), cancel_reason: trimmed })
        .eq('id', slotId);
    } catch {
      // Column not present yet (migration 0044 extended pending) - nothing else to roll back.
    }

    const [me, tm, organizerIds] = await Promise.all([
      getActorMini(user.id),
      getTournamentMini(tournamentId),
      getTournamentOrganizerIds(tournamentId),
    ]);
    if (organizerIds.length) {
      await notifyMany(organizerIds, {
        type: 'slot_cancel_requested',
        actorId: user.id,
        params: { actorName: me.name, tournamentName: tm.name, reason: trimmed },
        link: tm.slug ? `/tournaments/${tm.slug}/manage` : '/tournaments',
        entityType: 'tournament_slot',
        entityId: slotId,
      });
    }
    await writeAudit({
      actorId: user.id,
      action: 'slot.cancel_requested',
      entityType: 'tournament_slot',
      entityId: slotId,
      after: { cancel_reason: trimmed },
    });
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
 * Organizer decides a pending slot-cancellation request (master_plan §2AS F). `keep: true` clears the
 * request and tells the player their slot stays (`slot_cancel_declined`, critical); `keep: false`
 * refunds through the existing `markRefunded` path (same audit/notification/settle behaviour as any
 * other slot refund) and then clears the request.
 */
export async function decideSlotCancellation(
  slotId: string,
  tournamentId: string,
  keep: boolean,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'manage_payments'))) {
    return { error: 'You do not have permission to review payments.' };
  }
  const svc = createServiceClient();
  try {
    const { data: slotRow } = await svc
      .from('tournament_slots')
      .select('id, tournament_id, player_id, registration_id')
      .eq('id', slotId)
      .maybeSingle();
    const slot = slotRow as {
      id: string;
      tournament_id: string;
      player_id: string;
      registration_id: string | null;
    } | null;
    if (!slot || slot.tournament_id !== tournamentId) return { error: 'Reserved slot not found.' };

    const clearRequest = async () => {
      try {
        await svc
          .from('tournament_slots')
          .update({ cancel_requested_at: null, cancel_reason: null })
          .eq('id', slotId);
      } catch {
        // Column not present yet (migration 0044 extended pending).
      }
    };

    if (keep) {
      await clearRequest();
      const tm = await getTournamentMini(tournamentId);
      await notify({
        recipientId: slot.player_id,
        type: 'slot_cancel_declined',
        actorId: user.id,
        params: { tournamentName: tm.name },
        // The player still holds the reserved slot - it lives in My registrations, not the wizard (§2AS).
        link: tm.slug ? `/tournaments/${tm.slug}#my-registrations` : '/tournaments',
        entityType: 'tournament_slot',
        entityId: slotId,
      });
      await writeAudit({
        actorId: user.id,
        action: 'slot.cancel_kept',
        entityType: 'tournament_slot',
        entityId: slotId,
      });
      await revalTournament(tournamentId);
      return { ok: true, message: 'Kept - the player was notified their slot stays.' };
    }

    const refunded = await markRefunded(
      slotId,
      tournamentId,
      "Cancelled at the player's request",
      'slot',
    );
    if (refunded.error) return refunded;
    await clearRequest();
    // §2AT: the player is told the cancellation went through, distinct from the ordinary refund path
    // (`markRefunded` itself sends nothing) - money-adjacent, so critical (same reasoning as
    // `cancellation_approved` on the entry side).
    const tm = await getTournamentMini(tournamentId);
    await notify({
      recipientId: slot.player_id,
      type: 'slot_cancel_approved',
      actorId: user.id,
      params: { tournamentName: tm.name },
      link: tm.slug ? `/tournaments/${tm.slug}#my-registrations` : '/tournaments',
      entityType: 'tournament_slot',
      entityId: slotId,
    });
    await writeAudit({
      actorId: user.id,
      action: 'slot.cancel_refunded',
      entityType: 'tournament_slot',
      entityId: slotId,
    });
    return { ok: true, message: 'Refunded - the reservation is closed.' };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
}

// ---------------------------------------------------------------------------
// Cancellation requests, both sides (master_plan §2AT Decision C) - withdraw (player), approve/decline
// (organizer). Both an entry's request (`registration_events`) and a bare slot's (`cancel_requested_at`
// on the slot row, migration 0044) get their own withdraw path here; the organizer's two decisions are
// shared with the existing reject/refund machinery so behaviour never forks from it.
// ---------------------------------------------------------------------------

/** The cancellation-family event types, oldest to newest - the LATEST one per registration is the
 *  whole truth of whether a request is still pending (master_plan §2AT Decision C). Mirrors the same
 *  list `registration-queries.ts` uses to derive `cancellationRequest`/`cancellationRequested` - kept
 *  here too since neither file imports from the other. */
const CANCELLATION_EVENT_TYPES = [
  'cancellation_requested',
  'cancellation_withdrawn',
  'cancellation_approved',
  'cancellation_declined',
];

/** The latest cancellation-family event type on a registration, or null when none has ever been
 *  raised. Used to gate withdraw/approve/decline on there actually being a pending request. */
async function latestCancellationEvent(
  svc: ReturnType<typeof createServiceClient>,
  registrationId: string,
): Promise<string | null> {
  const { data } = await svc
    .from('registration_events')
    .select('event_type')
    .eq('registration_id', registrationId)
    .in('event_type', CANCELLATION_EVENT_TYPES)
    .order('created_at', { ascending: false })
    .limit(1);
  return ((data ?? [])[0] as { event_type: string } | undefined)?.event_type ?? null;
}

/** A player withdraws their own pending cancellation REQUEST on an entry (master_plan §2AT Decision C)
 *  - the entry itself is untouched; only the request is retracted, so the organizer's queue stops
 *  showing it. Refuses when the latest cancellation-family event is not `cancellation_requested` (it
 *  was already withdrawn/decided, or none was ever raised). */
export async function withdrawRegistrationCancellation(
  registrationId: string,
  tournamentId: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { data: reg } = await svc
      .from('registrations')
      .select('id, team_id, tournament_id, status')
      .eq('id', registrationId)
      .maybeSingle();
    const row = reg as {
      id: string;
      team_id: string;
      tournament_id: string;
      status: string;
    } | null;
    if (!row || row.tournament_id !== tournamentId) return { error: 'Entry not found.' };

    const { data: member } = await svc
      .from('team_members')
      .select('player_id')
      .eq('team_id', row.team_id)
      .eq('player_id', user.id)
      .maybeSingle();
    if (!member)
      return await staleTeamError(user.id, 'withdrawRegistrationCancellation', registrationId);

    if ((await latestCancellationEvent(svc, registrationId)) !== 'cancellation_requested') {
      return { error: 'There is no pending cancellation request to withdraw.' };
    }

    await svc.from('registration_events').insert({
      registration_id: registrationId,
      actor_id: user.id,
      event_type: 'cancellation_withdrawn',
      from_status: row.status,
      to_status: row.status,
    });

    const [me, tm, organizerIds] = await Promise.all([
      getActorMini(user.id),
      getTournamentMini(tournamentId),
      getTournamentOrganizerIds(tournamentId),
    ]);
    if (organizerIds.length) {
      await notifyMany(organizerIds, {
        type: 'cancellation_withdrawn',
        actorId: user.id,
        params: { actorName: me.name, tournamentName: tm.name },
        link: tm.slug ? `/tournaments/${tm.slug}/manage` : '/tournaments',
        entityType: 'tournament',
        entityId: tournamentId,
      });
    }
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Cancellation request withdrawn.' };
}

/** A player withdraws their own pending cancellation request on a LIVE reserved (bare) slot
 *  (master_plan §2AT Decision C) - clears `cancel_requested_at`/`cancel_reason` (migration 0044,
 *  read/written defensively) without touching the reservation itself. */
export async function withdrawSlotCancellation(
  slotId: string,
  tournamentId: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { data: slotRow } = await svc
      .from('tournament_slots')
      .select('id, tournament_id, player_id')
      .eq('id', slotId)
      .maybeSingle();
    const slot = slotRow as { id: string; tournament_id: string; player_id: string } | null;
    if (!slot || slot.tournament_id !== tournamentId) return { error: 'Reserved slot not found.' };
    if (slot.player_id !== user.id) return { error: 'You do not own this reserved slot.' };

    const cancelRequests = await getSlotCancelRequests([slotId]);
    if (!cancelRequests.get(slotId)?.cancelRequestedAt) {
      return { error: 'There is no pending cancellation request to withdraw.' };
    }

    try {
      await svc
        .from('tournament_slots')
        .update({ cancel_requested_at: null, cancel_reason: null })
        .eq('id', slotId);
    } catch {
      // Column not present yet (migration 0044 extended pending).
    }

    const [me, tm, organizerIds] = await Promise.all([
      getActorMini(user.id),
      getTournamentMini(tournamentId),
      getTournamentOrganizerIds(tournamentId),
    ]);
    if (organizerIds.length) {
      await notifyMany(organizerIds, {
        type: 'cancellation_withdrawn',
        actorId: user.id,
        params: { actorName: me.name, tournamentName: tm.name },
        link: tm.slug ? `/tournaments/${tm.slug}/manage` : '/tournaments',
        entityType: 'tournament_slot',
        entityId: slotId,
      });
    }
    await writeAudit({
      actorId: user.id,
      action: 'slot.cancel_withdrawn',
      entityType: 'tournament_slot',
      entityId: slotId,
    });
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Cancellation request withdrawn.' };
}

/** Organizer approves a pending entry-cancellation REQUEST (master_plan §2AT Decision C) - the explicit
 *  **Approve cancellation** button, replacing "use Reject entry to cancel". Same release + detach +
 *  disband + promotion machinery as `rejectRegistration`, but landing on `cancelled` and recording
 *  `cancellation_approved` rather than a rejection. Refuses when the latest cancellation-family event
 *  is not `cancellation_requested`. */
export async function approveRegistrationCancellation(
  registrationId: string,
  tournamentId: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const authorized =
    (await authorizeOrganizer(user.id, tournamentId, 'approve_registrations')) ||
    (await authorizeOrganizer(user.id, tournamentId, 'manage_payments'));
  if (!authorized) {
    return { error: 'You do not have permission to approve this cancellation.' };
  }
  const svc = createServiceClient();
  try {
    const { data: reg } = await svc
      .from('registrations')
      .select('id, tournament_id, status')
      .eq('id', registrationId)
      .maybeSingle();
    const row = reg as { id: string; tournament_id: string; status: string } | null;
    if (!row || row.tournament_id !== tournamentId) return { error: 'Entry not found.' };

    if ((await latestCancellationEvent(svc, registrationId)) !== 'cancellation_requested') {
      return { error: 'There is no pending cancellation request for this entry.' };
    }

    const { data, error } = await svc.rpc('release_slot', {
      p_registration_id: registrationId,
      p_actor: user.id,
      p_new_status: 'cancelled',
    });
    if (error) return await friendlyLogged(user.id, 'release_slot', error.message);
    // §2AO A4: a closed registration keeps no attached slot - the money travels back as a bare
    // reservation, same as any other closed entry.
    await detachSlots(registrationId);

    await svc.from('registration_events').insert({
      registration_id: registrationId,
      actor_id: user.id,
      event_type: 'cancellation_approved',
      from_status: row.status,
      to_status: 'cancelled',
    });

    // Notify BEFORE the team is taken apart, same reasoning as `rejectRegistration`.
    await notifyRegistrationTeam(registrationId, tournamentId, 'cancellation_approved');
    await disbandTeamIfEntryClosed(svc, registrationId, user.id, 'organizer');
    const promoted = (data as { promoted?: string | null } | null)?.promoted;
    if (promoted) await notifyRegistrationTeam(promoted, tournamentId, 'registration_promoted');
    // §2AO A3: a promoted team may already hold seat receipts - settle so it does not sit on a bare
    // 30-minute hold it has, in money terms, already met.
    if (promoted) await settleRegistration(promoted, null);

    await writeAudit({
      actorId: user.id,
      action: 'registration.cancellation_approved',
      entityType: 'registration',
      entityId: registrationId,
      after: { status: 'cancelled' },
    });
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Cancellation approved - the entry is closed.' };
}

/** Organizer declines a pending entry-cancellation REQUEST (master_plan §2AT Decision C) - the entry is
 *  untouched; the player is told it stands. Refuses when the latest cancellation-family event is not
 *  `cancellation_requested`. */
export async function declineRegistrationCancellation(
  registrationId: string,
  tournamentId: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const authorized =
    (await authorizeOrganizer(user.id, tournamentId, 'approve_registrations')) ||
    (await authorizeOrganizer(user.id, tournamentId, 'manage_payments'));
  if (!authorized) {
    return { error: 'You do not have permission to decide this cancellation.' };
  }
  const svc = createServiceClient();
  try {
    const { data: reg } = await svc
      .from('registrations')
      .select('id, tournament_id, status')
      .eq('id', registrationId)
      .maybeSingle();
    const row = reg as { id: string; tournament_id: string; status: string } | null;
    if (!row || row.tournament_id !== tournamentId) return { error: 'Entry not found.' };

    if ((await latestCancellationEvent(svc, registrationId)) !== 'cancellation_requested') {
      return { error: 'There is no pending cancellation request for this entry.' };
    }

    await svc.from('registration_events').insert({
      registration_id: registrationId,
      actor_id: user.id,
      event_type: 'cancellation_declined',
      from_status: row.status,
      to_status: row.status,
    });

    await notifyRegistrationTeam(registrationId, tournamentId, 'cancellation_declined');
    await writeAudit({
      actorId: user.id,
      action: 'registration.cancellation_declined',
      entityType: 'registration',
      entityId: registrationId,
    });
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Cancellation declined - the entry stands.' };
}

/** A player removes ("Remove") a bare slot the organizer has DECLINED (master_plan §2AT Decision D,
 *  migration 0045) - sets `dismissed_at` so `getLatestBareSlot`/`getOrganizerBareSlots` stop surfacing
 *  it. Only ever a declined (`rejected`), unattached, own slot; a live or refunded one is untouched (a
 *  refunded slot is already closed for good and needs no dismissal). Read/written defensively - the
 *  column arrives with 0045, unapplied at authoring time. */
export async function dismissSlot(
  slotId: string,
  tournamentId: string,
): Promise<RegistrationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { data: slotRow } = await svc
      .from('tournament_slots')
      .select('id, tournament_id, player_id, registration_id, status')
      .eq('id', slotId)
      .maybeSingle();
    const slot = slotRow as {
      id: string;
      tournament_id: string;
      player_id: string;
      registration_id: string | null;
      status: string;
    } | null;
    if (!slot || slot.tournament_id !== tournamentId) return { error: 'Reserved slot not found.' };
    if (slot.registration_id) return { error: 'This slot is attached to an entry.' };
    if (slot.player_id !== user.id) return { error: 'You do not own this reserved slot.' };
    if (slot.status !== 'rejected') return { error: 'Only a declined reservation can be removed.' };

    try {
      await svc
        .from('tournament_slots')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', slotId);
    } catch {
      // Column not present yet (migration 0045 pending) - nothing else to roll back.
    }
    await writeAudit({
      actorId: user.id,
      action: 'slot.dismissed',
      entityType: 'tournament_slot',
      entityId: slotId,
    });
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Reservation removed.' };
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
      if (!member) return await staleTeamError(user.id, 'withdrawRegistration', registrationId);
      const result = await svc.rpc('release_slot', {
        p_registration_id: registrationId,
        p_actor: user.id,
        p_new_status: 'withdrawn',
      });
      data = result.data;
      error = result.error;
    }
    if (error) return await friendlyLogged(user.id, 'withdrawRegistration', error.message);

    // §2AO A4: a closed registration keeps no attached slot - the money travels back to the player as
    // a bare reservation, reusable through the wizard.
    await detachSlots(registrationId);

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
    // §2AO A3: a promoted team may already hold seat receipts - settle so it does not sit on a bare
    // 30-minute hold it has, in money terms, already met.
    if (promoted) await settleRegistration(promoted, null);
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
/**
 * REMOVED (master_plan §2X). Moving a registration between divisions bypassed the gender and
 * skill-cap eligibility that only runs at register time, letting a team reclassify into a division
 * they do not qualify for. The capability is gone: to change division, a team cancels this
 * registration and registers in the correct one. This is kept as a rejecting stub - never calling the
 * RPC - so that a stale client left open across the deploy (deployment skew) cannot still perform the
 * move; it just receives this message.
 */
export async function moveRegistrationDivision(): Promise<RegistrationActionState> {
  return {
    error:
      'Changing division is no longer supported. Please cancel this registration and register in the correct division.',
  };
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
    if (error) return await friendlyLogged(user.id, 'leave_team_after_cancel', error.message);
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
    // §2AS D: free-division confirmations send the same confirmation email as a settled paid entry.
    // Best-effort - never throws.
    await sendConfirmationEmailForRegistration(registrationId);
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
    if (error) return await friendlyLogged(user.id, 'release_slot', error.message);
    // §2AO A4: a closed registration keeps no attached slot.
    await detachSlots(registrationId);
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
    // §2AO A3: a promoted team may already hold seat receipts - settle so it does not sit on a bare
    // 30-minute hold it has, in money terms, already met.
    if (promoted) await settleRegistration(promoted, null);
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Registration rejected and slot released.' };
}
