'use server';

import { revalidateTag } from 'next/cache';
import { paymentSubmitSchema } from '@vouchplay/validation';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { PAYMENT_PROOFS_BUCKET } from '@/lib/storage';
import { loadSettingNumber } from '@/lib/settings';
import { authorizeOrganizer } from '@/lib/tournaments/authz';
import { writeAudit } from '@/lib/moderation/audit';
import { tournamentTag } from '@/lib/tournaments/queries';

export interface PaymentActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const PROOF_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

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
 * Submit manual payment proof for a registration (handover §24.1–§24.2). Team members only. Uploads
 * the proof to the PRIVATE payment-proofs bucket (never public) via the service client, records the
 * payment as `submitted`, and moves the registration to `payment_submitted` with the review grace
 * window (§23.1). Works for a first submission or a resubmission after rejection.
 */
export async function submitPayment(
  registrationId: string,
  tournamentId: string,
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const parsed = paymentSubmitSchema.safeParse({
    method: formData.get('method'),
    payerName: formData.get('payerName') ?? '',
    transactionReference: formData.get('transactionReference') ?? '',
    amountSubmitted: formData.get('amountSubmitted') || undefined,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const p = parsed.data;

  const svc = createServiceClient();
  try {
    const { data: reg } = await svc
      .from('registrations')
      .select('id, team_id, division_id, status')
      .eq('id', registrationId)
      .maybeSingle();
    const r = reg as { team_id: string; division_id: string; status: string } | null;
    if (!r) return { error: 'Registration not found.' };
    const { data: member } = await svc
      .from('team_members')
      .select('id')
      .eq('team_id', r.team_id)
      .eq('player_id', user.id)
      .maybeSingle();
    if (!member) return { error: 'You are not on this team.' };
    if (!['payment_pending', 'payment_submitted'].includes(r.status)) {
      return { error: 'This registration is not awaiting payment.' };
    }

    const { data: division } = await svc
      .from('divisions')
      .select('fee_amount, currency')
      .eq('id', r.division_id)
      .maybeSingle();
    const div = division as { fee_amount: number; currency: string } | null;
    if (!div) return { error: 'Division not found.' };

    // Upload proof (required).
    const file = formData.get('proof');
    if (!(file instanceof File) || file.size === 0) return { error: 'Attach a proof file.' };
    const ext = PROOF_MIME_EXT[file.type];
    if (!ext) return { error: 'Proof must be a PNG, JPG, WebP, or PDF.' };
    if (file.size > MAX_PROOF_BYTES) return { error: 'Proof file must be 5 MB or smaller.' };
    const path = `${registrationId}/proof-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await svc.storage
      .from(PAYMENT_PROOFS_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: true });
    if (upErr) return { error: 'Could not upload the proof. Please try again.' };

    const { error: payErr } = await svc.from('payments').upsert(
      {
        registration_id: registrationId,
        amount_due: div.fee_amount,
        amount_submitted: p.amountSubmitted ?? div.fee_amount,
        currency: div.currency,
        method: p.method,
        payer_name: p.payerName || null,
        transaction_reference: p.transactionReference || null,
        proof_storage_path: path,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        rejection_reason: null,
      },
      { onConflict: 'registration_id' },
    );
    if (payErr) return { error: 'Could not record your payment. Please try again.' };

    const graceHours = await loadSettingNumber('submitted_payment_review_grace_hours', 24);
    await svc
      .from('registrations')
      .update({
        status: 'payment_submitted',
        submitted_at: new Date().toISOString(),
        review_grace_expires_at: new Date(Date.now() + graceHours * 3600 * 1000).toISOString(),
      })
      .eq('id', registrationId);
    await svc.from('registration_events').insert({
      registration_id: registrationId,
      actor_id: user.id,
      event_type: 'payment_submitted',
      from_status: r.status,
      to_status: 'payment_submitted',
    });
    await revalTournament(tournamentId);
  } catch {
    return { error: 'Payment submission is temporarily unavailable.' };
  }
  return { ok: true, message: 'Payment proof submitted — the organizer will review it.' };
}

/** Issue a short-lived signed URL to a payment proof (§38). Team members / organizers / staff only. */
export async function getProofSignedUrl(
  paymentId: string,
): Promise<{ url?: string; error?: string }> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { data: pay } = await svc
      .from('payments')
      .select('proof_storage_path, registration_id')
      .eq('id', paymentId)
      .maybeSingle();
    const payment = pay as { proof_storage_path: string | null; registration_id: string } | null;
    if (!payment?.proof_storage_path) return { error: 'No proof on file.' };
    const { data: reg } = await svc
      .from('registrations')
      .select('team_id, tournament_id')
      .eq('id', payment.registration_id)
      .maybeSingle();
    const r = reg as { team_id: string; tournament_id: string } | null;
    if (!r) return { error: 'Registration not found.' };

    const { data: member } = await svc
      .from('team_members')
      .select('id')
      .eq('team_id', r.team_id)
      .eq('player_id', user.id)
      .maybeSingle();
    const authorized =
      !!member || !!(await authorizeOrganizer(user.id, r.tournament_id, 'manage_payments'));
    if (!authorized) return { error: 'You cannot view this proof.' };

    const { data: signed, error } = await svc.storage
      .from(PAYMENT_PROOFS_BUCKET)
      .createSignedUrl(payment.proof_storage_path, 60);
    if (error || !signed) return { error: 'Could not open the proof.' };
    return { url: signed.signedUrl };
  } catch {
    return { error: 'Could not open the proof.' };
  }
}

// ---------------------------------------------------------------------------
// Organizer payment review (§24.4) — verify / reject-resubmit / mark refunded.
// ---------------------------------------------------------------------------
async function loadPaymentContext(paymentId: string) {
  const svc = createServiceClient();
  const { data: pay } = await svc
    .from('payments')
    .select('id, registration_id, status')
    .eq('id', paymentId)
    .maybeSingle();
  const payment = pay as { registration_id: string; status: string } | null;
  if (!payment) return null;
  const { data: reg } = await svc
    .from('registrations')
    .select('tournament_id, status')
    .eq('id', payment.registration_id)
    .maybeSingle();
  const r = reg as { tournament_id: string; status: string } | null;
  if (!r) return null;
  return { svc, payment, registration: r };
}

export async function verifyPayment(
  paymentId: string,
  tournamentId: string,
): Promise<PaymentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'manage_payments'))) {
    return { error: 'You do not have permission to review payments.' };
  }
  const ctx = await loadPaymentContext(paymentId);
  if (!ctx) return { error: 'Payment not found.' };
  const { svc, payment, registration } = ctx;
  try {
    const now = new Date().toISOString();
    await svc
      .from('payments')
      .update({
        status: 'verified',
        verified_by: user.id,
        verified_at: now,
        rejection_reason: null,
      })
      .eq('id', paymentId);
    await svc
      .from('registrations')
      .update({ status: 'confirmed', confirmed_at: now, reviewed_by: user.id })
      .eq('id', payment.registration_id);
    await svc.from('registration_events').insert({
      registration_id: payment.registration_id,
      actor_id: user.id,
      event_type: 'payment_verified',
      from_status: registration.status,
      to_status: 'confirmed',
    });
    await writeAudit({
      actorId: user.id,
      action: 'payment.verified',
      entityType: 'payment',
      entityId: paymentId,
      after: { status: 'verified' },
    });
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Payment verified — registration confirmed.' };
}

export async function rejectPayment(
  paymentId: string,
  tournamentId: string,
  reason: string,
): Promise<PaymentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'manage_payments'))) {
    return { error: 'You do not have permission to review payments.' };
  }
  if (!reason.trim()) return { error: 'A rejection reason is required (§24.4).' };
  const ctx = await loadPaymentContext(paymentId);
  if (!ctx) return { error: 'Payment not found.' };
  const { svc, payment, registration } = ctx;
  try {
    await svc
      .from('payments')
      .update({ status: 'rejected', rejection_reason: reason.trim() })
      .eq('id', paymentId);
    // Back to payment_pending so the team can resubmit; refresh the slot hold.
    const holdMin = await loadSettingNumber('slot_hold_minutes', 30);
    await svc
      .from('registrations')
      .update({
        status: 'payment_pending',
        review_grace_expires_at: null,
        slot_hold_expires_at: new Date(Date.now() + holdMin * 60 * 1000).toISOString(),
      })
      .eq('id', payment.registration_id);
    await svc.from('registration_events').insert({
      registration_id: payment.registration_id,
      actor_id: user.id,
      event_type: 'payment_rejected',
      from_status: registration.status,
      to_status: 'payment_pending',
      metadata: { reason: reason.trim() },
    });
    await writeAudit({
      actorId: user.id,
      action: 'payment.rejected',
      entityType: 'payment',
      entityId: paymentId,
      after: { status: 'rejected' },
      reason: reason.trim(),
    });
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Payment rejected — the team can resubmit.' };
}

export async function markRefunded(
  paymentId: string,
  tournamentId: string,
  reason: string,
): Promise<PaymentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'manage_payments'))) {
    return { error: 'You do not have permission to review payments.' };
  }
  const ctx = await loadPaymentContext(paymentId);
  if (!ctx) return { error: 'Payment not found.' };
  const { svc, payment } = ctx;
  try {
    await svc.from('payments').update({ status: 'refunded' }).eq('id', paymentId);
    await svc
      .from('registrations')
      .update({ status: 'refunded' })
      .eq('id', payment.registration_id);
    await svc.from('registration_events').insert({
      registration_id: payment.registration_id,
      actor_id: user.id,
      event_type: 'payment_refunded',
      to_status: 'refunded',
      metadata: reason.trim() ? { reason: reason.trim() } : {},
    });
    await writeAudit({
      actorId: user.id,
      action: 'payment.refunded',
      entityType: 'payment',
      entityId: paymentId,
      after: { status: 'refunded' },
      reason: reason.trim() || null,
    });
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Marked refunded.' };
}
