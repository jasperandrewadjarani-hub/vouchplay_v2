import 'server-only';
import { summarizeEntryPayment, type EntryPaymentInput } from '@vouchplay/core';
import { publicEnv } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/service';
import { PAYMENT_PROOFS_BUCKET } from '@/lib/storage';
import { divisionName } from '@/lib/tournaments/dto';
import { writeAudit } from '@/lib/moderation/audit';
import { sendEmail, escapeHtml } from '@/lib/notifications/email';
import { getSlotsByRegistration, getOrganizerSlots } from './slots';

/**
 * Payment receipt notification email to the bank handler (master_plan §2AK). Every uploaded payment
 * receipt sends one "Registration payment notification" to the organizer-designated
 * `tournaments.payment_notification_email` (migration 0038; null/blank = off). Best-effort: never
 * blocks or fails the player's `submitPayment` action, and every send (or skip) is auditable.
 */

const RECEIPT_EXPIRES_DAYS = 7;

export interface PaymentNotificationPlayer {
  fullName: string;
  email: string | null;
}

export interface PaymentNotificationInput {
  /** §2AO A6: which of the three receipt shapes this is - changes only the subject/heading. */
  kind: 'team' | 'seat' | 'reservation';
  tournamentName: string;
  tournamentSlug: string | null;
  divisionName: string;
  submittedByEmail: string | null;
  /** Nicknames joined "A/B" (fallback to first name if a nickname is blank). */
  teamName: string;
  players: PaymentNotificationPlayer[];
  amountSubmitted: number | null;
  currency: string;
  method: string | null;
  payerName: string | null;
  transactionReference: string | null;
  /** Short-lived signed URL to the receipt, or null when there is no proof on file. */
  receiptUrl: string | null;
  receiptExpiresDays: number;
  manageUrl: string;
  /** §2AL: live paid-teams standing, appended below the payment details when present. */
  summary?: PaymentSummary;
  /** e.g. "Seat 1 of 2 - Maria Santos" (kind 'seat' only, §2AO A6). */
  seatLabel?: string;
}

