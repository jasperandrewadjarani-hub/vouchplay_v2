import 'server-only';
import {
  selectReminders,
  selectUnpaidRecipients,
  partnerLockEffectiveAt,
  summarizeEntryPayment,
  type ReminderEntry,
  type ReminderBareSlot,
  type UnpaidRecipient,
} from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';
import { notify } from '@/lib/notifications/create';
import { getSlotsByRegistration } from '@/lib/payments/slots';
import { formatDateTime } from '@/lib/format-date';
import { getPartnerLockAt } from './queries';

/**
 * Reminders cron loader (master_plan §2AQ A1, Decision A1, migration-free). Evaluated per open
 * tournament (`registration_open`, bounded 50) against the pure `selectReminders` (packages/core):
 * early-bird ending, registration closing (unpaid seat / choose-a-division bare slot), partner lock
 * soon. Idempotent by EXISTENCE - a reminder is skipped whenever a `notifications` row with the same
 * (type, recipient, entity) already exists in the trailing window, so there is no new table and a
 * re-run (or a slightly-late cron) never double-sends.
 *
 * Every read is bounded and scoped to one tournament at a time; a single tournament's failure is
 * caught and skipped rather than aborting the whole run (§1 defensive pattern used throughout this
 * codebase for pre-migration/partial-failure resilience).
 */

const MAX_TOURNAMENTS = 50;
const MAX_REGISTRATIONS_PER_TOURNAMENT = 1000;
/** How far back to look for an already-sent reminder before treating a candidate as new. Generous
 *  relative to the longest reminder window (partner lock, up to ~72h before) so a slow cron run never
 *  re-sends. */
const SENT_WINDOW_DAYS = 30;
const CLOSED_REG_STATUSES = ['withdrawn', 'cancelled', 'rejected'];
const REMINDER_TYPES = [
  'early_bird_ending',
  'registration_closing_unpaid',
  'registration_closing_choose_division',
  'partner_lock_soon',
  // §2AU E: included here so `loadTournamentReminderContext`'s existence-check query (below) also
  // covers these two - the same idempotency mechanism, no new table.
  'guest_verify_reminder',
  'guest_verify_reminder_2',
];

interface TournamentReminderContext {
  entries: ReminderEntry[];
  bareSlots: ReminderBareSlot[];
  sent: Set<string>;
}

/** This tournament's bare slots relevant to reminders/nudges: LIVE (submitted | verified) for
 *  "choose your division" and `selectReminders`, plus `rejected` for §2AS C/F's
 *  "reserved-slot holders whose slot was declined" (`selectUnpaidRecipients`'s `slot_declined` kind).
 *  Defensive - `tournament_slots` arrives with migration 0042, so a missing table degrades to "no bare
 *  slots" rather than failing the run. */
async function loadBareSlotsForReminders(tournamentId: string): Promise<ReminderBareSlot[]> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('tournament_slots')
      .select('player_id, status')
      .eq('tournament_id', tournamentId)
      .is('registration_id', null)
      .in('status', ['submitted', 'verified', 'rejected']);
    if (error) throw error;
    return ((data ?? []) as { player_id: string; status: string }[]).map((s) => ({
      playerId: s.player_id,
      status: s.status,
    }));
  } catch {
    return [];
  }
}

/** Registrations + members + payments + slots for one tournament, in one batched round trip - the
 *  same pattern as `getOrganizerRegistrations` in `registration-queries.ts` (§2AQ Decision C), scoped
 *  to entries that can still receive a reminder (not withdrawn/cancelled/rejected). */
