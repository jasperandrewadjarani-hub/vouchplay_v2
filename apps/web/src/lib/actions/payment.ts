'use server';

import { revalidateTag } from 'next/cache';
import { paymentSubmitSchema, type PaymentSubmitInput } from '@vouchplay/validation';
import { quoteFee, quoteSlotPrice } from '@vouchplay/core';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { PAYMENT_PROOFS_BUCKET } from '@/lib/storage';
import { loadSettingNumber, isSlotReservationsEnabled } from '@/lib/settings';
import { authorizeOrganizer } from '@/lib/tournaments/authz';
import { checkActorCanInteract } from '@/lib/moderation/enforcement';
import { writeAudit } from '@/lib/moderation/audit';
import { tournamentTag } from '@/lib/tournaments/queries';
import { notify, notifyMany } from '@/lib/notifications/create';
import { getTournamentMini, getTournamentOrganizerIds } from '@/lib/notifications/recipients';
import { notifyRegistrationTeam } from '@/lib/notifications/registration-notify';
import { preparePaymentProof } from '@/lib/payments/proof-file';
import { emailChannelEnabled, sendEmail } from '@/lib/notifications/email';
import { settleRegistration } from '@/lib/payments/slots';
import {
  notifyPaymentReceiptUploaded,
  buildPaymentNotificationEmail,
  gatherPaymentSummary,
  getReceiptsToNotify,
  type PaymentNotificationInput,
} from '@/lib/payments/notification';
import { publicEnv } from '@/lib/env';

export interface PaymentActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

function paymentProofError(
  error: 'empty' | 'too_large' | 'unsupported_type' | 'invalid_image' | 'invalid_pdf',
): string {
  switch (error) {
    case 'empty':
      return 'Attach a proof file.';
    case 'too_large':
      return 'Proof file must be 5 MB or smaller.';
    case 'unsupported_type':
      return 'Proof must be a PNG, JPG, WebP, or PDF.';
    case 'invalid_pdf':
      return 'Proof PDF could not be read. Upload a valid PDF.';
    default:
      return 'Proof image could not be read. Use a valid PNG, JPG, or WebP image.';
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

    // fee_amount is PER PLAYER since migration 0026, so the amount owed is fee x team size.
    // The early-bird price is resolved HERE, at submission - the amount owed is the amount that was
    // true when the receipt was sent, not when the entry was started (§1V).
    const { data: division } = await svc
      .from('divisions')
      .select('fee_amount, early_bird_fee_amount, currency, team_size, tournament_id')
      .eq('id', r.division_id)
      .maybeSingle();
    const div = division as {
      fee_amount: number;
      early_bird_fee_amount: number | null;
      currency: string;
      team_size: number;
      tournament_id: string;
    } | null;
    if (!div) return { error: 'Division not found.' };
    const { data: tourn } = await svc
      .from('tournaments')
      .select('early_bird_starts_at, early_bird_ends_at')
      .eq('id', div.tournament_id)
      .maybeSingle();
    const t = tourn as {
      early_bird_starts_at: string | null;
      early_bird_ends_at: string | null;
    } | null;
    const quote = quoteFee({
      feeAmount: Number(div.fee_amount),
      earlyBirdFeeAmount:
        div.early_bird_fee_amount != null ? Number(div.early_bird_fee_amount) : null,
      earlyBirdStartsAt: t?.early_bird_starts_at ?? null,
      earlyBirdEndsAt: t?.early_bird_ends_at ?? null,
      teamSize: div.team_size,
    });

    // Upload proof (required).
    const file = formData.get('proof');
    if (!(file instanceof File)) return { error: 'Attach a proof file.' };
    const preparedProof = await preparePaymentProof(file);
    if (!preparedProof.ok) return { error: paymentProofError(preparedProof.error) };
    const path = `${registrationId}/proof-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${preparedProof.extension}`;
    const { error: upErr } = await svc.storage
      .from(PAYMENT_PROOFS_BUCKET)
      .upload(path, preparedProof.bytes, { contentType: preparedProof.mimeType, upsert: false });
    if (upErr) return { error: 'Could not upload the proof. Please try again.' };

    const { error: payErr } = await svc.from('payments').upsert(
      {
        registration_id: registrationId,
        amount_due: quote.teamTotal,
        amount_submitted: p.amountSubmitted ?? quote.teamTotal,
        currency: div.currency,
        method: p.method,
        payer_name: p.payerName || null,
        transaction_reference: p.transactionReference || null,
        proof_storage_path: path,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        rejection_reason: null,
        // §2AL: a fresh/resubmitted receipt must be eligible to notify again.
        notification_sent_at: null,
      },
      { onConflict: 'registration_id' },
    );
    if (payErr) {
      await svc.storage.from(PAYMENT_PROOFS_BUCKET).remove([path]);
      return { error: 'Could not record your payment. Please try again.' };
    }

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
    // §2AO A3: keeps one path deciding the registration's money state. Harmless here - the update
    // above already set 'payment_submitted', so this settle is a same-state no-op.
    await settleRegistration(registrationId, user.id);
    const [organizers, tm] = await Promise.all([
      getTournamentOrganizerIds(tournamentId),
      getTournamentMini(tournamentId),
    ]);
    await notifyMany(organizers, {
      type: 'payment_submitted',
      params: { tournamentName: tm.name },
      link: tm.slug ? `/tournaments/${tm.slug}/manage` : '/tournaments',
      entityType: 'tournament',
      entityId: tournamentId,
    });
    // Best-effort receipt notification to the organizer's designated bank handler (§2AK). Never
    // throws and never blocks/fails the player's submission.
    await notifyPaymentReceiptUploaded(registrationId, user.id);
    await revalTournament(tournamentId);
  } catch {
    return { error: 'Payment submission is temporarily unavailable.' };
  }
  return { ok: true, message: 'Payment proof submitted - the organizer will review it.' };
}

