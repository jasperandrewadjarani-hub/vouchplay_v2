'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { coachApplicationSchema, coachDecisionSchema } from '@vouchplay/validation';
import { getOptionalUser } from '@/lib/auth';
import { assertAdminActor } from '@/lib/moderation/staff';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ROLE_EVIDENCE_BUCKET } from '@/lib/storage';
import { loadSettingFlag, loadSettingNumber } from '@/lib/settings';
import { prepareCoachEvidence, type PreparedCoachEvidence } from '@/lib/coach/evidence';
import { notify } from '@/lib/notifications/create';
import { emitAnalyticsEvent } from '@/lib/analytics';
import { PLAYERS_LIST_TAG } from '@/lib/players/queries';
import type { SafetyActionState } from './report';
import { writeAudit } from '@/lib/moderation/audit';

function values(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .flatMap((value) => String(value).split(/\r?\n|,/))
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseApplication(formData: FormData) {
  return coachApplicationSchema.safeParse({
    experience: formData.get('experience') ?? '',
    yearsExperience: formData.get('yearsExperience') ?? 0,
    organizations: formData.get('organizations') ?? '',
    locations: formData.get('locations') ?? '',
    specialties: values(formData, 'specialties'),
    certifications: formData.get('certifications') ?? '',
    references: values(formData, 'references'),
    note: formData.get('note') ?? '',
    consent: formData.get('consent') === 'on',
  });
}

function evidenceFiles(formData: FormData): File[] {
  return formData
    .getAll('evidence')
    .filter((value): value is File => value instanceof File && value.size > 0);
}

function metadata(files: PreparedCoachEvidence[]) {
  return files.map((file) => ({
    storage_path: file.storagePath,
    original_filename: file.originalFilename,
    mime_type: file.mimeType,
    size_bytes: file.sizeBytes,
    sha256: file.sha256,
  }));
}

async function uploadEvidence(files: PreparedCoachEvidence[]): Promise<string[]> {
  const svc = createServiceClient();
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const { error } = await svc.storage
        .from(ROLE_EVIDENCE_BUCKET)
        .upload(file.storagePath, file.bytes, {
          contentType: file.mimeType,
          upsert: false,
          cacheControl: '0',
        });
      if (error) throw error;
      uploaded.push(file.storagePath);
    }
    return uploaded;
  } catch (error) {
    if (uploaded.length) await svc.storage.from(ROLE_EVIDENCE_BUCKET).remove(uploaded);
    throw error;
  }
}

async function cleanupEvidence(paths: string[]) {
  if (!paths.length) return;
  await createServiceClient().storage.from(ROLE_EVIDENCE_BUCKET).remove(paths);
}

function safeApplicationError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  if (
    /Attach no more than|unsupported file type|must be \d+ MB|could not be decoded|still too large/i.test(
      message,
    )
  )
    return message;
  if (/open_application_exists/i.test(message))
    return 'You already have an open Coach application.';
  if (/already_coach/i.test(message)) return 'You already have an active Coach role.';
  if (/resubmission_not_requested/i.test(message))
    return 'This application is not waiting for more information.';
  return fallback;
}

export async function submitCoachApplication(
  _prev: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await loadSettingFlag('coach_applications_enabled', true))) {
    return { error: 'Coach applications are temporarily closed.' };
  }
  const parsed = parseApplication(formData);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the application.' };

  const applicationId = randomUUID();
  let prepared: PreparedCoachEvidence[] = [];
  let uploaded: string[] = [];
  try {
    prepared = await prepareCoachEvidence(evidenceFiles(formData), user.id, applicationId);
    uploaded = await uploadEvidence(prepared);
    const supabase = await createClient();
    const { error } = await supabase.rpc('submit_coach_application', {
      p_application_id: applicationId,
      p_answers: parsed.data,
      p_evidence: metadata(prepared),
    });
    if (error) {
      throw error;
    }
    emitAnalyticsEvent('coach_application_submitted', { evidenceCount: prepared.length });
  } catch (error) {
    if (uploaded.length) await cleanupEvidence(uploaded);
    return { error: safeApplicationError(error, 'Could not submit the application.') };
  }
  revalidatePath('/me');
  revalidatePath('/me/roles/coach');
  revalidatePath('/staff/role-applications/coaches');
  return { ok: true, message: 'Coach application submitted for review.' };
}