async function loadTournamentReminderContext(
  tournamentId: string,
  now: Date,
): Promise<TournamentReminderContext> {
  const svc = createServiceClient();
  const { data: regRows } = await svc
    .from('registrations')
    .select('id, team_id, division_id, status')
    .eq('tournament_id', tournamentId)
    .not('status', 'in', `(${CLOSED_REG_STATUSES.join(',')})`)
    .limit(MAX_REGISTRATIONS_PER_TOURNAMENT);
  const regs = (regRows ?? []) as {
    id: string;
    team_id: string;
    division_id: string;
    status: string;
  }[];

  const regIds = regs.map((r) => r.id);
  const teamIds = Array.from(new Set(regs.map((r) => r.team_id)));
  const divisionIds = Array.from(new Set(regs.map((r) => r.division_id)));
  const since = new Date(now.getTime() - SENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // A tournament-level reminder (registration_closing_choose_division keys off the tournament id, not
  // a registration) may key off the tournament id itself, alongside every entry id.
  const sentEntityIds = [tournamentId, ...regIds];

  const [
    { data: memberRows },
    { data: divRows },
    { data: payRows },
    slotsByReg,
    liveBareSlots,
    { data: sentRows },
  ] = await Promise.all([
    teamIds.length
      ? svc.from('team_members').select('team_id, player_id, confirmed_at').in('team_id', teamIds)
      : Promise.resolve({ data: [] }),
    divisionIds.length
      ? svc.from('divisions').select('id, team_size, fee_amount').in('id', divisionIds)
      : Promise.resolve({ data: [] }),
    regIds.length
      ? svc.from('payments').select('registration_id, status').in('registration_id', regIds)
      : Promise.resolve({ data: [] }),
    getSlotsByRegistration(regIds),
    loadBareSlotsForReminders(tournamentId),
    svc
      .from('notifications')
      .select('type, recipient_id, entity_id')
      .in('type', REMINDER_TYPES)
      .in('entity_id', sentEntityIds)
      .gte('created_at', since),
  ]);

  const membersByTeam = new Map<string, { player_id: string; confirmed_at: string | null }[]>();
  for (const m of (memberRows ?? []) as {
    team_id: string;
    player_id: string;
    confirmed_at: string | null;
  }[]) {
    const list = membersByTeam.get(m.team_id) ?? [];
    list.push(m);
    membersByTeam.set(m.team_id, list);
  }
  const divisionById = new Map<string, { team_size: number; fee_amount: number }>();
  for (const d of (divRows ?? []) as { id: string; team_size: number; fee_amount: number }[]) {
    divisionById.set(d.id, d);
  }
  const payStatusByReg = new Map<string, string>();
  for (const p of (payRows ?? []) as { registration_id: string; status: string }[]) {
    payStatusByReg.set(p.registration_id, p.status);
  }

  const entries: ReminderEntry[] = regs.map((r) => {
    const division = divisionById.get(r.division_id);
    const teamSize = division?.team_size ?? 2;
    const teamMembers = membersByTeam.get(r.team_id) ?? [];
    const slots = (slotsByReg.get(r.id) ?? []).map((s) => ({
      playerId: s.player_id,
      status: s.status,
      amountDue: Number(s.amount_due),
      amountSubmitted: s.amount_submitted != null ? Number(s.amount_submitted) : null,
      createdAt: s.created_at,
    }));
    const teamPaymentStatus = payStatusByReg.get(r.id) ?? null;
    // The shared verdict (master_plan §2AO A2) - the same function every other seat-state read in the
    // app uses, so the reminders cron can never disagree with the player's own card about who is
    // still unpaid. Seats are passed through UNFILTERED (empty seats included, playerId null) - the
    // pure selector needs the empty-seat signal for `partner_lock_soon`.
    const summary = summarizeEntryPayment({
      teamSize,
      memberIds: teamMembers.map((m) => m.player_id),
      teamPayment: teamPaymentStatus ? { status: teamPaymentStatus } : null,
      slots,
      feeOwed: (division?.fee_amount ?? 0) > 0,
    });
    return {
      registrationId: r.id,
      teamSize,
      members: teamMembers.map((m) => ({
        playerId: m.player_id,
        confirmed: Boolean(m.confirmed_at),
      })),
      seats: summary.seats.map((s) => ({ playerId: s.playerId, state: s.state })),
      status: r.status,
    };
  });

  const sent = new Set<string>();
  for (const n of (sentRows ?? []) as {
    type: string;
    recipient_id: string;
    entity_id: string | null;
  }[]) {
    if (n.entity_id) sent.add(`${n.type}:${n.recipient_id}:${n.entity_id}`);
  }

  return { entries, bareSlots: liveBareSlots, sent };
}

interface GuestVerifyCandidate {
  profileId: string;
  registrationId: string;
  guestCreatedAt: string;
}

/**
 * §2AU E: guest profiles (`guest_created_at` set, `onboarded_at` still null) who are CONFIRMED
 * members of a live (non-withdrawn/cancelled/rejected) registration in this tournament - the "finish
 * setting up your account" reminder audience. Read defensively end to end: `guest_created_at` arrives
 * with migration 0046, so a pre-migration deploy (or any read failure along the way) simply yields no
 * candidates rather than failing the whole reminders run for this tournament.
 */
async function loadGuestVerifyCandidates(tournamentId: string): Promise<GuestVerifyCandidate[]> {
  try {
    const svc = createServiceClient();
    const { data: regRows, error: regErr } = await svc
      .from('registrations')
      .select('id, team_id')
      .eq('tournament_id', tournamentId)
      .not('status', 'in', `(${CLOSED_REG_STATUSES.join(',')})`)
      .limit(MAX_REGISTRATIONS_PER_TOURNAMENT);
    if (regErr) throw regErr;
    const regs = (regRows ?? []) as { id: string; team_id: string }[];
    if (regs.length === 0) return [];
    const teamIds = Array.from(new Set(regs.map((r) => r.team_id)));

    const { data: memberRows, error: memErr } = await svc
      .from('team_members')
      .select('team_id, player_id, confirmed_at')
      .in('team_id', teamIds);
    if (memErr) throw memErr;
    const confirmedMembers = (
      (memberRows ?? []) as {
        team_id: string;
        player_id: string;
        confirmed_at: string | null;
      }[]
    ).filter((m) => m.confirmed_at);
    if (confirmedMembers.length === 0) return [];

    const playerIds = Array.from(new Set(confirmedMembers.map((m) => m.player_id)));
    const { data: guestRows, error: guestErr } = await svc
      .from('profiles')
      .select('id, guest_created_at, onboarded_at')
      .in('id', playerIds)
      .not('guest_created_at', 'is', null)
      .is('onboarded_at', null);
    if (guestErr) throw guestErr;
    const guestCreatedAtById = new Map(
      ((guestRows ?? []) as { id: string; guest_created_at: string | null }[])
        .filter((g) => g.guest_created_at)
        .map((g) => [g.id, g.guest_created_at as string]),
    );
    if (guestCreatedAtById.size === 0) return [];

    const regIdByTeam = new Map(regs.map((r) => [r.team_id, r.id]));
    const candidates: GuestVerifyCandidate[] = [];
    for (const m of confirmedMembers) {
      const guestCreatedAt = guestCreatedAtById.get(m.player_id);
      const registrationId = regIdByTeam.get(m.team_id);
      if (guestCreatedAt && registrationId) {
        candidates.push({ profileId: m.player_id, registrationId, guestCreatedAt });
      }
    }
    return candidates;
  } catch {
    return [];
  }
}

/** Run one reminders pass. Returns counts per notification type actually sent, for the cron audit
 *  row. `now` is injectable for tests / a manual re-run against a fixed clock. */
export async function runReminders(now: Date = new Date()): Promise<Record<string, number>> {
  const svc = createServiceClient();
  const counts: Record<string, number> = {};
  const nowIso = now.toISOString();

  const { data: tournRows } = await svc
    .from('tournaments')
    .select('id, name, slug, start_at, early_bird_ends_at, registration_close_at')
    .eq('status', 'registration_open')
    .limit(MAX_TOURNAMENTS);
  const tournaments = (
    (tournRows ?? []) as {
      id: string;
      name: string;
      slug: string | null;
      start_at: string | null;
      early_bird_ends_at: string | null;
      registration_close_at: string | null;
    }[]
  )
    // A tournament with no slug yet cannot build a real deep link and is not player-visible anyway -
    // skip it rather than sending a reminder that points nowhere useful.
    .filter((t): t is typeof t & { slug: string } => Boolean(t.slug));

  for (const t of tournaments) {
    try {
      const partnerLockAtRaw = await getPartnerLockAt(t.id);
      const partnerLockEffAt = partnerLockEffectiveAt(t.start_at, partnerLockAtRaw);
      const { entries, bareSlots, sent } = await loadTournamentReminderContext(t.id, now);
      if (entries.length === 0 && bareSlots.length === 0) continue;

      const results = selectReminders({
        now: nowIso,
        tournament: {
          id: t.id,
          name: t.name,
          slug: t.slug,
          earlyBirdEndsAt: t.early_bird_ends_at,
          registrationCloseAt: t.registration_close_at,
          partnerLockEffectiveAt: partnerLockEffAt,
        },
        entries,
        bareSlots,
        sent,
      });

      for (const r of results) {
        const link =
          r.entityType === 'registration'
            ? `/tournaments/${t.slug}?entered=${r.entityId}#my-registrations`
            : `/tournaments/${t.slug}?register=1`;
        await notify({
          recipientId: r.recipientId,
          type: r.type,
          params: {
            tournamentName: t.name,
            deadline: formatDateTime(r.deadlineIso),
          },
          link,
          entityType: r.entityType,
          entityId: r.entityId,
        });
        counts[r.type] = (counts[r.type] ?? 0) + 1;
      }

      // §2AU E: "finish setting up your account" - guest profiles who are confirmed members of a live
      // registration here, once at >= 6h and once at >= 48h after `guest_created_at`. Two independent
      // checks (not else-if) so a cron gap that skips past 6h still lets both eventually fire, each
      // idempotent via the same `sent` existence-check the rest of this run already uses.
      for (const c of await loadGuestVerifyCandidates(t.id)) {
        const hoursSinceGuestCreated =
          (now.getTime() - new Date(c.guestCreatedAt).getTime()) / (60 * 60 * 1000);
        const link = `/login?next=${encodeURIComponent(`/tournaments/${t.slug}`)}`;
        const sendGuestReminder = async (type: string) => {
          const key = `${type}:${c.profileId}:${c.registrationId}`;
          if (sent.has(key)) return;
          await notify({
            recipientId: c.profileId,
            type,
            params: { tournamentName: t.name },
            link,
            entityType: 'registration',
            entityId: c.registrationId,
          });
          counts[type] = (counts[type] ?? 0) + 1;
          sent.add(key);
        };
        if (hoursSinceGuestCreated >= 6) await sendGuestReminder('guest_verify_reminder');
        if (hoursSinceGuestCreated >= 48) await sendGuestReminder('guest_verify_reminder_2');
      }
    } catch {
      // One tournament's failure must not abort the run for the other 49 (§ best-effort pattern).
    }
  }

  return counts;
}

const REMINDER_RUN_AUDIT_ACTIONS = ['cron.reminders', 'admin.reminders.run'];

/**
 * §2AS C: who currently owes money for this tournament, right now - the SAME context loader and
 * `selectUnpaidRecipients` (packages/core) the cron itself feeds, so the organizer's "Remind unpaid
 * players" blast (`actions/payment.ts` `nudgeUnpaidPlayers`) and the unpaid banner can never disagree
 * with the cron about who is unpaid.
 */
export async function listUnpaidRecipients(tournamentId: string): Promise<UnpaidRecipient[]> {
  const { entries, bareSlots } = await loadTournamentReminderContext(tournamentId, new Date());
  return selectUnpaidRecipients({ tournamentId, entries, bareSlots });
}

/**
 * §2AS G: the most recent reminders run, from either the nightly cron (`cron.reminders`) or the
 * Admin "Run reminders now" button (`admin.reminders.run`) - whichever happened last. Server-only
 * helper (not a server action) so the Admin Operations card and `runRemindersNow` share one read.
 */
export async function getLastReminderRun(): Promise<{
  at: string;
  counts: Record<string, number> | null;
  outcome: string;
} | null> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('audit_logs')
      .select('created_at, after_snapshot')
      .in('action', REMINDER_RUN_AUDIT_ACTIONS)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as { created_at: string; after_snapshot: Record<string, unknown> | null };
    const after = row.after_snapshot ?? {};
    const counts =
      after.counts && typeof after.counts === 'object'
        ? (after.counts as Record<string, number>)
        : null;
    return {
      at: row.created_at,
      counts,
      outcome: typeof after.outcome === 'string' ? after.outcome : 'unknown',
    };
  } catch {
    return null;
  }
}
