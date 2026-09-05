'use server';

import { reportSchema } from '@vouchplay/validation';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { getSafetySettings } from '@/lib/settings';

export interface SafetyActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function buildEvidence(note?: string, link?: string): Record<string, unknown> {
  const evidence: Record<string, unknown> = {};
  if (note && note.trim()) evidence.note = note.trim();
  if (link && link.trim()) evidence.links = [link.trim()];
  return evidence;
}

/**
 * Submit a report (handover §14.2, §36.33). Reports are NEVER anonymous to Admin — reporter_id is
 * stored. Any public UGC (a player profile or a vouch comment) is reportable. Server-side: requires
 * auth, blocks banned accounts, validates the target exists, and rate-limits per §30.7. Blocking a
 * user does NOT prevent reporting them (safety valve).
 */
export async function submitReport(
  _prev: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in to report.' };

  const parsed = reportSchema.safeParse({
    targetType: formData.get('targetType'),
    targetId: formData.get('targetId'),
    reasonCode: formData.get('reasonCode'),
    details: formData.get('details') ?? '',
    evidenceNote: formData.get('evidenceNote') ?? '',
    evidenceLink: formData.get('evidenceLink') ?? '',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const r = parsed.data;

  const svc = createServiceClient();
  const since = new Date(Date.now() - DAY_MS).toISOString();
  try {
    const [meRes, rateRes] = await Promise.all([
      svc.from('profiles').select('account_status').eq('id', user.id).maybeSingle(),
      svc
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('reporter_id', user.id)
        .gte('created_at', since),
    ]);
    const me = meRes.data as { account_status: string } | null;
    if (!me || me.account_status === 'banned') {
      return { error: 'Your account cannot submit reports right now.' };
    }

    const { reportsPer24h } = await getSafetySettings();
    if ((rateRes.count ?? 0) >= reportsPer24h) {
      return { error: `You've reached your report limit (${reportsPer24h} per 24 hours).` };
    }

    // Validate the target exists for the UGC types we surface (player / comment).
    if (r.targetType === 'player') {
      if (r.targetId === user.id) return { error: 'You cannot report yourself.' };
      const { data } = await svc.from('profiles').select('id').eq('id', r.targetId).maybeSingle();
      if (!data) return { error: 'That player could not be found.' };
    } else if (r.targetType === 'comment') {
      const { data } = await svc
        .from('vouch_comments')
        .select('id')
        .eq('id', r.targetId)
        .maybeSingle();
      if (!data) return { error: 'That comment could not be found.' };
    }

    // Prevent obvious duplicate spam: one open report per (reporter, target).
    const { data: dup } = await svc
      .from('reports')
      .select('id')
      .eq('reporter_id', user.id)
      .eq('target_type', r.targetType)
      .eq('target_id', r.targetId)
      .in('status', ['open', 'reviewing'])
      .maybeSingle();
    if (dup) return { error: 'You already have an open report for this. Our team is on it.' };

    const { error } = await svc.from('reports').insert({
      reporter_id: user.id,
      target_type: r.targetType,
      target_id: r.targetId,
      reason_code: r.reasonCode,
      details: r.details && r.details.trim() ? r.details.trim() : null,
      evidence: buildEvidence(r.evidenceNote, r.evidenceLink),
    });
    if (error) return { error: 'Could not submit your report. Please try again.' };
  } catch {
    return { error: 'Reporting is temporarily unavailable. Please try again shortly.' };
  }

  return { ok: true, message: 'Report submitted. Thank you — our team will review it.' };
}