export async function resubmitCoachApplication(
  applicationId: string,
  _prev: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const parsed = parseApplication(formData);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the application.' };
  let prepared: PreparedCoachEvidence[] = [];
  let uploaded: string[] = [];
  try {
    prepared = await prepareCoachEvidence(evidenceFiles(formData), user.id, applicationId);
    uploaded = await uploadEvidence(prepared);
    const supabase = await createClient();
    const { error } = await supabase.rpc('resubmit_coach_application', {
      p_application_id: applicationId,
      p_answers: parsed.data,
      p_evidence: metadata(prepared),
    });
    if (error) {
      throw error;
    }
    emitAnalyticsEvent('coach_application_resubmitted', { evidenceCount: prepared.length });
  } catch (error) {
    if (uploaded.length) await cleanupEvidence(uploaded);
    return { error: safeApplicationError(error, 'Could not submit the response.') };
  }
  revalidatePath('/me/roles/coach');
  revalidatePath('/staff/role-applications/coaches');
  return { ok: true, message: 'Additional information submitted.' };
}

export async function withdrawCoachApplication(applicationId: string): Promise<SafetyActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('withdraw_coach_application', {
    p_application_id: applicationId,
  });
  if (error) return { error: 'The application could not be withdrawn.' };
  emitAnalyticsEvent('coach_application_withdrawn');
  revalidatePath('/me');
  revalidatePath('/me/roles/coach');
  revalidatePath('/staff/role-applications/coaches');
  return { ok: true, message: 'Application withdrawn.' };
}

export async function startCoachReview(applicationId: string): Promise<SafetyActionState> {
  if (!(await assertAdminActor()))
    return { error: 'Admin access with a verified two-factor session is required.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('start_coach_application_review', {
    p_application_id: applicationId,
  });
  if (error) return { error: 'Could not start the review.' };
  revalidatePath(`/staff/role-applications/coaches/${applicationId}`);
  revalidatePath('/staff/role-applications/coaches');
  return { ok: true, message: 'Review started.' };
}

export async function decideCoachApplication(
  applicationId: string,
  decision: 'request_information' | 'approve' | 'reject',
  applicantReason: string,
  internalNote: string,
): Promise<SafetyActionState> {
  if (!(await assertAdminActor()))
    return { error: 'Admin access with a verified two-factor session is required.' };
  const parsed = coachDecisionSchema.safeParse({ decision, applicantReason, internalNote });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the decision.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('decide_coach_application', {
    p_application_id: applicationId,
    p_decision: decision,
    p_applicant_reason: parsed.data.applicantReason || null,
    p_internal_note: parsed.data.internalNote || null,
  });
  if (error) return { error: 'The decision could not be saved.' };
  const result = data as { user_id?: string } | null;
  if (result?.user_id) {
    await notify({
      recipientId: result.user_id,
      type:
        decision === 'request_information'
          ? 'coach_information_requested'
          : 'coach_application_result',
      params: {
        outcome:
          decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : undefined,
        reason: parsed.data.applicantReason || undefined,
      },
      link: '/me/roles/coach',
      entityType: 'role_application',
      entityId: applicationId,
    });
  }
  emitAnalyticsEvent(
    decision === 'request_information'
      ? 'coach_application_information_requested'
      : decision === 'approve'
        ? 'coach_application_approved'
        : 'coach_application_rejected',
  );
  revalidateTag(PLAYERS_LIST_TAG);
  revalidatePath(`/staff/role-applications/coaches/${applicationId}`);
  revalidatePath('/staff/role-applications/coaches');
  revalidatePath('/me/roles/coach');
  return {
    ok: true,
    message:
      decision === 'request_information'
        ? 'Information requested.'
        : `Application ${decision === 'approve' ? 'approved' : 'rejected'}.`,
  };
}

/** Signed URLs are issued only after the action-level Admin + AAL2 guard. */
export async function getCoachEvidenceSignedUrl(
  evidenceId: string,
): Promise<{ url?: string; error?: string }> {
  const actor = await assertAdminActor();
  if (!actor) return { error: 'Admin access with a verified two-factor session is required.' };
  const svc = createServiceClient();
  const { data } = await svc
    .from('role_application_evidence')
    .select('storage_path, deleted_at')
    .eq('id', evidenceId)
    .maybeSingle();
  const row = data as { storage_path: string; deleted_at: string | null } | null;
  if (!row || row.deleted_at) return { error: 'Evidence is no longer available.' };
  const seconds = await loadSettingNumber('coach_evidence_signed_url_seconds', 60);
  const { data: signed, error } = await svc.storage
    .from(ROLE_EVIDENCE_BUCKET)
    .createSignedUrl(row.storage_path, seconds);
  if (error || !signed) return { error: 'Could not open the evidence.' };
  await writeAudit({
    actorId: actor.viewerId,
    actorRole: actor.role,
    action: 'coach.evidence.open',
    entityType: 'role_application_evidence',
    entityId: evidenceId,
    after: { signed_url_seconds: seconds },
    reason: 'Authorized AAL2 review',
  });
  emitAnalyticsEvent('coach_evidence_opened');
  return { url: signed.signedUrl };
}