// ---------------------------------------------------------------------------
// Shared by the two seat-payment actions below (master_plan §2AO A5/A6/B).
// ---------------------------------------------------------------------------

/** Same field validation `submitPayment` uses, factored out so the seat/reservation actions below
 *  share it instead of re-parsing the form by hand. */
function parsePaymentFields(
  formData: FormData,
): { ok: true; data: PaymentSubmitInput } | { ok: false; error: string } {
  const parsed = paymentSubmitSchema.safeParse({
    method: formData.get('method'),
    payerName: formData.get('payerName') ?? '',
    transactionReference: formData.get('transactionReference') ?? '',
    amountSubmitted: formData.get('amountSubmitted') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  return { ok: true, data: parsed.data };
}

/** Validate + upload one proof file into the private payments bucket at `${pathPrefix}.${ext}`. */
async function uploadPaymentProof(
  formData: FormData,
  pathPrefix: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const file = formData.get('proof');
  if (!(file instanceof File)) return { ok: false, error: 'Attach a proof file.' };
  const prepared = await preparePaymentProof(file);
  if (!prepared.ok) return { ok: false, error: paymentProofError(prepared.error) };
  const path = `${pathPrefix}.${prepared.extension}`;
  const svc = createServiceClient();
  const { error } = await svc.storage
    .from(PAYMENT_PROOFS_BUCKET)
    .upload(path, prepared.bytes, { contentType: prepared.mimeType, upsert: false });
  if (error) return { ok: false, error: 'Could not upload the proof. Please try again.' };
  return { ok: true, path };
}

const randomSuffix = () => crypto.randomUUID().slice(0, 8);

/**
 * Submit payment for ONE seat on a doubles/singles entry (master_plan §2AO A1/A5/A6). The price is
 * `quoteSlotPrice`'s per-player amount for the registration's own division, resolved at submission
 * (early bird at submission, same rule as `submitPayment`). Writes exactly one `tournament_slots` row
 * for (registration, actor): resubmits a rejected one, refuses a second live one, else inserts.
 */
export async function submitSeatPayment(
  registrationId: string,
  tournamentId: string,
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await isSlotReservationsEnabled())) {
    return { error: 'Seat payments are not available yet.' };
  }
  const parsed = parsePaymentFields(formData);
  if (!parsed.ok) return { error: parsed.error };
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
    if (!['payment_pending', 'payment_submitted', 'waitlisted'].includes(r.status)) {
      return { error: 'This registration is not awaiting payment.' };
    }

    const { data: division } = await svc
      .from('divisions')
      .select('fee_amount, early_bird_fee_amount, currency, tournament_id')
      .eq('id', r.division_id)
      .maybeSingle();
    const div = division as {
      fee_amount: number;
      early_bird_fee_amount: number | null;
      currency: string;
      tournament_id: string;
    } | null;
    if (!div) return { error: 'Division not found.' };
    const { data: tourn } = await svc
      .from('tournaments')
      .select('early_bird_starts_at, early_bird_ends_at')
      .eq('id', div.tournament_id)
      .maybeSingle();
    const t = tourn as {
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

    const { data: existingRows } = await svc
      .from('tournament_slots')
      .select('id, status')
      .eq('registration_id', registrationId)
      .eq('player_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const existing = ((existingRows ?? []) as { id: string; status: string }[])[0] ?? null;
    if (existing && (existing.status === 'submitted' || existing.status === 'verified')) {
      return { error: 'You already sent a receipt for your seat.' };
    }

    const upload = await uploadPaymentProof(
      formData,
      `${registrationId}/seat-${user.id}-${Date.now()}-${randomSuffix()}`,
    );
    if (!upload.ok) return { error: upload.error };

    const amountDue = quote.perPlayer;
    const amountSubmitted = p.amountSubmitted ?? amountDue;
    const now = new Date().toISOString();
    let slotId: string | null = null;

    if (existing) {
      const { data: updated, error: updErr } = await svc
        .from('tournament_slots')
        .update({
          amount_due: amountDue,
          amount_submitted: amountSubmitted,
          currency: div.currency,
          method: p.method,
          payer_name: p.payerName || null,
          transaction_reference: p.transactionReference || null,
          proof_storage_path: upload.path,
          status: 'submitted',
          early_bird_applied: quote.earlyBirdApplied,
          submitted_at: now,
          rejection_reason: null,
          notification_sent_at: null,
        })
        .eq('id', existing.id)
        .select('id')
        .maybeSingle();
      if (updErr || !updated) {
        await svc.storage.from(PAYMENT_PROOFS_BUCKET).remove([upload.path]);
        return { error: 'Could not record your payment. Please try again.' };
      }
      slotId = (updated as { id: string }).id;
    } else {
      const { data: inserted, error: insErr } = await svc
        .from('tournament_slots')
        .insert({
          registration_id: registrationId,
          division_id: r.division_id,
          tournament_id: div.tournament_id,
          player_id: user.id,
          status: 'submitted',
          amount_due: amountDue,
          amount_submitted: amountSubmitted,
          currency: div.currency,
          method: p.method,
          payer_name: p.payerName || null,
          transaction_reference: p.transactionReference || null,
          proof_storage_path: upload.path,
          early_bird_applied: quote.earlyBirdApplied,
          submitted_at: now,
        })
        .select('id')
        .single();
      if (insErr || !inserted) {
        await svc.storage.from(PAYMENT_PROOFS_BUCKET).remove([upload.path]);
        return { error: 'Could not record your payment. Please try again.' };
      }
      slotId = (inserted as { id: string }).id;
    }

    await svc.from('registration_events').insert({
      registration_id: registrationId,
      actor_id: user.id,
      event_type: 'seat_payment_submitted',
      from_status: r.status,
      to_status: r.status,
      metadata: { slot_id: slotId },
    });

    const [organizers, tm] = await Promise.all([
      getTournamentOrganizerIds(tournamentId),
      getTournamentMini(tournamentId),
    ]);
    await notifyMany(organizers, {
      type: 'payment_submitted',
      params: { tournamentName: tm.name },
      link: tm.slug ? `/tournaments/${tm.slug}/manage` : '/tournaments',
      entityType: 'tournament',
      entityId: tournamentId,
    });
    await notifyPaymentReceiptUploaded(registrationId, user.id, { slotId: slotId ?? undefined });
    await settleRegistration(registrationId, user.id);
    await revalTournament(tournamentId);
  } catch {
    return { error: 'Payment submission is temporarily unavailable.' };
  }
  return { ok: true, message: 'Payment proof submitted - the organizer will review it.' };
}

/**
 * Reserve and pay for OWN seat, with no division (and no team) yet (master_plan §2AO A1/A5). Price is
 * the cheapest per-player quote among the tournament's OPEN, fee-charging divisions
 * (`quoteSlotPrice`, packages/core). One live bare slot per player per tournament.
 */
export async function submitSlotReservation(
  tournamentId: string,
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await isSlotReservationsEnabled())) {
    return { error: 'Seat payments are not available yet.' };
  }
  const statusErr = await checkActorCanInteract(user.id);
  if (statusErr) return { error: statusErr };
  const parsed = parsePaymentFields(formData);
  if (!parsed.ok) return { error: parsed.error };
  const p = parsed.data;

  const svc = createServiceClient();
  try {
    const { data: t } = await svc
      .from('tournaments')
      .select('name, slug, status, early_bird_starts_at, early_bird_ends_at')
      .eq('id', tournamentId)
      .maybeSingle();
    const tourn = t as {
      name: string;
      slug: string | null;
      status: string;
      early_bird_starts_at: string | null;
      early_bird_ends_at: string | null;
    } | null;
    if (!tourn) return { error: 'Tournament not found.' };
    if (tourn.status !== 'registration_open') {
      return { error: 'Registration is not open for this tournament.' };
    }

    const { data: divRows } = await svc
      .from('divisions')
      .select('id, status, fee_amount, early_bird_fee_amount, currency')
      .eq('tournament_id', tournamentId);
    const divisions = (divRows ?? []) as {
      id: string;
      status: string;
      fee_amount: number;
      early_bird_fee_amount: number | null;
      currency: string;
    }[];
    const earlyBird = {
      startsAt: tourn.early_bird_starts_at,
      endsAt: tourn.early_bird_ends_at,
    };
    const quote = quoteSlotPrice(
      divisions.map((d) => ({
        status: d.status,
        feeAmount: Number(d.fee_amount),
        earlyBirdFeeAmount:
          d.early_bird_fee_amount != null ? Number(d.early_bird_fee_amount) : null,
      })),
      earlyBird,
    );
    if (!quote) return { error: 'This tournament has no paid divisions to reserve.' };

    // The cheapest eligible division also lends its currency to the reservation.
    let currency = 'PHP';
    let bestPerPlayer: number | null = null;
    for (const d of divisions) {
      if (d.status !== 'open' || Number(d.fee_amount) <= 0) continue;
      const q = quoteFee(
        {
          feeAmount: Number(d.fee_amount),
          earlyBirdFeeAmount:
            d.early_bird_fee_amount != null ? Number(d.early_bird_fee_amount) : null,
          earlyBirdStartsAt: earlyBird.startsAt,
          earlyBirdEndsAt: earlyBird.endsAt,
          teamSize: 1,
        },
        new Date(),
      );
      if (bestPerPlayer === null || q.perPlayer < bestPerPlayer) {
        bestPerPlayer = q.perPlayer;
        currency = d.currency;
      }
    }

    const { data: existingRows } = await svc
      .from('tournament_slots')
      .select('id, status')
      .eq('tournament_id', tournamentId)
      .eq('player_id', user.id)
      .is('registration_id', null)
      .order('created_at', { ascending: false })
      .limit(1);
    const existing = ((existingRows ?? []) as { id: string; status: string }[])[0] ?? null;
    if (existing && (existing.status === 'submitted' || existing.status === 'verified')) {
      return { error: 'You already have a reserved slot for this tournament.' };
    }

    const upload = await uploadPaymentProof(
      formData,
      `slots/${tournamentId}/${user.id}-${Date.now()}-${randomSuffix()}`,
    );
    if (!upload.ok) return { error: upload.error };

    const amountDue = quote.perPlayer;
    const amountSubmitted = p.amountSubmitted ?? amountDue;
    const now = new Date().toISOString();
    let slotId: string | null = null;

    if (existing) {
      const { data: updated, error: updErr } = await svc
        .from('tournament_slots')
        .update({
          amount_due: amountDue,
          amount_submitted: amountSubmitted,
          currency,
          method: p.method,
          payer_name: p.payerName || null,
          transaction_reference: p.transactionReference || null,
          proof_storage_path: upload.path,
          status: 'submitted',
          early_bird_applied: quote.earlyBirdApplied,
          submitted_at: now,
          rejection_reason: null,
          notification_sent_at: null,
        })
        .eq('id', existing.id)
        .select('id')
        .maybeSingle();
      if (updErr || !updated) {
        await svc.storage.from(PAYMENT_PROOFS_BUCKET).remove([upload.path]);
        return { error: 'Could not record your payment. Please try again.' };
      }
      slotId = (updated as { id: string }).id;
    } else {
      const { data: inserted, error: insErr } = await svc
        .from('tournament_slots')
        .insert({
          registration_id: null,
          division_id: null,
          tournament_id: tournamentId,
          player_id: user.id,
          status: 'submitted',
          amount_due: amountDue,
          amount_submitted: amountSubmitted,
          currency,
          method: p.method,
          payer_name: p.payerName || null,
          transaction_reference: p.transactionReference || null,
          proof_storage_path: upload.path,
          early_bird_applied: quote.earlyBirdApplied,
          submitted_at: now,
        })
        .select('id')
        .single();
      if (insErr || !inserted) {
        await svc.storage.from(PAYMENT_PROOFS_BUCKET).remove([upload.path]);
        return { error: 'Could not record your payment. Please try again.' };
      }
      slotId = (inserted as { id: string }).id;
    }

    const organizers = await getTournamentOrganizerIds(tournamentId);
    await notifyMany(organizers, {
      type: 'payment_submitted',
      params: { tournamentName: tourn.name },
      link: tourn.slug ? `/tournaments/${tourn.slug}/manage` : '/tournaments',
      entityType: 'tournament',
      entityId: tournamentId,
    });
    await notifyPaymentReceiptUploaded(null, user.id, { slotId: slotId ?? undefined });
    await writeAudit({
      actorId: user.id,
      action: 'slot.reservation_submitted',
      entityType: 'tournament_slot',
      entityId: slotId ?? tournamentId,
      after: { status: 'submitted', amount_due: amountDue },
    });
    await revalTournament(tournamentId);
  } catch {
    return { error: 'Payment submission is temporarily unavailable.' };
  }
  return { ok: true, message: 'Reservation submitted - the organizer will review it.' };
}

