'use server';

import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { authorizeOrganizer } from '@/lib/tournaments/authz';
import { writeAudit } from '@/lib/moderation/audit';
import { tournamentTag } from '@/lib/tournaments/queries';
import { computeRegistrationEligibility } from '@/lib/eligibility/compute';
import { notifyRegistrationTeam } from '@/lib/notifications/registration-notify';
import { revalidateTag } from 'next/cache';

/**
 * Organizer eligibility actions (handover §25.5). These are OVERRIDES of the decision-support engine:
 * the organizer always decides. Every override writes an append-only audit_logs row + an immutable
 * registration_events row (§25.2 "cannot silently bypass a hard rule"). Neutral wording only (§25.6).
 */

export interface EligibilityActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

async function revalTournament(svc: ReturnType<typeof createServiceClient>, tournamentId: string) {
  const { data } = await svc
    .from('tournaments')
    .select('slug')
    .eq('id', tournamentId)
    .maybeSingle();
  const slug = (data as { slug: string } | null)?.slug;
  if (slug) revalidateTag(tournamentTag(slug));
}

interface RegForOverride {
  id: string;
  tournament_id: string;
  team_id: string;
  eligibility_status: string;
  status: string;
}

async function loadReg(
  svc: ReturnType<typeof createServiceClient>,
  registrationId: string,
): Promise<RegForOverride | null> {
  const { data } = await svc
    .from('registrations')
    .select('id, tournament_id, team_id, eligibility_status, status')
    .eq('id', registrationId)
    .maybeSingle();
  return (data as RegForOverride | null) ?? null;
}

/**
 * Approve a team's eligibility despite a REVIEW / SKILL_MISMATCH / hard-rule finding: overrides the
 * eligibility_status to 'eligible'. A hard-rule override REQUIRES a reason (§25.2). This does not
 * confirm the registration (payment/confirm stays a separate step) - it only clears the flag.
 */
