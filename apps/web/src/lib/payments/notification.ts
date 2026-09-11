import 'server-only';
import { publicEnv } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/service';
import { PAYMENT_PROOFS_BUCKET } from '@/lib/storage';
import { divisionName } from '@/lib/tournaments/dto';
import { writeAudit } from '@/lib/moderation/audit';
import { sendEmail, escapeHtml } from '@/lib/notifications/email';

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
}

/** Pure builder (unit tested) - the exact subject/text/html shipped for every receipt. */
export function buildPaymentNotificationEmail(input: PaymentNotificationInput): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `Registration payment notification - ${input.tournamentName} - ${input.teamName} - ${input.divisionName}`;

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
  // line per division, ordered by count desc / name asc (see `gatherPaymentSummary`).
  const summaryTextLines = input.summary
    ? [
        '',
        `Paid teams so far: ${input.summary.total}`,
        ...input.summary.perDivision.map((d) => `  ${d.division}: ${d.count}`),
      ]
    : [];

  const text = [
    `Tournament: ${input.tournamentName}`,
    `Submitted by: ${input.submittedByEmail ?? '-'}`,
    `Team: ${input.teamName || '-'}`,
    `Category: ${input.divisionName}`,
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
        .join('')}</table>`
    : '';

  const html = `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<h2 style="font-size:16px;margin:0 0 12px;">Registration payment notification</h2>
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
}

/** §2AL: live paid-teams standing for a tournament (total + per-division), from
 *  `getPaidReceiptRegistrations`. Ordered by count desc, then division name asc. */
export async function gatherPaymentSummary(tournamentId: string): Promise<PaymentSummary> {
  const paid = await getPaidReceiptRegistrations(tournamentId);
  if (paid.length === 0) return { total: 0, perDivision: [] };

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

  return { total: paid.length, perDivision };
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

/**
 * Best-effort: called right after `submitPayment` records a receipt. Never throws. Returns
 * 'skipped' when the tournament has no notification address configured (no audit for that case,
 * exactly like an organizer who never opted in), 'sent'/'failed' otherwise - both audited.
 */
export async function notifyPaymentReceiptUploaded(
  registrationId: string,
  actorUserId: string,
): Promise<'sent' | 'skipped' | 'failed'> {
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