/** Issue a short-lived signed URL to a payment proof (§38). Team members / organizers / staff only. */
export async function getProofSignedUrl(
  paymentId: string,
  kind: 'team' | 'slot' = 'team',
): Promise<{ url?: string; error?: string }> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    if (kind === 'slot') {
      const { data: slotRow } = await svc
        .from('tournament_slots')
        .select('proof_storage_path, player_id, tournament_id')
        .eq('id', paymentId)
        .maybeSingle();
      const slot = slotRow as {
        proof_storage_path: string | null;
        player_id: string;
        tournament_id: string;
      } | null;
      if (!slot?.proof_storage_path) return { error: 'No proof on file.' };
      const authorized =
        slot.player_id === user.id ||
        !!(await authorizeOrganizer(user.id, slot.tournament_id, 'manage_payments'));
      if (!authorized) return { error: 'You cannot view this proof.' };
      const { data: signed, error } = await svc.storage
        .from(PAYMENT_PROOFS_BUCKET)
        .createSignedUrl(slot.proof_storage_path, 60);
      if (error || !signed) return { error: 'Could not open the proof.' };
      return { url: signed.signedUrl };
    }

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
// Organizer payment review (§24.4) - verify / reject-resubmit / mark refunded.
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

// ---------------------------------------------------------------------------
// Organizer review of a SLOT (seat or bare reservation) receipt (master_plan §2AO A6). Same
// authorization as the team path (checked by the exported wrapper before dispatching here); the only
// difference is which table is updated and which notification type fires.
// ---------------------------------------------------------------------------
async function loadSlotContext(slotId: string, tournamentId: string) {
  const svc = createServiceClient();
  const { data } = await svc
    .from('tournament_slots')
    .select('id, tournament_id, player_id, registration_id')
    .eq('id', slotId)
    .maybeSingle();
  const slot = data as {
    id: string;
    tournament_id: string;
    player_id: string;
    registration_id: string | null;
  } | null;
  if (!slot || slot.tournament_id !== tournamentId) return null;
  return { svc, slot };
}

