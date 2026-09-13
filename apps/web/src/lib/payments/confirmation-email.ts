import 'server-only';
import { formatFee } from '@vouchplay/core';
import { publicEnv } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/service';
import { divisionName } from '@/lib/tournaments/dto';
import { sendEmail, escapeHtml } from '@/lib/notifications/email';

/**
 * Confirmation email (master_plan §2AS D) - "Your slot for {tournament} is confirmed", sent to every
 * CONFIRMED member of a registration once it fully settles (or an organizer confirms a free-division
 * entry directly). Idempotent through `registrations.confirmation_email_sent_at` (migration 0044,
 * extended - still unapplied): every read/write of that column is defensive, degrading to "not yet
 * sent" / "cannot record the stamp" rather than failing the send. `confirmation_email_enabled`
 * (same migration) defaults to true both when the flag is unset AND when the column itself is
 * missing pre-migration - the feature is opt-OUT, not opt-in.
 */

type DivisionNameRow = Parameters<typeof divisionName>[0];

export interface ConfirmationEmailInput {
  tournamentName: string;
  slug: string;
  divisionName: string;
  teamLabel: string;
  /** Preformatted (e.g. `formatFee('PHP', 1500)`), or null when no verified amount is on file. */
  amountVerified: string | null;
  siteUrl: string;
}

const CAVEAT =
  "Your division placement remains subject to the organizers' final skills assessment and you may " +
  'be reclassified to keep play fair. Any cancellation or refund request is subject to the ' +
  "organizers' final decision.";

/** Pure builder (unit-testable) - the exact subject/text/html sent for every confirmation. */
export function buildConfirmationEmail(input: ConfirmationEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `Your slot for ${input.tournamentName} is confirmed`;
  const tournamentUrl = `${input.siteUrl}/tournaments/${input.slug}`;

  const text = [
    `Your slot for ${input.tournamentName} is confirmed.`,
    '',
    `Division: ${input.divisionName}`,
    `Team: ${input.teamLabel || '-'}`,
    `Amount verified: ${input.amountVerified ?? '-'}`,
    '',
    CAVEAT,
    '',
    `View tournament: ${tournamentUrl}`,
  ].join('\n');

  const html = `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<h2 style="font-size:16px;margin:0 0 12px;">Your slot for ${escapeHtml(input.tournamentName)} is confirmed</h2>
<table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
<tr><td style="padding:6px 10px;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;">Division</td><td style="padding:6px 10px;font-size:14px;color:#111827;">${escapeHtml(input.divisionName)}</td></tr>
<tr><td style="padding:6px 10px;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;">Team</td><td style="padding:6px 10px;font-size:14px;color:#111827;">${escapeHtml(input.teamLabel || '-')}</td></tr>
<tr><td style="padding:6px 10px;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;">Amount verified</td><td style="padding:6px 10px;font-size:14px;color:#111827;"><strong>${escapeHtml(input.amountVerified ?? '-')}</strong></td></tr>
</table>
<p style="margin:16px 0 0;"><a href="${escapeHtml(tournamentUrl)}" style="display:inline-block;background:#246beb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px;">View tournament</a></p>
<p style="margin:16px 0 0;font-size:12px;color:#6b7280;">${escapeHtml(CAVEAT)}</p>
</div>`;

  return { subject, text, html };
}

/** Defensive read: `confirmation_email_sent_at` (migration 0044, extended). A missing column or row
 *  degrades to "not sent yet" - the caller sends once for this call and simply cannot record the
 *  stamp afterwards (see the write at the bottom of `sendConfirmationEmailForRegistration`). */
async function alreadyEmailed(registrationId: string): Promise<boolean> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('registrations')
      .select('confirmation_email_sent_at')
      .eq('id', registrationId)
      .maybeSingle();
    if (error) throw error;
    return !!(data as { confirmation_email_sent_at: string | null } | null)
      ?.confirmation_email_sent_at;
  } catch {
    return false;
  }
}

/** Defensive read: `tournaments.confirmation_email_enabled` (migration 0044, extended) - defaults to
 *  true whether the flag is unset OR the column is missing pre-migration. */
