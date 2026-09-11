'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import type { IdentityVerificationStatus } from '@vouchplay/db';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { IDENTITY_DOCS_BUCKET } from '@/lib/storage';
import { loadSettingFlag, loadSettingNumber } from '@/lib/settings';
import { assertStaffActor } from '@/lib/moderation/staff';
import { writeAudit } from '@/lib/moderation/audit';
import { PLAYERS_LIST_TAG, playerTag } from '@/lib/players/queries';
import { prepareIdentityDocument } from '@/lib/identity/prepare-identity-document';
import { IDENTITY_DOCUMENT_TYPES, type IdentityDocumentType } from '@/lib/identity/document-types';

/**
 * Identity verification pipeline (master_plan §2AG Phase C, handover §13.3). Staff-approved ONLY -
 * uploading a document never verifies anyone by itself (D1). The player-facing "ID Verified" badge
 * and the STS_V2 trust anchor both key off `identity_verifications.status='approved'`
 * (`fetchVerifiedUserIds` in players/queries.ts and the V2 anchored-voucher set) - approving here is
 * the ONLY thing that ever flips that status, so nothing else needs to touch badge/anchor logic.
 *
 * Retention (the most privacy-protective option, per Phase C sign-off): the ID image is DELETED from
 * storage the moment a reviewer decides, approve or reject - only the decision row survives.
 * `document_delete_after` is a pre-decision backstop timestamp only (submitted_at + admin-tunable
 * `identity_doc_retention_days`); nothing in this file sweeps rows once that backstop passes - a
 * scheduled cleanup job is a later phase.
 *
 * Fail-open: every read/write here is wrapped so a not-yet-applied migration 0036 (missing bucket,
 * missing `identity_verification_enabled`/`identity_doc_retention_days` settings) degrades to a
 * friendly "not available yet" error instead of a thrown exception - it must never break a page.
 */

export interface IdentityActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

// The document-type list + type live in a PLAIN module, not here: a `'use server'` file may only
// export async functions, so exporting a const from it made it `undefined` on the client and crashed
// the upload form. Imported here for the server-side validation below; the client imports it directly.

/** Statuses that block a new submission: already pending review, under review, or approved. */
const BLOCKING_STATUSES: IdentityVerificationStatus[] = ['pending', 'reviewing', 'approved'];
/** Statuses a staff decision may act on. */
const OPEN_REVIEW_STATUSES: IdentityVerificationStatus[] = ['pending', 'reviewing'];

function documentErrorMessage(
  error: 'empty' | 'too_large' | 'unsupported_type' | 'invalid_image' | 'invalid_pdf',
): string {
  switch (error) {
    case 'empty':
      return 'Attach your ID.';
    case 'too_large':
      return 'Your ID file must be 5 MB or smaller.';
    case 'unsupported_type':
      return 'Use a PNG, JPG, WebP, or PDF file.';
    case 'invalid_pdf':
      return 'That PDF could not be read. Upload a valid PDF.';
    default:
      return 'That image could not be read. Use a valid PNG, JPG, or WebP image.';
  }
}

/**
 * Submit an identity document for review (Me → Settings → "Verify my identity"). Requires an
 * onboarded, signed-in player who already has a profile photo (D1: photo AND ID together) and has
 * no pending/reviewing/approved verification already on file. Uploads the prepared document to the
 * PRIVATE `identity-docs` bucket via the service client (never public) and inserts a `pending` row;
 * staff decide from there - this never sets `approved` itself.
 */
export async function submitIdentityVerification(
  _prev: IdentityActionState,
  formData: FormData,
): Promise<IdentityActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };

  const svc = createServiceClient();
  let uploadedPath: string | null = null;
  try {
    const enabled = await loadSettingFlag('identity_verification_enabled', true);
    if (!enabled) return { error: 'Identity verification is not available right now.' };

    const { data: profileRow } = await svc
      .from('profiles')
      .select('slug, onboarded_at, avatar_path')
      .eq('id', user.id)
      .maybeSingle();
    const profile = profileRow as {
      slug: string | null;
      onboarded_at: string | null;
      avatar_path: string | null;
    } | null;
    if (!profile?.onboarded_at) return { error: 'Finish setting up your profile first.' };
    if (!profile.avatar_path) {
      return { error: 'Add a profile photo before verifying your identity.' };
    }

    const { data: existingRows } = await svc
      .from('identity_verifications')
      .select('id')
      .eq('user_id', user.id)
      .in('status', BLOCKING_STATUSES)
      .limit(1);
    if ((existingRows ?? []).length > 0) {
      return { error: 'You already have an identity verification pending or approved.' };
    }

    const documentTypeRaw = formData.get('documentType');
    const documentType =
      typeof documentTypeRaw === 'string' &&
      (IDENTITY_DOCUMENT_TYPES as readonly string[]).includes(documentTypeRaw)
        ? (documentTypeRaw as IdentityDocumentType)
        : null;
    if (!documentType) return { error: 'Choose a document type.' };

    const file = formData.get('document');
    if (!(file instanceof File)) return { error: 'Attach your ID.' };
    const prepared = await prepareIdentityDocument(file);
    if (!prepared.ok) return { error: documentErrorMessage(prepared.error) };

    const path = `${user.id}/id-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${prepared.extension}`;
    const { error: upErr } = await svc.storage
      .from(IDENTITY_DOCS_BUCKET)
      .upload(path, prepared.bytes, { contentType: prepared.mimeType, upsert: false });
    if (upErr)
      return { error: 'Identity verification is not available yet. Please try again shortly.' };
    uploadedPath = path;

    const retentionDays = await loadSettingNumber('identity_doc_retention_days', 7);
    const deleteAfter = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: inserted, error: insErr } = await svc
      .from('identity_verifications')
      .insert({
        user_id: user.id,
        document_type: documentType,
        document_storage_path: path,
        status: 'pending',
        document_delete_after: deleteAfter,
      })
      .select('id')
      .single();
    if (insErr || !inserted) {
      await svc.storage.from(IDENTITY_DOCS_BUCKET).remove([path]);
      return { error: 'Identity verification is not available yet. Please try again shortly.' };
    }

    await writeAudit({
      actorId: user.id,
      action: 'identity.submitted',
      entityType: 'identity_verification',
      entityId: (inserted as { id: string }).id,
      after: { status: 'pending', document_type: documentType },
    });

    revalidateTag(PLAYERS_LIST_TAG);
    if (profile.slug) revalidateTag(playerTag(profile.slug));
    revalidatePath('/me/settings/identity');
  } catch {
    // Best-effort cleanup so a mid-flight failure never leaves an orphaned private document.
    if (uploadedPath) {
      try {
        await svc.storage.from(IDENTITY_DOCS_BUCKET).remove([uploadedPath]);
      } catch {
        /* best effort only */
      }
    }
    return { error: 'Identity verification is not available yet. Please try again shortly.' };
  }
  return { ok: true, message: "Submitted - we'll review it soon." };
}