/** Pure builder (unit tested) - the exact subject/text/html shipped for every receipt. */
export function buildPaymentNotificationEmail(input: PaymentNotificationInput): {
  subject: string;
  text: string;
  html: string;
} {
  const player = input.players[0]?.fullName || input.payerName || 'Player';
  const subject =
    input.kind === 'seat'
      ? `Seat payment - ${player} (${input.teamName || 'team'}, ${input.divisionName})`
      : input.kind === 'reservation'
        ? `Slot reservation - ${player} (no division yet)`
        : `Registration payment notification - ${input.tournamentName} - ${input.teamName} - ${input.divisionName}`;

  const amountText =
    input.amountSubmitted != null ? `${input.currency} ${input.amountSubmitted.toFixed(2)}` : '-';
  const playerTextLines = input.players.map(
    (p, i) => `Player ${i + 1}: ${p.fullName || '-'} <${p.email ?? '-'}>`,
  );
  const receiptTextLine = input.receiptUrl
    ? `Receipt: ${input.receiptUrl} (link works for ${input.receiptExpiresDays} days)`
    : 'Receipt: -';

  // §2AL: the running paid-teams standing, appended below the payment details on every email that
  // carries one (both the live send and the backfill) - a blank line, the total, then one indented
  // line per division, ordered by count desc / name asc (see `gatherPaymentSummary`), then §2AO A6's
  // fully-paid-teams count and (when cheap to compute) the pending seat-receipts count.
  const summaryTextLines = input.summary
    ? [
        '',
        `Paid teams so far: ${input.summary.total}`,
        ...input.summary.perDivision.map((d) => `  ${d.division}: ${d.count}`),
        `Fully paid teams: ${input.summary.fullyPaidTeams}`,
        ...(input.summary.seatReceipts != null
          ? [`Seat receipts pending: ${input.summary.seatReceipts}`]
          : []),
      ]
    : [];

  const text = [
    `Tournament: ${input.tournamentName}`,
    `Submitted by: ${input.submittedByEmail ?? '-'}`,
    `Team: ${input.teamName || '-'}`,
    `Category: ${input.divisionName}`,
    ...(input.seatLabel ? [`Seat: ${input.seatLabel}`] : []),
    ...playerTextLines,
    `Amount submitted: ${amountText}`,
    `Mode of payment: ${input.method ?? '-'}`,
    ...(input.payerName ? [`Payer name: ${input.payerName}`] : []),
    `Payment reference / transaction no.: ${input.transactionReference ?? '-'}`,
    receiptTextLine,
    `Open in Manage: ${input.manageUrl}`,
    ...summaryTextLines,
  ].join('\n');

  const htmlRow = (label: string, value: string) =>
    `<tr><td style="padding:6px 10px;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 10px;font-size:14px;color:#111827;">${value}</td></tr>`;

  const htmlRows = [
    htmlRow('Tournament', `<strong>${escapeHtml(input.tournamentName)}</strong>`),
    htmlRow('Submitted by', escapeHtml(input.submittedByEmail ?? '-')),
    htmlRow('Team', `<strong>${escapeHtml(input.teamName || '-')}</strong>`),
    htmlRow('Category', escapeHtml(input.divisionName)),
    ...(input.seatLabel ? [htmlRow('Seat', escapeHtml(input.seatLabel))] : []),
    ...input.players.map((p, i) =>
      htmlRow(
        `Player ${i + 1}`,
        `${escapeHtml(p.fullName || '-')} &lt;${escapeHtml(p.email ?? '-')}&gt;`,
      ),
    ),
    htmlRow('Amount submitted', `<strong>${escapeHtml(amountText)}</strong>`),
    htmlRow('Mode of payment', escapeHtml(input.method ?? '-')),
    ...(input.payerName ? [htmlRow('Payer name', escapeHtml(input.payerName))] : []),
    htmlRow('Payment reference / transaction no.', escapeHtml(input.transactionReference ?? '-')),
  ].join('');

  const receiptButtonHtml = input.receiptUrl
    ? `<a href="${escapeHtml(input.receiptUrl)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px;">View receipt</a><p style="margin:8px 0 0;font-size:12px;color:#6b7280;">Link works for ${input.receiptExpiresDays} days.</p>`
    : `<p style="margin:0;font-size:13px;color:#6b7280;">No receipt link available.</p>`;

  // §2AL: a light separator, a heading naming the total, then a tight division · count list - kept
  // compact and mobile-friendly, matching the inline-style aesthetic above. Every division name is
  // escaped like every other field in this email.
  const summaryHtml = input.summary
    ? `<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">
<h3 style="font-size:14px;margin:0 0 8px;">Paid teams so far — ${input.summary.total}</h3>
<table role="presentation" style="width:100%;border-collapse:collapse;">${input.summary.perDivision
        .map(
          (d) =>
            `<tr><td style="padding:3px 0;font-size:13px;color:#111827;">${escapeHtml(d.division)}</td><td style="padding:3px 0;font-size:13px;color:#6b7280;text-align:right;white-space:nowrap;">${d.count}</td></tr>`,
        )
        .join('')}</table>
<p style="margin:8px 0 0;font-size:13px;color:#111827;">Fully paid teams: <strong>${input.summary.fullyPaidTeams}</strong></p>${
        input.summary.seatReceipts != null
          ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Seat receipts pending: ${input.summary.seatReceipts}</p>`
          : ''
      }`
    : '';

  const heading =
    input.kind === 'seat'
      ? 'Seat payment notification'
      : input.kind === 'reservation'
        ? 'Slot reservation notification'
        : 'Registration payment notification';

  const html = `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<h2 style="font-size:16px;margin:0 0 12px;">${heading}</h2>