async function loadTournamentForConfirmation(
  tournamentId: string,
): Promise<{ name: string; slug: string | null; enabled: boolean } | null> {
  const svc = createServiceClient();
  try {
    const { data, error } = await svc
      .from('tournaments')
      .select('name, slug, confirmation_email_enabled')
      .eq('id', tournamentId)
      .maybeSingle();
    if (error) throw error;
    const t = data as {
      name: string;
      slug: string | null;
      confirmation_email_enabled: boolean | null;
    } | null;
    if (!t) return null;
    return { name: t.name, slug: t.slug, enabled: t.confirmation_email_enabled ?? true };
  } catch {
    // Column not present yet (migration 0044 pending) - re-read without it, still defaulting on.
    try {
      const { data } = await svc
        .from('tournaments')
        .select('name, slug')
        .eq('id', tournamentId)
        .maybeSingle();
      const t = data as { name: string; slug: string | null } | null;
      return t ? { name: t.name, slug: t.slug, enabled: true } : null;
    } catch {
      return null;
    }
  }
}

/** The verified amount to show: the team-scope payment's submitted amount when there is one, else the
 *  sum of this registration's VERIFIED seat slots. Null when neither is on file. */
async function resolveAmountVerified(registrationId: string): Promise<string | null> {
  const svc = createServiceClient();
  try {
    const { data } = await svc
      .from('payments')
      .select('amount_submitted, currency')
      .eq('registration_id', registrationId)
      .maybeSingle();
    const pay = data as { amount_submitted: number | null; currency: string } | null;
    if (pay?.amount_submitted != null) return formatFee(pay.currency, Number(pay.amount_submitted));
  } catch {
    // fall through to seat slots
  }
  try {
    const { data } = await svc
      .from('tournament_slots')
      .select('status, amount_submitted, amount_due, currency')
      .eq('registration_id', registrationId)
      .eq('status', 'verified');
    const rows = (data ?? []) as {
      amount_submitted: number | null;
      amount_due: number;
      currency: string;
    }[];
    if (rows.length === 0) return null;
    const currency = rows[0]!.currency;
    const total = rows.reduce((sum, r) => sum + Number(r.amount_submitted ?? r.amount_due), 0);
    return formatFee(currency, total);
  } catch {
    return null;
  }
}

/**
 * Send the confirmation email for one registration (master_plan §2AS D). Best-effort - never throws,
 * always returns a boolean. Skips when: the registration/division cannot be found, the tournament has
 * opted out (`confirmation_email_enabled` false), the email was already sent (idempotent), or there
 * are no confirmed members. Hooked from `settleRegistration`'s confirmed branch (`lib/payments/slots.ts`)
 * and from `confirmRegistration` (`lib/actions/registration.ts`, free-division organizer confirm).
 */