/**
 * Mint a short-lived (5-minute) signed URL to a submitted document, STAFF ONLY. Never returns
 * anything to a non-staff caller - this is the single authorized path a government ID is ever
 * readable through, and the link expires quickly by design.
 */
export async function getIdentityDocSignedUrl(
  verificationId: string,
): Promise<{ url?: string; error?: string }> {
  const actor = await assertStaffActor();
  if (!actor) return { error: 'You need a stepped-up staff session to view this.' };
  const svc = createServiceClient();
  try {
    const { data } = await svc
      .from('identity_verifications')
      .select('document_storage_path, document_deleted_at')
      .eq('id', verificationId)
      .maybeSingle();
    const row = data as {
      document_storage_path: string | null;
      document_deleted_at: string | null;
    } | null;
    if (!row?.document_storage_path || row.document_deleted_at) {
      return { error: 'No document on file - it may already have been deleted after review.' };
    }
    const { data: signed, error } = await svc.storage
      .from(IDENTITY_DOCS_BUCKET)
      .createSignedUrl(row.document_storage_path, 300);
    if (error || !signed) return { error: 'Could not open the document.' };
    return { url: signed.signedUrl };
  } catch {
    return { error: 'Could not open the document.' };
  }
}

/**
 * Staff decision on a submitted identity verification: approve or reject, with an audited reason
 * (required to reject). Approving sets `status='approved'`, which is the ONLY thing that ever
 * activates the "ID Verified" badge and the STS_V2 trust anchor (both read `identity_verifications`
 * directly) - this action never touches badge/anchor logic itself. On EITHER decision the private
 * document is deleted from storage and `document_deleted_at` is stamped; `document_storage_path`
 * is left in place as an audit-trail breadcrumb (the object it names is already gone).
 */
export async function reviewIdentityVerification(
  verificationId: string,
  decision: 'approve' | 'reject',
  reason: string,
): Promise<IdentityActionState> {
  const actor = await assertStaffActor();
  if (!actor) return { error: 'You need a stepped-up staff session to do that.' };
  if (decision === 'reject' && !reason.trim()) {
    return { error: 'A reason is required to reject an identity verification.' };
  }

  const svc = createServiceClient();
  try {
    const { data } = await svc
      .from('identity_verifications')
      .select('id, user_id, status, document_storage_path')
      .eq('id', verificationId)
      .maybeSingle();
    const row = data as {
      user_id: string;
      status: IdentityVerificationStatus;
      document_storage_path: string | null;
    } | null;
    if (!row) return { error: 'Verification not found.' };
    if (!OPEN_REVIEW_STATUSES.includes(row.status)) {
      return { error: 'This verification was already decided.' };
    }

    const { data: subjectRow } = await svc
      .from('profiles')
      .select('slug')
      .eq('id', row.user_id)
      .maybeSingle();
    const subjectSlug = (subjectRow as { slug: string | null } | null)?.slug ?? null;

    const now = new Date().toISOString();
    const nextStatus: IdentityVerificationStatus = decision === 'approve' ? 'approved' : 'rejected';

    const { error: updErr } = await svc
      .from('identity_verifications')
      .update({
        status: nextStatus,
        reviewed_at: now,
        reviewed_by: actor.viewerId,
        review_reason: decision === 'reject' ? reason.trim() : null,
      })
      .eq('id', verificationId);
    if (updErr) return { error: 'Could not update the verification.' };

    // Delete the private document on EITHER decision (§13.3 retention) - best effort; only stamp
    // document_deleted_at when the removal actually reports success.
    if (row.document_storage_path) {
      const { error: rmErr } = await svc.storage
        .from(IDENTITY_DOCS_BUCKET)
        .remove([row.document_storage_path]);
      if (!rmErr) {
        await svc
          .from('identity_verifications')
          .update({ document_deleted_at: now })
          .eq('id', verificationId);
      }
    }

    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: decision === 'approve' ? 'identity.approved' : 'identity.rejected',
      entityType: 'identity_verification',
      entityId: verificationId,
      before: { status: row.status },
      after: { status: nextStatus },
      reason: decision === 'reject' ? reason.trim() : null,
    });

    revalidateTag(PLAYERS_LIST_TAG);
    if (subjectSlug) revalidateTag(playerTag(subjectSlug));
    revalidatePath('/staff/moderation');
  } catch {
    return { error: 'Moderation action failed. Please try again.' };
  }
  return {
    ok: true,
    message:
      decision === 'approve'
        ? 'Identity verification approved.'
        : 'Identity verification rejected.',
  };
}