async function verifySlotPayment(
  slotId: string,
  tournamentId: string,
  actorId: string,
): Promise<PaymentActionState> {
  const ctx = await loadSlotContext(slotId, tournamentId);
  if (!ctx) return { error: 'Slot payment not found.' };
  const { svc, slot } = ctx;
  try {
    const now = new Date().toISOString();
    await svc
      .from('tournament_slots')
      .update({
        status: 'verified',
        verified_by: actorId,
        verified_at: now,
        rejection_reason: null,
      })
      .eq('id', slotId);
    await writeAudit({
      actorId,
      action: 'slot.verified',
      entityType: 'tournament_slot',
      entityId: slotId,
      after: { status: 'verified' },
    });
    const tm = await getTournamentMini(tournamentId);
    await notify({
      recipientId: slot.player_id,
      type: slot.registration_id ? 'seat_payment_verified' : 'slot_reservation_verified',
      params: { tournamentName: tm.name },
      link: tm.slug ? `/tournaments/${tm.slug}?register=1` : '/tournaments',
      entityType: 'tournament_slot',
      entityId: slotId,
    });
    if (slot.registration_id) await settleRegistration(slot.registration_id, actorId);
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Slot payment verified.' };
}

async function rejectSlotPayment(
  slotId: string,
  tournamentId: string,
  actorId: string,
  reason: string,
): Promise<PaymentActionState> {
  if (!reason.trim()) return { error: 'A rejection reason is required (§24.4).' };
  const ctx = await loadSlotContext(slotId, tournamentId);
  if (!ctx) return { error: 'Slot payment not found.' };
  const { svc, slot } = ctx;
  try {
    await svc
      .from('tournament_slots')
      .update({ status: 'rejected', rejection_reason: reason.trim() })
      .eq('id', slotId);
    await writeAudit({
      actorId,
      action: 'slot.rejected',
      entityType: 'tournament_slot',
      entityId: slotId,
      after: { status: 'rejected' },
      reason: reason.trim(),
    });
    const tm = await getTournamentMini(tournamentId);
    const link = tm.slug ? `/tournaments/${tm.slug}?register=1` : '/tournaments';
    await notify({
      recipientId: slot.player_id,
      type: slot.registration_id ? 'payment_rejected' : 'slot_reservation_rejected',
      params: { tournamentName: tm.name, reason: reason.trim() },
      link,
      entityType: 'tournament_slot',
      entityId: slotId,
    });
    if (slot.registration_id) await settleRegistration(slot.registration_id, actorId);
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Slot payment rejected - the player can resubmit.' };
}

async function refundSlotPayment(
  slotId: string,
  tournamentId: string,
  actorId: string,
  reason: string,
): Promise<PaymentActionState> {
  const ctx = await loadSlotContext(slotId, tournamentId);
  if (!ctx) return { error: 'Slot payment not found.' };
  const { svc, slot } = ctx;
  try {
    await svc.from('tournament_slots').update({ status: 'refunded' }).eq('id', slotId);
    await writeAudit({
      actorId,
      action: 'slot.refunded',
      entityType: 'tournament_slot',
      entityId: slotId,
      after: { status: 'refunded' },
      reason: reason.trim() || null,
    });
    if (slot.registration_id) await settleRegistration(slot.registration_id, actorId);
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Marked refunded.' };
}

/**
 * Verify a team-payment or seat/reservation receipt (master_plan §2AO A6). For `kind: 'team'` this no
 * longer confirms the registration directly - it updates the payment row, then hands the decision to
 * `settleRegistration` (a verified team receipt is always fully paid, so it confirms in the same one
 * step Hermosa's existing rows already rely on; the confirm event/notification is emitted there, not
 * duplicated here).
 */
export async function verifyPayment(
  paymentId: string,
  tournamentId: string,
  kind: 'team' | 'slot' = 'team',
): Promise<PaymentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'manage_payments'))) {
    return { error: 'You do not have permission to review payments.' };
  }
  if (kind === 'slot') return verifySlotPayment(paymentId, tournamentId, user.id);

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
    await writeAudit({
      actorId: user.id,
      action: 'payment.verified',
      entityType: 'payment',
      entityId: paymentId,
      after: { status: 'verified' },
    });
    const settled = await settleRegistration(payment.registration_id, user.id);
    await revalTournament(tournamentId);
    // A waitlisted entry stays waitlisted even with money in hand - say only what actually happened.
    if (!settled?.fullyPaid || registration.status === 'waitlisted') {
      return { ok: true, message: 'Payment verified.' };
    }
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Payment verified - registration confirmed.' };
}