export async function sendConfirmationEmailForRegistration(
  registrationId: string,
): Promise<boolean> {
  try {
    if (await alreadyEmailed(registrationId)) return false;

    const svc = createServiceClient();
    const { data: regRow } = await svc
      .from('registrations')
      .select('id, tournament_id, division_id, team_id')
      .eq('id', registrationId)
      .maybeSingle();
    const reg = regRow as {
      id: string;
      tournament_id: string;
      division_id: string;
      team_id: string;
    } | null;
    if (!reg) return false;

    const tournament = await loadTournamentForConfirmation(reg.tournament_id);
    if (!tournament || !tournament.enabled) return false;

    const { data: divRow } = await svc
      .from('divisions')
      .select(
        'name_override, skill_policy, minimum_skill, maximum_skill, format, sex_classification, minimum_age, maximum_age',
      )
      .eq('id', reg.division_id)
      .maybeSingle();
    const divLabel = divRow ? divisionName(divRow as DivisionNameRow) : 'Division';

    const { data: memberRows } = await svc
      .from('team_members')
      .select('player_id, member_order, confirmed_at')
      .eq('team_id', reg.team_id)
      .order('member_order', { ascending: true });
    const members = (
      (memberRows ?? []) as {
        player_id: string;
        member_order: number;
        confirmed_at: string | null;
      }[]
    ).filter((m) => m.confirmed_at);
    if (members.length === 0) return false;

    const { data: profileRows } = await svc
      .from('profiles')
      .select('id, first_name, last_name, nickname')
      .in(
        'id',
        members.map((m) => m.player_id),
      );
    const nameById = new Map(
      (
        (profileRows ?? []) as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          nickname: string | null;
        }[]
      ).map((p) => [
        p.id,
        [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.nickname || 'Player',
      ]),
    );
    const teamLabel = members.map((m) => nameById.get(m.player_id) ?? 'Player').join('/');

    const amountVerified = await resolveAmountVerified(registrationId);
    const { subject, text, html } = buildConfirmationEmail({
      tournamentName: tournament.name,
      slug: tournament.slug ?? '',
      divisionName: divLabel,
      teamLabel,
      amountVerified,
      siteUrl: publicEnv.siteUrl,
    });

    let anySent = false;
    await Promise.all(
      members.map(async (m) => {
        try {
          const { data: prefRow } = await svc
            .from('notification_preferences')
            .select('email_enabled')
            .eq('user_id', m.player_id)
            .maybeSingle();
          if (!(prefRow as { email_enabled: boolean } | null)?.email_enabled) return;
          const { data: userRow } = await svc.auth.admin.getUserById(m.player_id);
          const to = userRow?.user?.email;
          if (!to) return;
          const ok = await sendEmail({
            to,
            subject,
            text,
            html,
            idempotencyKey: `confirmation-email:${registrationId}:${m.player_id}`,
          });
          if (ok) anySent = true;
        } catch {
          // one member's send failure must not block the others
        }
      }),
    );

    // Defensive stamp: `confirmation_email_sent_at` (migration 0044, extended). A missing column
    // means this call simply cannot record the stamp - the next call for the same registration will
    // send again, which is the documented trade-off ("send at most once per process call").
    try {
      await svc
        .from('registrations')
        .update({ confirmation_email_sent_at: new Date().toISOString() })
        .eq('id', registrationId);
    } catch {
      // Column not present yet (migration 0044 pending).
    }

    return anySent;
  } catch {
    return false;
  }
}

/** Every CONFIRMED registration for a tournament that has not been emailed yet (§2AS D backfill).
 *  Defensive: a missing `confirmation_email_sent_at` column degrades to "every confirmed registration
 *  is backlog" rather than failing the read. Bounded (1000), same pattern as the other organizer
 *  registration reads. */
async function getConfirmationEmailBacklogIds(tournamentId: string): Promise<string[]> {
  const svc = createServiceClient();
  try {
    const { data, error } = await svc
      .from('registrations')
      .select('id, confirmation_email_sent_at')
      .eq('tournament_id', tournamentId)
      .eq('status', 'confirmed')
      .limit(1000);
    if (error) throw error;
    return ((data ?? []) as { id: string; confirmation_email_sent_at: string | null }[])
      .filter((r) => !r.confirmation_email_sent_at)
      .map((r) => r.id);
  } catch {
    try {
      const { data } = await svc
        .from('registrations')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('status', 'confirmed')
        .limit(1000);
      return ((data ?? []) as { id: string }[]).map((r) => r.id);
    } catch {
      return [];
    }
  }
}

/** §2AS D: how many confirmed registrations for this tournament have NOT been emailed yet. */
export async function getConfirmationEmailBacklog(tournamentId: string): Promise<number> {
  const ids = await getConfirmationEmailBacklogIds(tournamentId);
  return ids.length;
}

/** A tiny inline concurrency-limited pool - same pattern as `runWithConcurrency` in
 *  `lib/actions/payment.ts`, duplicated locally so this module has no dependency on a 'use server'
 *  action file (which may export only async functions). */
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

/** §2AS D: email every confirmed registration not yet emailed (the pre-feature backfill). Returns
 *  counts for the caller (`actions/payment.ts` `emailConfirmedPlayers`) to audit and report. */
export async function emailConfirmedRegistrations(
  tournamentId: string,
): Promise<{ sent: number; failed: number; total: number }> {
  const ids = await getConfirmationEmailBacklogIds(tournamentId);
  let sent = 0;
  let failed = 0;
  await runWithConcurrency(ids, 3, async (id) => {
    const ok = await sendConfirmationEmailForRegistration(id);
    if (ok) sent += 1;
    else failed += 1;
  });
  return { sent, failed, total: ids.length };
}