export async function approveEligibility(
  registrationId: string,
  tournamentId: string,
  reason: string,
): Promise<EligibilityActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'approve_registrations'))) {
    return { error: 'You do not have permission to review registrations.' };
  }
  const svc = createServiceClient();
  try {
    const reg = await loadReg(svc, registrationId);
    if (!reg || reg.tournament_id !== tournamentId) return { error: 'Registration not found.' };
    if (reg.eligibility_status === 'eligible') {
      return { ok: true, message: 'Already marked eligible.' };
    }
    const isHardRule = reg.eligibility_status === 'ineligible_hard_rule';
    if (isHardRule && !reason.trim()) {
      return { error: 'A reason is required to override a division rule.' };
    }

    await svc
      .from('registrations')
      .update({
        eligibility_status: 'eligible',
        eligibility_snapshot: buildOverrideSnapshot(reg.eligibility_status, user.id, reason),
      })
      .eq('id', registrationId);

    await svc.from('registration_events').insert({
      registration_id: registrationId,
      actor_id: user.id,
      event_type: 'eligibility_override',
      from_status: reg.eligibility_status,
      to_status: 'eligible',
      metadata: { reason: reason.trim() || null, hard_rule_override: isHardRule },
    });
    await writeAudit({
      actorId: user.id,
      action: isHardRule ? 'eligibility_hard_rule_override' : 'eligibility_approve',
      entityType: 'registration',
      entityId: registrationId,
      before: { eligibility_status: reg.eligibility_status },
      after: { eligibility_status: 'eligible' },
      reason: reason.trim() || null,
    });
    await revalTournament(svc, tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Marked eligible. Recorded in the audit log.' };
}

function buildOverrideSnapshot(fromStatus: string, actorId: string, reason: string) {
  return {
    override: {
      by: actorId,
      at: new Date().toISOString(),
      fromStatus,
      toStatus: 'eligible',
      reason: reason.trim() || null,
    },
  };
}

/**
 * Move a team's registration to a different division in the same tournament (§25.5 Reclassify). Only
 * a format- and size-compatible target is allowed; eligibility is recomputed against the new
 * division. This is an organizer override (audited); capacity is the organizer's call.
 */
export async function reclassifyRegistration(
  registrationId: string,
  tournamentId: string,
  newDivisionId: string,
  reason: string,
): Promise<EligibilityActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'approve_registrations'))) {
    return { error: 'You do not have permission to review registrations.' };
  }
  const svc = createServiceClient();
  try {
    const reg = await loadReg(svc, registrationId);
    if (!reg || reg.tournament_id !== tournamentId) return { error: 'Registration not found.' };

    const { data: teamData } = await svc
      .from('teams')
      .select('id, division_id')
      .eq('id', reg.team_id)
      .maybeSingle();
    const team = teamData as { id: string; division_id: string } | null;
    if (!team) return { error: 'Team not found.' };
    if (team.division_id === newDivisionId) {
      return { error: 'That team is already in this division.' };
    }

    const [{ data: fromDivData }, { data: toDivData }, { count: memberCount }] = await Promise.all([
      svc
        .from('divisions')
        .select('id, format, team_size')
        .eq('id', team.division_id)
        .maybeSingle(),
      svc
        .from('divisions')
        .select('id, tournament_id, format, team_size, status')
        .eq('id', newDivisionId)
        .maybeSingle(),
      svc
        .from('team_members')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', reg.team_id),
    ]);
    const toDiv = toDivData as {
      id: string;
      tournament_id: string;
      format: string;
      team_size: number;
      status: string;
    } | null;
    const fromDiv = fromDivData as { format: string; team_size: number } | null;
    if (!toDiv || toDiv.tournament_id !== tournamentId)
      return { error: 'Target division not found.' };
    if (fromDiv && (fromDiv.format !== toDiv.format || fromDiv.team_size !== toDiv.team_size)) {
      return { error: 'You can only reclassify to a division with the same format and team size.' };
    }
    if ((memberCount ?? 0) !== toDiv.team_size) {
      return { error: 'The team size does not match the target division.' };
    }

    // Prevent an active duplicate registration in the target division.
    const { data: dup } = await svc
      .from('registrations')
      .select('id')
      .eq('team_id', reg.team_id)
      .eq('division_id', newDivisionId)
      .not('status', 'in', '(withdrawn,cancelled,rejected)')
      .maybeSingle();
    if (dup) return { error: 'That team already has a registration in the target division.' };

    await svc.from('teams').update({ division_id: newDivisionId }).eq('id', reg.team_id);
    await svc.from('registrations').update({ division_id: newDivisionId }).eq('id', registrationId);

    await svc.from('registration_events').insert({
      registration_id: registrationId,
      actor_id: user.id,
      event_type: 'reclassified',
      from_status: reg.status,
      to_status: reg.status,
      metadata: {
        from_division: team.division_id,
        to_division: newDivisionId,
        reason: reason.trim() || null,
      },
    });
    await writeAudit({
      actorId: user.id,
      action: 'eligibility_reclassify',
      entityType: 'registration',
      entityId: registrationId,
      before: { division_id: team.division_id },
      after: { division_id: newDivisionId },
      reason: reason.trim() || null,
    });

    // Recompute eligibility against the new division rules and refresh the dashboard.
    await computeRegistrationEligibility(registrationId);
    await notifyRegistrationTeam(registrationId, tournamentId, 'eligibility_reclassified');
    await revalTournament(svc, tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Team reclassified. Eligibility re-checked.' };
}

/**
 * Organizer-initiated skill review for a team member (§25.5). Creates a tournament-context
 * skill_review (Phase-4 §14.1) so the moderation team can look at the player's community skill.
 * Audited. Neutral: this asks for a review, it does not label anyone.
 */
export async function requestSkillReviewForRegistration(
  registrationId: string,
  tournamentId: string,
  targetPlayerId: string,
  reason: string,
): Promise<EligibilityActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'approve_registrations'))) {
    return { error: 'You do not have permission to review registrations.' };
  }
  if (!reason.trim()) return { error: 'Please add a short reason for the review.' };
  const svc = createServiceClient();
  try {
    const reg = await loadReg(svc, registrationId);
    if (!reg || reg.tournament_id !== tournamentId) return { error: 'Registration not found.' };

    // Confirm the target is actually on this registration's team.
    const { data: member } = await svc
      .from('team_members')
      .select('id')
      .eq('team_id', reg.team_id)
      .eq('player_id', targetPlayerId)
      .maybeSingle();
    if (!member) return { error: 'That player is not on this team.' };
    if (targetPlayerId === user.id) return { error: 'You cannot request a review of yourself.' };

    // Avoid duplicate open reviews from this organizer for the same player.
    const { data: dup } = await svc
      .from('skill_reviews')
      .select('id')
      .eq('requester_id', user.id)
      .eq('target_player_id', targetPlayerId)
      .in('status', ['open', 'under_review'])
      .maybeSingle();
    if (dup) return { error: 'You already have an open skill review for this player.' };

    const { error } = await svc.from('skill_reviews').insert({
      requester_id: user.id,
      target_player_id: targetPlayerId,
      tournament_id: tournamentId,
      reason: reason.trim(),
      evidence: { source: 'eligibility_panel', registration_id: registrationId },
    });
    if (error) return { error: 'Could not submit the skill review. Please try again.' };

    await writeAudit({
      actorId: user.id,
      action: 'eligibility_request_skill_review',
      entityType: 'registration',
      entityId: registrationId,
      after: { target_player_id: targetPlayerId },
      reason: reason.trim(),
    });
    await revalTournament(svc, tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Skill review requested. Our team will look into it.' };
}