/**
 * Reject a team-payment or seat/reservation receipt. For `kind: 'team'` the registration's status is
 * now decided by `settleRegistration` (it reverts to `payment_pending` with a re-armed hold when no
 * other receipt is on file) rather than being set here directly.
 */
export async function rejectPayment(
  paymentId: string,
  tournamentId: string,
  reason: string,
  kind: 'team' | 'slot' = 'team',
): Promise<PaymentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'manage_payments'))) {
    return { error: 'You do not have permission to review payments.' };
  }
  if (kind === 'slot') return rejectSlotPayment(paymentId, tournamentId, user.id, reason);
  if (!reason.trim()) return { error: 'A rejection reason is required (§24.4).' };
  const ctx = await loadPaymentContext(paymentId);
  if (!ctx) return { error: 'Payment not found.' };
  const { svc, payment, registration } = ctx;
  try {
    await svc
      .from('payments')
      .update({ status: 'rejected', rejection_reason: reason.trim() })
      .eq('id', paymentId);
    await svc.from('registration_events').insert({
      registration_id: payment.registration_id,
      actor_id: user.id,
      event_type: 'payment_rejected',
      from_status: registration.status,
      to_status: registration.status,
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
    await notifyRegistrationTeam(
      payment.registration_id,
      tournamentId,
      'payment_rejected',
      reason.trim(),
    );
    await settleRegistration(payment.registration_id, user.id);
    await revalTournament(tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Payment rejected - the team can resubmit.' };
}

export async function markRefunded(
  paymentId: string,
  tournamentId: string,
  reason: string,
  kind: 'team' | 'slot' = 'team',
): Promise<PaymentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'manage_payments'))) {
    return { error: 'You do not have permission to review payments.' };
  }
  if (kind === 'slot') return refundSlotPayment(paymentId, tournamentId, user.id, reason);
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