<table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">${htmlRows}</table>
<div style="margin-top:16px;">${receiptButtonHtml}</div>
<p style="margin:16px 0 0;"><a href="${escapeHtml(input.manageUrl)}" style="color:#4f46e5;font-weight:600;font-size:14px;text-decoration:none;">Open in Manage &rarr;</a></p>
${summaryHtml}
</div>`;

  return { subject, text, html };
}

type DivisionNameRow = Parameters<typeof divisionName>[0];

// ---------------------------------------------------------------------------
// §2AL: the shared "paid / receipt-uploaded" definition - one definition, used by both the running
// summary below and the backfill (`sendAllPaymentReceipts` in lib/actions/payment.ts) so the two
// never drift apart.
// ---------------------------------------------------------------------------
export interface PaidReceiptRegistration {
  registrationId: string;
  divisionId: string;
  teamId: string;
}

/** §2AL: an ACTIVE registration (status not withdrawn/rejected) whose payment has a stored proof and
 *  status 'submitted' or 'verified'. */
export async function getPaidReceiptRegistrations(
  tournamentId: string,
): Promise<PaidReceiptRegistration[]> {
  const svc = createServiceClient();

  // Bounded page of 1000, like the other organizer registration reads (registration-queries.ts) - a
  // tournament genuinely holding more entries than that is not a case this dashboard handles today.
  const { data: regRows } = await svc
    .from('registrations')
    .select('id, division_id, team_id, status')
    .eq('tournament_id', tournamentId)
    .limit(1000);
  const regs = (regRows ?? []) as {
    id: string;
    division_id: string;
    team_id: string;
    status: string;
  }[];
  const active = regs.filter((r) => r.status !== 'withdrawn' && r.status !== 'rejected');
  if (active.length === 0) return [];

  const { data: payRows } = await svc
    .from('payments')
    .select('registration_id, status, proof_storage_path')
    .in(
      'registration_id',
      active.map((r) => r.id),
    )
    .limit(1000);
  const payByReg = new Map(
    (
      (payRows ?? []) as {
        registration_id: string;
        status: string;
        proof_storage_path: string | null;
      }[]
    ).map((p) => [p.registration_id, p]),
  );

  return active
    .filter((r) => {
      const pay = payByReg.get(r.id);
      return !!pay?.proof_storage_path && (pay.status === 'submitted' || pay.status === 'verified');
    })
    .map((r) => ({ registrationId: r.id, divisionId: r.division_id, teamId: r.team_id }));
}

export interface PaymentSummary {
  total: number;
  perDivision: { division: string; count: number }[];
  /** §2AO A6: active registrations whose `summarizeRegistration().fullyPaid` is true - team receipt
   *  OR every seat verified. Computed in one batched pass (never N+1). */
  fullyPaidTeams: number;
  /** §2AO A6: attached seat rows currently submitted or verified, when cheap to compute. */
  seatReceipts?: number;
}

/**
 * §2AO A2/A6: every active (non-terminal) registration's fully-paid verdict, in ONE batched pass -
 * the same `summarizeEntryPayment` (packages/core) the player card and the organizer list use, but
 * fed from bulk reads instead of one `summarizeRegistration` round-trip per registration.
 */
async function countFullyPaidTeams(tournamentId: string): Promise<number> {
  try {
    const svc = createServiceClient();
    const { data: regRows } = await svc
      .from('registrations')
      .select('id, division_id, team_id, status')
      .eq('tournament_id', tournamentId)
      .limit(1000);
    const active = (
      (regRows ?? []) as {
        id: string;
        division_id: string;
        team_id: string;
        status: string;
      }[]
    ).filter((r) => !['withdrawn', 'cancelled', 'rejected'].includes(r.status));
    if (active.length === 0) return 0;

    const divisionIds = Array.from(new Set(active.map((r) => r.division_id)));
    const teamIds = Array.from(new Set(active.map((r) => r.team_id)));
    const registrationIds = active.map((r) => r.id);

    const [{ data: divRows }, { data: memberRows }, { data: payRows }, slotsByReg] =
      await Promise.all([
        svc.from('divisions').select('id, fee_amount, team_size').in('id', divisionIds),
        svc.from('team_members').select('team_id, player_id').in('team_id', teamIds),
        svc
          .from('payments')
          .select('registration_id, status')
          .in('registration_id', registrationIds),
        getSlotsByRegistration(registrationIds),
      ]);

    const divisionById = new Map(
      ((divRows ?? []) as { id: string; fee_amount: number; team_size: number }[]).map((d) => [
        d.id,
        d,
      ]),
    );
    const membersByTeam = new Map<string, string[]>();
    for (const m of (memberRows ?? []) as { team_id: string; player_id: string }[]) {
      const list = membersByTeam.get(m.team_id) ?? [];
      list.push(m.player_id);
      membersByTeam.set(m.team_id, list);
    }
    const paymentByReg = new Map(
      ((payRows ?? []) as { registration_id: string; status: string }[]).map((p) => [
        p.registration_id,
        p,
      ]),
    );

    let count = 0;
    for (const r of active) {
      const division = divisionById.get(r.division_id);
      if (!division) continue;
      const slots = (slotsByReg.get(r.id) ?? []).map((s) => ({
        playerId: s.player_id,
        status: s.status,
        amountDue: Number(s.amount_due),
        amountSubmitted: s.amount_submitted != null ? Number(s.amount_submitted) : null,
        createdAt: s.created_at,
      }));
      const input: EntryPaymentInput = {
        teamSize: division.team_size,
        memberIds: membersByTeam.get(r.team_id) ?? [],
        teamPayment: paymentByReg.has(r.id) ? { status: paymentByReg.get(r.id)!.status } : null,
        slots,
        feeOwed: Number(division.fee_amount) > 0,
      };
      if (summarizeEntryPayment(input).fullyPaid) count++;
    }
    return count;
  } catch {
    return 0;
  }
}

/** §2AO A6: attached slot rows currently submitted or verified - a cheap one-read count. */
async function countSeatReceipts(tournamentId: string): Promise<number | undefined> {
  try {
    const slots = await getOrganizerSlots(tournamentId);
    return slots.filter(
      (s) => s.registration_id && (s.status === 'submitted' || s.status === 'verified'),
    ).length;
  } catch {
    return undefined;
  }
}

/** §2AL/§2AO A6: live paid-teams standing for a tournament (total + per-division receipts, fully-paid
 *  teams, and pending seat receipts). Ordered by count desc, then division name asc. */
export async function gatherPaymentSummary(tournamentId: string): Promise<PaymentSummary> {
  const [paid, fullyPaidTeams, seatReceipts] = await Promise.all([
    getPaidReceiptRegistrations(tournamentId),
    countFullyPaidTeams(tournamentId),
    countSeatReceipts(tournamentId),
  ]);
  if (paid.length === 0) return { total: 0, perDivision: [], fullyPaidTeams, seatReceipts };

  const svc = createServiceClient();
  const divisionIds = Array.from(new Set(paid.map((r) => r.divisionId)));
  const { data: divRows } = await svc
    .from('divisions')
    .select(
      'id, name_override, skill_policy, minimum_skill, maximum_skill, format, sex_classification, minimum_age, maximum_age',
    )
    .in('id', divisionIds);
  const nameByDivisionId = new Map(
    ((divRows ?? []) as ({ id: string } & DivisionNameRow)[]).map((d) => [d.id, divisionName(d)]),
  );

  const countByLabel = new Map<string, number>();
  for (const r of paid) {
    const label = nameByDivisionId.get(r.divisionId) ?? 'Division';
    countByLabel.set(label, (countByLabel.get(label) ?? 0) + 1);
  }

  const perDivision = Array.from(countByLabel.entries())
    .map(([division, count]) => ({ division, count }))
    .sort((a, b) => b.count - a.count || a.division.localeCompare(b.division));

  return { total: paid.length, perDivision, fullyPaidTeams, seatReceipts };
}

/** Shared by the real send and the organizer's "send a test email" button context lookup. */
export async function buildPaymentNotificationForRegistration(
  registrationId: string,
  actorUserId: string,
): Promise<PaymentNotificationInput | null> {
  const svc = createServiceClient();

  const { data: regRow } = await svc
    .from('registrations')
    .select('id, tournament_id, division_id, team_id, status')
    .eq('id', registrationId)
    .maybeSingle();
  const reg = regRow as {
    id: string;
    tournament_id: string;
    division_id: string;
    team_id: string;
    status: string;
  } | null;
  if (!reg) return null;

  const [{ data: payRow }, { data: tournamentRow }, { data: divisionRow }] = await Promise.all([
    svc
      .from('payments')
      .select(
        'amount_submitted, currency, method, payer_name, transaction_reference, proof_storage_path, submitted_at',
      )
      .eq('registration_id', registrationId)
      .maybeSingle(),
    svc
      .from('tournaments')
      .select('name, slug, payment_notification_email')
      .eq('id', reg.tournament_id)
      .maybeSingle(),
    svc
      .from('divisions')
      .select(
        'name_override, skill_policy, minimum_skill, maximum_skill, format, sex_classification, minimum_age, maximum_age',
      )
      .eq('id', reg.division_id)
      .maybeSingle(),
  ]);

  const payment = payRow as {
    amount_submitted: number | null;
    currency: string;
    method: string | null;
    payer_name: string | null;
    transaction_reference: string | null;
    proof_storage_path: string | null;
    submitted_at: string | null;
  } | null;
  const tournament = tournamentRow as {
    name: string;
    slug: string | null;
    payment_notification_email: string | null;
  } | null;
  if (!tournament) return null;
  const category = divisionRow ? divisionName(divisionRow as DivisionNameRow) : 'Division';

  const { data: memberRows } = await svc
    .from('team_members')
    .select('player_id, member_order')
    .eq('team_id', reg.team_id)
    .order('member_order');
  const members = (memberRows ?? []) as { player_id: string; member_order: number }[];

  const { data: profileRows } = await svc
    .from('profiles')
    .select('id, first_name, last_name, nickname')
    .in(
      'id',
      members.map((m) => m.player_id),
    );
  const profiles = new Map(
    (
      (profileRows ?? []) as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        nickname: string | null;
      }[]
    ).map((p) => [p.id, p]),
  );

  // Registrant/actor first when they are a member, then the rest in member order (§2AK).
  const orderedIds = [
    ...members.filter((m) => m.player_id === actorUserId).map((m) => m.player_id),
    ...members.filter((m) => m.player_id !== actorUserId).map((m) => m.player_id),
  ];

  const emailById = new Map<string, string | null>();
  await Promise.all(
    Array.from(new Set([...orderedIds, actorUserId])).map(async (id) => {
      try {
        const { data } = await svc.auth.admin.getUserById(id);
        emailById.set(id, data?.user?.email ?? null);
      } catch {
        emailById.set(id, null);
      }
    }),
  );

  const players: PaymentNotificationPlayer[] = orderedIds.map((id) => {
    const p = profiles.get(id);
    const fullName =
      [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() ||
      p?.nickname ||
      'VouchPlay player';
    return { fullName, email: emailById.get(id) ?? null };
  });
  const teamName = orderedIds
    .map((id) => {
      const p = profiles.get(id);
      return p?.nickname?.trim() || p?.first_name?.trim() || 'Player';
    })
    .join('/');

  let receiptUrl: string | null = null;
  if (payment?.proof_storage_path) {
    const { data: signed } = await svc.storage
      .from(PAYMENT_PROOFS_BUCKET)
      .createSignedUrl(payment.proof_storage_path, RECEIPT_EXPIRES_DAYS * 24 * 3600);
    receiptUrl = signed?.signedUrl ?? null;
  }

  return {
    kind: 'team',
    tournamentName: tournament.name,
    tournamentSlug: tournament.slug,
    divisionName: category,
    submittedByEmail: emailById.get(actorUserId) ?? null,
    teamName,
    players,
    amountSubmitted: payment?.amount_submitted != null ? Number(payment.amount_submitted) : null,
    currency: payment?.currency ?? 'PHP',
    method: payment?.method ?? null,
    payerName: payment?.payer_name ?? null,
    transactionReference: payment?.transaction_reference ?? null,
    receiptUrl,
    receiptExpiresDays: RECEIPT_EXPIRES_DAYS,
    manageUrl: `${publicEnv.siteUrl}/tournaments/${tournament.slug ?? ''}/manage`,
    // §2AL: one extra bounded read set so every live send carries the current standing.
    summary: await gatherPaymentSummary(reg.tournament_id),
  };
}

// ---------------------------------------------------------------------------
// §2AO A6: the backfill/count now covers BOTH team-payment rows and tournament_slots rows, so the
// organizer's "receipts not yet emailed" count and the "send all" button never miss a seat/reservation
// receipt.
// ---------------------------------------------------------------------------
export interface PendingSlotReceipt {
  slotId: string;
  /** Null for a bare (no-division-yet) reservation. */
  registrationId: string | null;
  playerId: string;
}

async function getPendingTeamReceipts(tournamentId: string): Promise<PaidReceiptRegistration[]> {
  const paid = await getPaidReceiptRegistrations(tournamentId);
  if (paid.length === 0) return [];
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('payments')
      .select('registration_id, notification_sent_at')
      .in(
        'registration_id',
        paid.map((r) => r.registrationId),
      )
      .limit(1000);
    if (error) throw error;
    const sentAtByReg = new Map(
      ((data ?? []) as { registration_id: string; notification_sent_at: string | null }[]).map(
        (p) => [p.registration_id, p.notification_sent_at],
      ),
    );
    return paid.filter((r) => !sentAtByReg.get(r.registrationId));
  } catch {
    return [];
  }
}

async function getPendingSlotReceipts(tournamentId: string): Promise<PendingSlotReceipt[]> {
  try {
    const slots = await getOrganizerSlots(tournamentId);
    return slots
      .filter(
        (s) =>
          (s.status === 'submitted' || s.status === 'verified') &&
          !s.notification_sent_at &&
          s.proof_storage_path,
      )
      .map((s) => ({ slotId: s.id, registrationId: s.registration_id, playerId: s.player_id }));
  } catch {
    return [];
  }
}

/** §2AO A6: every receipt (team payment AND slot) for a tournament not yet emailed. Shared by the
 *  pending-count badge and the "send all" backfill so the two can never disagree. */
export async function getReceiptsToNotify(
  tournamentId: string,
): Promise<{ payments: PaidReceiptRegistration[]; slots: PendingSlotReceipt[] }> {
  const [payments, slots] = await Promise.all([
    getPendingTeamReceipts(tournamentId),
    getPendingSlotReceipts(tournamentId),
  ]);
  return { payments, slots };
}

/**
 * §2AO A6: build + send the receipt notification for one `tournament_slots` row - an attached seat
 * (kind 'seat') or a bare reservation (kind 'reservation'). Mirrors
 * `buildPaymentNotificationForRegistration` + the send/stamp/audit steps of
 * `notifyPaymentReceiptUploaded` below, but reads from `tournament_slots` instead of `payments` and
 * stamps `tournament_slots.notification_sent_at` instead of `payments.notification_sent_at`.
 */
async function notifySlotReceiptUploaded(
  slotId: string,
  registrationId: string | null,
  actorUserId: string,
): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    const svc = createServiceClient();
    const { data: slotRow } = await svc
      .from('tournament_slots')
      .select(
        'id, tournament_id, player_id, registration_id, amount_submitted, currency, method, payer_name, transaction_reference, proof_storage_path, submitted_at',
      )
      .eq('id', slotId)
      .maybeSingle();
    const slot = slotRow as {
      id: string;
      tournament_id: string;
      player_id: string;
      registration_id: string | null;
      amount_submitted: number | null;
      currency: string;
      method: string | null;
      payer_name: string | null;
      transaction_reference: string | null;
      proof_storage_path: string | null;
      submitted_at: string | null;
    } | null;
    if (!slot) return 'failed';

    const { data: tRow } = await svc
      .from('tournaments')
      .select('name, slug, payment_notification_email')
      .eq('id', slot.tournament_id)
      .maybeSingle();
    const tournament = tRow as {
      name: string;
      slug: string | null;
      payment_notification_email: string | null;
    } | null;
    if (!tournament) return 'failed';
    const to = tournament.payment_notification_email;
    if (!to) return 'skipped';

    const { data: playerRow } = await svc
      .from('profiles')
      .select('first_name, last_name, nickname')
      .eq('id', slot.player_id)
      .maybeSingle();
    const p = playerRow as {
      first_name: string | null;
      last_name: string | null;
      nickname: string | null;
    } | null;
    const playerName =
      [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() ||
      p?.nickname ||
      'VouchPlay player';

    let email: string | null = null;
    try {
      const { data } = await svc.auth.admin.getUserById(slot.player_id);
      email = data?.user?.email ?? null;
    } catch {
      email = null;
    }

    let kind: 'seat' | 'reservation' = 'reservation';
    let divisionLabel = 'No division yet';
    let teamLabel = playerName;
    let seatLabel: string | undefined;

    if (registrationId && slot.registration_id === registrationId) {
      kind = 'seat';
      const { data: regRow } = await svc
        .from('registrations')
        .select('team_id, division_id')
        .eq('id', registrationId)
        .maybeSingle();
      const reg = regRow as { team_id: string; division_id: string } | null;
      if (reg) {
        const { data: divRow } = await svc
          .from('divisions')
          .select(
            'name_override, skill_policy, minimum_skill, maximum_skill, format, sex_classification, minimum_age, maximum_age',
          )
          .eq('id', reg.division_id)
          .maybeSingle();
        divisionLabel = divRow ? divisionName(divRow as DivisionNameRow) : 'Division';

        const { data: memberRows } = await svc
          .from('team_members')
          .select('player_id, member_order')
          .eq('team_id', reg.team_id)
          .order('member_order');
        const members = (memberRows ?? []) as { player_id: string; member_order: number }[];
        const seatIndex = members.findIndex((m) => m.player_id === slot.player_id);
        seatLabel = `Seat ${seatIndex >= 0 ? seatIndex + 1 : 1} of ${members.length || 1} - ${playerName}`;

        const { data: memberProfileRows } = members.length
          ? await svc
              .from('profiles')
              .select('id, first_name, nickname')
              .in(
                'id',
                members.map((m) => m.player_id),
              )
          : { data: [] };
        const nameById = new Map(
          (
            (memberProfileRows ?? []) as {
              id: string;
              first_name: string | null;
              nickname: string | null;
            }[]
          ).map((mp) => [mp.id, mp.nickname?.trim() || mp.first_name?.trim() || 'Player']),
        );
        teamLabel = members
          .sort((a, b) => a.member_order - b.member_order)
          .map((m) => nameById.get(m.player_id) ?? 'Player')
          .join('/');
      }
    }

    let receiptUrl: string | null = null;
    if (slot.proof_storage_path) {
      const { data: signed } = await svc.storage
        .from(PAYMENT_PROOFS_BUCKET)
        .createSignedUrl(slot.proof_storage_path, RECEIPT_EXPIRES_DAYS * 24 * 3600);
      receiptUrl = signed?.signedUrl ?? null;
    }

    const input: PaymentNotificationInput = {
      kind,
      tournamentName: tournament.name,
      tournamentSlug: tournament.slug,
      divisionName: divisionLabel,
      submittedByEmail: email,
      teamName: teamLabel,
      players: [{ fullName: playerName, email }],
      amountSubmitted: slot.amount_submitted != null ? Number(slot.amount_submitted) : null,
      currency: slot.currency,
      method: slot.method,
      payerName: slot.payer_name,
      transactionReference: slot.transaction_reference,
      receiptUrl,
      receiptExpiresDays: RECEIPT_EXPIRES_DAYS,
      manageUrl: `${publicEnv.siteUrl}/tournaments/${tournament.slug ?? ''}/manage`,
      seatLabel,
      summary: await gatherPaymentSummary(slot.tournament_id),
    };
    const { subject, text, html } = buildPaymentNotificationEmail(input);

    const ok = await sendEmail({
      to,
      subject,
      html,
      text,
      idempotencyKey: `slot-notify:${slotId}:${slot.submitted_at ?? ''}`,
    });

    if (ok) {
      try {
        await svc
          .from('tournament_slots')
          .update({ notification_sent_at: new Date().toISOString() })
          .eq('id', slotId);
      } catch {
        // Non-fatal: worst case a future backfill re-sends this one receipt.
      }
    }

    await writeAudit({
      actorId: actorUserId,
      action: ok ? 'payment.notification_sent' : 'payment.notification_failed',
      entityType: 'tournament_slot',
      entityId: slotId,
      after: { to, subject },
    });
    return ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Best-effort: called right after a receipt (team payment OR seat/reservation slot) is recorded.
 * Never throws. Returns 'skipped' when the tournament has no notification address configured (no
 * audit for that case, exactly like an organizer who never opted in), 'sent'/'failed' otherwise -
 * both audited. Pass `opts.slotId` for a `tournament_slots` receipt (seat when `registrationId` is
 * given, bare reservation when it is null); omit it for the original team-payment path.
 */
export async function notifyPaymentReceiptUploaded(
  registrationId: string | null,
  actorUserId: string,
  opts?: { slotId?: string },
): Promise<'sent' | 'skipped' | 'failed'> {
  if (opts?.slotId) return notifySlotReceiptUploaded(opts.slotId, registrationId, actorUserId);
  if (!registrationId) return 'failed';
  try {
    const svc = createServiceClient();
    const { data: regRow } = await svc
      .from('registrations')
      .select('tournament_id')
      .eq('id', registrationId)
      .maybeSingle();
    const tournamentId = (regRow as { tournament_id: string } | null)?.tournament_id;
    if (!tournamentId) return 'failed';

    const { data: tRow } = await svc
      .from('tournaments')
      .select('payment_notification_email')
      .eq('id', tournamentId)
      .maybeSingle();
    const to = (tRow as { payment_notification_email: string | null } | null)
      ?.payment_notification_email;
    if (!to) return 'skipped';

    const input = await buildPaymentNotificationForRegistration(registrationId, actorUserId);
    if (!input) return 'failed';
    const { subject, text, html } = buildPaymentNotificationEmail(input);

    const { data: payRow } = await svc
      .from('payments')
      .select('submitted_at')
      .eq('registration_id', registrationId)
      .maybeSingle();
    const submittedAt = (payRow as { submitted_at: string | null } | null)?.submitted_at ?? '';

    const ok = await sendEmail({
      to,
      subject,
      html,
      text,
      idempotencyKey: `payment-notify:${registrationId}:${submittedAt}`,
    });

    // §2AL: stamp the idempotency marker right after a successful send, so a later backfill tap
    // never re-emails this receipt. Best-effort and isolated from the outer try/catch on purpose -
    // a stamp failure must not turn an actually-sent email into a reported 'failed'/unaudited send.
    if (ok) {
      try {
        await svc
          .from('payments')
          .update({ notification_sent_at: new Date().toISOString() })
          .eq('registration_id', registrationId);
      } catch {
        // Non-fatal: worst case a future backfill re-sends this one receipt.
      }
    }

    // Never log the receipt URL itself in the audit trail (§2AK).
    await writeAudit({
      actorId: actorUserId,
      action: ok ? 'payment.notification_sent' : 'payment.notification_failed',
      entityType: 'registration',
      entityId: registrationId,
      after: { to, subject },
    });
    return ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
