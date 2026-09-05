'use server';

import { skillReviewSchema } from '@vouchplay/validation';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { getSafetySettings } from '@/lib/settings';
import type { SafetyActionState } from './report';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Submit a skill review (handover §14.1, §36.32) — SEPARATE from a report. Used when a player
 * believes another player's displayed/community skill is materially inaccurate. Submitter identity is
 * stored but never publicly displayed (RLS: requester + staff only). A tournament context is
 * optional; organizers may attach one (only an organizer may submit a tournament-context review).
 */
export async function submitSkillReview(
  _prev: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };

  const parsed = skillReviewSchema.safeParse({
    targetPlayerId: formData.get('targetPlayerId'),
    tournamentId: formData.get('tournamentId') ?? '',
    reason: formData.get('reason') ?? '',
    evidenceNote: formData.get('evidenceNote') ?? '',
    evidenceLink: formData.get('evidenceLink') ?? '',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const sr = parsed.data;
  if (sr.targetPlayerId === user.id)
    return { error: 'You cannot request a review of your own skill.' };

  const svc = createServiceClient();
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const tournamentId = sr.tournamentId && sr.tournamentId.trim() ? sr.tournamentId.trim() : null;

  try {
    const [meRes, targetRes, orgRes, rateRes] = await Promise.all([
      svc.from('profiles').select('account_status').eq('id', user.id).maybeSingle(),
      svc.from('profiles').select('id, account_status').eq('id', sr.targetPlayerId).maybeSingle(),
      svc
        .from('user_roles')
        .select('id')
        .eq('user_id', user.id)
        .eq('role', 'organizer')
        .eq('status', 'active')
        .maybeSingle(),
      svc
        .from('skill_reviews')
        .select('id', { count: 'exact', head: true })
        .eq('requester_id', user.id)
        .gte('created_at', since),
    ]);
    const me = meRes.data as { account_status: string } | null;
    if (!me || me.account_status === 'banned') {
      return { error: 'Your account cannot submit skill reviews right now.' };
    }
    const target = targetRes.data as { id: string } | null;
    if (!target) return { error: 'That player could not be found.' };

    // Only organizers may submit a tournament-context skill review (§14.1).
    if (tournamentId && !orgRes.data) {
      return { error: 'Only organizers can submit a tournament-context skill review.' };
    }

    const { skillReviewsPer24h } = await getSafetySettings();
    if ((rateRes.count ?? 0) >= skillReviewsPer24h) {
      return {
        error: `You've reached your skill-review limit (${skillReviewsPer24h} per 24 hours).`,
      };
    }

    // Avoid duplicate open reviews for the same target from the same requester.
    const { data: dup } = await svc
      .from('skill_reviews')
      .select('id')
      .eq('requester_id', user.id)
      .eq('target_player_id', sr.targetPlayerId)
      .in('status', ['open', 'under_review'])
      .maybeSingle();
    if (dup) return { error: 'You already have an open skill review for this player.' };

    const evidence: Record<string, unknown> = {};
    if (sr.evidenceNote && sr.evidenceNote.trim()) evidence.note = sr.evidenceNote.trim();
    if (sr.evidenceLink && sr.evidenceLink.trim()) evidence.links = [sr.evidenceLink.trim()];

    const { error } = await svc.from('skill_reviews').insert({
      requester_id: user.id,
      target_player_id: sr.targetPlayerId,
      tournament_id: tournamentId,
      reason: sr.reason.trim(),
      evidence,
    });
    if (error) return { error: 'Could not submit your skill review. Please try again.' };
  } catch {
    return { error: 'Skill review is temporarily unavailable. Please try again shortly.' };
  }

  return { ok: true, message: 'Skill review submitted. Our team will look into it.' };
}