// ---------------------------------------------------------------------------
// "Send a test email" for the payment receipt notification setting (§2AK)
// ---------------------------------------------------------------------------
export async function sendPaymentNotificationTest(
  tournamentId: string,
): Promise<{ ok?: boolean; error?: string; message?: string }> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'manage_payments'))) {
    return { error: 'You do not have permission to review payments.' };
  }
  if (!emailChannelEnabled()) {
    return { error: 'Email delivery is not configured on this server yet.' };
  }
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from('tournaments')
      .select('name, slug, payment_notification_email')
      .eq('id', tournamentId)
      .maybeSingle();
    const t = data as {
      name: string;
      slug: string | null;
      payment_notification_email: string | null;
    } | null;
    if (!t) return { error: 'Tournament not found.' };
    const to = t.payment_notification_email;
    if (!to) return { error: 'Save an email address first.' };

    const sample: PaymentNotificationInput = {
      kind: 'team',
      tournamentName: t.name,
      tournamentSlug: t.slug,
      divisionName: "Men's Doubles - Beginner (sample)",
      submittedByEmail: 'player1@example.com',
      teamName: 'Jasper/Tane',
      players: [
        { fullName: 'Sample Player One', email: 'player1@example.com' },
        { fullName: 'Sample Player Two', email: 'player2@example.com' },
      ],
      amountSubmitted: 1000,
      currency: 'PHP',
      method: 'GCash',
      payerName: 'Sample Player One',
      transactionReference: 'TEST-000000',
      receiptUrl: null,
      receiptExpiresDays: 7,
      manageUrl: `${publicEnv.siteUrl}/tournaments/${t.slug ?? ''}/manage`,
      // §2AL: the test email also previews the live paid-teams standing for this tournament.
      summary: await gatherPaymentSummary(tournamentId),
    };
    const { subject, text, html } = buildPaymentNotificationEmail(sample);
    const ok = await sendEmail({
      to,
      subject: `[TEST] ${subject}`,
      text,
      html,
      idempotencyKey: `payment-notify-test:${tournamentId}:${Date.now()}`,
    });
    await writeAudit({
      actorId: user.id,
      action: 'payment.notification_test',
      entityType: 'tournament',
      entityId: tournamentId,
      after: { to, subject: `[TEST] ${subject}` },
    });
    if (!ok) return { error: 'Could not send the test email. Please try again.' };
    return { ok: true, message: `Test email sent to ${to}.` };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
}

// ---------------------------------------------------------------------------
// Backfill past receipts (master_plan §2AL/§2AO A6) - "email every uploaded receipt (team OR slot)
// not yet emailed".
// ---------------------------------------------------------------------------

/** §2AL/§2AO A6: how many uploaded receipts (team payments AND slots) for this tournament have NOT
 *  been emailed yet. */
export async function getPendingReceiptNotificationCount(tournamentId: string): Promise<number> {
  const { payments, slots } = await getReceiptsToNotify(tournamentId);
  return payments.length + slots.length;
}

/** Resolve who to credit as the sender of a backfilled receipt: the actor on its most recent
 *  `payment_submitted` event, falling back to the team's first member by `member_order` (§2AL). */
async function resolveReceiptActorId(
  registrationId: string,
  teamId: string,
): Promise<string | null> {
  const svc = createServiceClient();
  const { data: eventRow } = await svc
    .from('registration_events')
    .select('actor_id')
    .eq('registration_id', registrationId)
    .eq('event_type', 'payment_submitted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const actorId = (eventRow as { actor_id: string | null } | null)?.actor_id;
  if (actorId) return actorId;

  const { data: memberRow } = await svc
    .from('team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .order('member_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (memberRow as { player_id: string } | null)?.player_id ?? null;
}

/** A tiny inline concurrency-limited pool - no dependency, just `limit` workers pulling from a shared
 *  cursor until the queue is drained (§2AL: keep 28 sends well inside a 60s route budget). */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  async function pull(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      const item = items[i] as T;
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, pull));
}

/** §2AL: email the receipt notification for every paid receipt not yet emailed. Organizer manage_payments
 *  only. Concurrency-limited, idempotent (stamps notification_sent_at), audited. */
export async function sendAllPaymentReceipts(
  tournamentId: string,
): Promise<{ ok?: boolean; error?: string; message?: string; sent?: number; failed?: number }> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'manage_payments'))) {
    return { error: 'You cannot manage this tournament.' };
  }
  if (!emailChannelEnabled()) {
    return { error: 'Email delivery is not configured on this server yet.' };
  }

  let to: string | null = null;
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from('tournaments')
      .select('payment_notification_email')
      .eq('id', tournamentId)
      .maybeSingle();
    to =
      (data as { payment_notification_email: string | null } | null)?.payment_notification_email ??
      null;
  } catch {
    to = null;
  }
  if (!to) return { error: 'Save an email address first.' };

  try {
    const { payments: pendingPayments, slots: pendingSlots } =
      await getReceiptsToNotify(tournamentId);
    const total = pendingPayments.length + pendingSlots.length;
    if (total === 0) {
      return {
        ok: true,
        sent: 0,
        failed: 0,
        message: 'All uploaded receipts have already been emailed.',
      };
    }

    let sent = 0;
    let failed = 0;
    await runWithConcurrency(pendingPayments, 3, async (reg) => {
      const actorId = await resolveReceiptActorId(reg.registrationId, reg.teamId);
      if (!actorId) {
        failed += 1;
        return;
      }
      const result = await notifyPaymentReceiptUploaded(reg.registrationId, actorId);
      if (result === 'sent') sent += 1;
      else failed += 1;
    });
    // §2AO A6: the slot's own player is the natural "sender" credit - unlike a team payment, a slot
    // receipt has no other member who might have submitted it on their behalf.
    await runWithConcurrency(pendingSlots, 3, async (slot) => {
      const result = await notifyPaymentReceiptUploaded(slot.registrationId, slot.playerId, {
        slotId: slot.slotId,
      });
      if (result === 'sent') sent += 1;
      else failed += 1;
    });

    await writeAudit({
      actorId: user.id,
      action: 'payment.notifications_backfill',
      entityType: 'tournament',
      entityId: tournamentId,
      after: { sent, failed, total },
    });

    const message =
      `Emailed ${sent} receipt(s) to ${to}.` + (failed > 0 ? ` ${failed} failed.` : '');
    return { ok: true, sent, failed, message };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
}
