import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { getPartnerSettings } from '@/lib/settings';
import { notify } from '@/lib/notifications/create';
import { getActorMini, getTournamentMini } from '@/lib/notifications/recipients';
import { promoteEnteredMatchesForTournament, type PartnerMatchRow } from './deck';
import { createMatchIfMutual } from './match';

/**
 * Partner matchmaking lifecycle sweep (master_plan §2AV G). Hooked into the existing reminders cron
 * (`lib/tournaments/reminders.ts` `runReminders`) rather than its own schedule - one nightly job, one
 * audit row. Every phase is independently try/caught and bounded: one bad row must never stop the
 * others, and a missing table/column (pre-0047 deploy skew) degrades that phase to a zero count
 * rather than throwing.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 2000;
const LOCK_REMINDER_WINDOW_DAYS = 3;

export interface PartnerMaintenanceCounts {
  closedSearches: number;
  enteredMatches: number;
  /** Matches created by the reconciliation sweep below - the rare pair a genuinely simultaneous
   *  double right-swipe stranded (master_plan §2AV F). Zero on a normal night. */
  reconciledMatches: number;
  matchReminders: number;
  lockReminders: number;
  digests: number;
  purgedSwipes: number;
}

interface SearchRow {
  id: string;
  tournament_id: string;
  player_id: string;
  division_ids: string[] | null;
  status: string;
  updated_at: string;
  created_at: string;
}

interface MatchRow {
  id: string;
  tournament_id: string;
  player_a: string;
  player_b: string;
  status: string;
  matched_at: string;
  reminded_at: string | null;
  lock_reminded_at: string | null;
}

/** Close every open search whose tournament has left `registration_open`, or whose player already
 *  holds a complete (2-confirmed-member) team in EVERY division they chose. Returns the count closed
 *  and the searches that are STILL open afterward (for the later phases to work from). */
async function closeStaleSearches(): Promise<{ count: number; stillOpen: SearchRow[] }> {
  const svc = createServiceClient();
  const { data: openRows, error } = await svc
    .from('partner_searches')
    .select('id, tournament_id, player_id, division_ids, status, updated_at, created_at')
    .eq('status', 'open')
    .limit(MAX_ROWS);
  if (error) throw error;
  const open = (openRows ?? []) as SearchRow[];
  if (open.length === 0) return { count: 0, stillOpen: [] };

  const tournamentIds = Array.from(new Set(open.map((s) => s.tournament_id)));
  const { data: tournRows } = await svc
    .from('tournaments')
    .select('id, status')
    .in('id', tournamentIds);
  const statusByTournament = new Map(
    ((tournRows ?? []) as { id: string; status: string }[]).map((t) => [t.id, t.status]),
  );

  const closedByTournament: string[] = [];
  const remainingAfterTournament = open.filter((s) => {
    const status = statusByTournament.get(s.tournament_id);
    if (status !== 'registration_open') {
      closedByTournament.push(s.id);
      return false;
    }
    return true;
  });

  // "Entered" close: every chosen division already has a complete (2-confirmed) team for this player.
  const allDivisionIds = Array.from(
    new Set(remainingAfterTournament.flatMap((s) => s.division_ids ?? [])),
  );
  const closedEntered: string[] = [];
  let stillOpenSearches = remainingAfterTournament;
  if (allDivisionIds.length > 0) {
    const { data: teamRows } = await svc
      .from('teams')
      .select('id, division_id')
      .in('division_id', allDivisionIds)
      .in('status', ['forming', 'formed', 'locked']);
    const teams = (teamRows ?? []) as { id: string; division_id: string }[];
    const divisionByTeam = new Map(teams.map((t) => [t.id, t.division_id]));
    const teamIds = teams.map((t) => t.id);
    const { data: memberRows } = teamIds.length
      ? await svc
          .from('team_members')
          .select('team_id, player_id, confirmed_at')
          .in('team_id', teamIds)
      : { data: [] };
    const members = (memberRows ?? []) as {
      team_id: string;
      player_id: string;
      confirmed_at: string | null;
    }[];
    const confirmedCountByTeam = new Map<string, number>();
    for (const m of members) {
      if (!m.confirmed_at) continue;
      confirmedCountByTeam.set(m.team_id, (confirmedCountByTeam.get(m.team_id) ?? 0) + 1);
    }
    const completeDivisionsByPlayer = new Map<string, Set<string>>();
    for (const m of members) {
      if (!m.confirmed_at) continue;
      if ((confirmedCountByTeam.get(m.team_id) ?? 0) < 2) continue;
      const divisionId = divisionByTeam.get(m.team_id);
      if (!divisionId) continue;
      const set = completeDivisionsByPlayer.get(m.player_id) ?? new Set<string>();
      set.add(divisionId);
      completeDivisionsByPlayer.set(m.player_id, set);
    }

    stillOpenSearches = remainingAfterTournament.filter((s) => {
      const chosen = s.division_ids ?? [];
      if (chosen.length === 0) return true;
      const complete = completeDivisionsByPlayer.get(s.player_id);
      const allEntered = complete ? chosen.every((id) => complete.has(id)) : false;
      if (allEntered) closedEntered.push(s.id);
      return !allEntered;
    });
  }

  const now = new Date().toISOString();
  if (closedByTournament.length > 0) {
    await svc
      .from('partner_searches')
      .update({ status: 'closed', closed_reason: 'registration_closed', updated_at: now })
      .in('id', closedByTournament);
  }
  if (closedEntered.length > 0) {
    await svc
      .from('partner_searches')
      .update({ status: 'closed', closed_reason: 'entered', updated_at: now })
      .in('id', closedEntered);
  }

  return { count: closedByTournament.length + closedEntered.length, stillOpen: stillOpenSearches };
}

/** Promote every still-open match to `entered` wherever both players now share a live team, grouped
 *  by tournament (a team belongs to exactly one tournament) so each group reuses the deck's own
 *  promotion helper - the same rule, checked the same way, in one place. */
async function enterSharedTeamMatches(): Promise<number> {
  const svc = createServiceClient();
  const { data: openRows, error } = await svc
    .from('partner_matches')
    .select(
      'id, tournament_id, player_a, player_b, division_ids, status, closed_reason, door, matched_at, updated_at',
    )
    .eq('status', 'open')
    .limit(MAX_ROWS);
  if (error) throw error;
  const open = (openRows ?? []) as PartnerMatchRow[];
  if (open.length === 0) return 0;
  const byTournament = new Map<string, PartnerMatchRow[]>();
  for (const m of open) {
    const list = byTournament.get(m.tournament_id) ?? [];
    list.push(m);
    byTournament.set(m.tournament_id, list);
  }
  let promotedCount = 0;
  for (const [tournamentId, matches] of byTournament) {
    const patched = await promoteEnteredMatchesForTournament(tournamentId, matches);
    promotedCount += patched.filter(
      (m, i) => m.status === 'entered' && matches[i]?.status !== 'entered',
    ).length;
  }
  return promotedCount;
}

/**
 * Reconcile a stranded mutual match (master_plan §2AV F): two players swiping right at the same
 * instant can each read the other's row before it is written, so neither's own `swipePartner` request
 * ever sees a reciprocal swipe and the match is never created. For every tournament that still has at
 * least one open search, this reads its right swipes (bounded) and pairs them up in memory; a pair
 * that is mutual and has no existing `partner_matches` row gets one via the exact same
 * `createMatchIfMutual` helper `swipePartner` calls on the normal path - same notifications, same
 * audit row, just late.
 */
async function reconcileStrandedMatches(stillOpenSearches: SearchRow[]): Promise<number> {
  const tournamentIds = Array.from(new Set(stillOpenSearches.map((s) => s.tournament_id)));
  if (tournamentIds.length === 0) return 0;
  const svc = createServiceClient();
  let reconciled = 0;

  for (const tournamentId of tournamentIds) {
    try {
      const { data: rightRows, error } = await svc
        .from('partner_swipes')
        .select('swiper_id, target_id')
        .eq('tournament_id', tournamentId)
        .eq('direction', 'right')
        .limit(MAX_ROWS);
      if (error) throw error;
      const rights = (rightRows ?? []) as { swiper_id: string; target_id: string }[];
      if (rights.length < 2) continue;

      const rightSet = new Set(rights.map((r) => `${r.swiper_id}:${r.target_id}`));
      const seenPairs = new Set<string>();
      const mutualPairs: [string, string][] = [];
      for (const r of rights) {
        if (!rightSet.has(`${r.target_id}:${r.swiper_id}`)) continue;
        const [a, b] =
          r.swiper_id < r.target_id ? [r.swiper_id, r.target_id] : [r.target_id, r.swiper_id];
        const key = `${a}:${b}`;
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        mutualPairs.push([a, b]);
      }
      if (mutualPairs.length === 0) continue;

      const { data: existingRows } = await svc
        .from('partner_matches')
        .select('player_a, player_b')
        .eq('tournament_id', tournamentId)
        .limit(MAX_ROWS);
      const existingKeys = new Set(
        ((existingRows ?? []) as { player_a: string; player_b: string }[]).map(
          (m) => `${m.player_a}:${m.player_b}`,
        ),
      );

      for (const [a, b] of mutualPairs) {
        if (existingKeys.has(`${a}:${b}`)) continue;
        try {
          const created = await createMatchIfMutual(tournamentId, a, b);
          if (created) reconciled++;
        } catch {
          // One pair's failure must not abort the rest.
        }
      }
    } catch {
      // One tournament's failure must not abort the rest.
    }
  }
  return reconciled;
}

/** Remind every open match older than `matchReminderHours` that has not been reminded yet. */
async function sendMatchReminders(matchReminderHours: number): Promise<number> {
  const svc = createServiceClient();
  const cutoff = new Date(Date.now() - matchReminderHours * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await svc
    .from('partner_matches')
    .select(
      'id, tournament_id, player_a, player_b, status, matched_at, reminded_at, lock_reminded_at',
    )
    .eq('status', 'open')
    .is('reminded_at', null)
    .lte('matched_at', cutoff)
    .limit(MAX_ROWS);
  if (error) throw error;
  const matches = (rows ?? []) as MatchRow[];
  let sent = 0;
  const now = new Date().toISOString();
  for (const m of matches) {
    try {
      const [tm, a, b] = await Promise.all([
        getTournamentMini(m.tournament_id),
        getActorMini(m.player_a),
        getActorMini(m.player_b),
      ]);
      const link = tm.slug ? `/tournaments/${tm.slug}/partners` : '/tournaments';
      await Promise.all([
        notify({
          recipientId: m.player_a,
          type: 'partner_match_reminder',
          params: { actorName: b.name, tournamentName: tm.name },
          link,
          entityType: 'partner_match',
          entityId: m.id,
        }),
        notify({
          recipientId: m.player_b,
          type: 'partner_match_reminder',
          params: { actorName: a.name, tournamentName: tm.name },
          link,
          entityType: 'partner_match',
          entityId: m.id,
        }),
      ]);
      await svc.from('partner_matches').update({ reminded_at: now }).eq('id', m.id);
      sent++;
    } catch {
      // One match's failure must not abort the rest.
    }
  }
  return sent;
}

/** Critical lock-in reminder, once, when a tournament's registration lock (or close) is within
 *  `LOCK_REMINDER_WINDOW_DAYS` and the match has not been reminded yet. */
async function sendLockReminders(): Promise<number> {
  const svc = createServiceClient();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + LOCK_REMINDER_WINDOW_DAYS * DAY_MS).toISOString();
  const nowIso = now.toISOString();

  const { data: tournRows, error } = await svc
    .from('tournaments')
    .select('id, slug, name, registration_lock_at, registration_close_at')
    .eq('status', 'registration_open')
    .limit(200);
  if (error) throw error;
  const tournaments = (
    (tournRows ?? []) as {
      id: string;
      slug: string | null;
      name: string;
      registration_lock_at: string | null;
      registration_close_at: string | null;
    }[]
  ).filter((t) => {
    const deadline = t.registration_lock_at ?? t.registration_close_at;
    return !!deadline && deadline >= nowIso && deadline <= windowEnd;
  });
  if (tournaments.length === 0) return 0;

  let sent = 0;
  for (const t of tournaments) {
    try {
      const { data: rows } = await svc
        .from('partner_matches')
        .select('id, player_a, player_b, status, lock_reminded_at')
        .eq('tournament_id', t.id)
        .eq('status', 'open')
        .is('lock_reminded_at', null)
        .limit(MAX_ROWS);
      const matches = (rows ?? []) as { id: string; player_a: string; player_b: string }[];
      const remindedAt = new Date().toISOString();
      for (const m of matches) {
        const [a, b] = await Promise.all([getActorMini(m.player_a), getActorMini(m.player_b)]);
        const link = t.slug ? `/tournaments/${t.slug}/partners` : '/tournaments';
        await Promise.all([
          notify({
            recipientId: m.player_a,
            type: 'partner_match_lock_reminder',
            params: { actorName: b.name, tournamentName: t.name },
            link,
            entityType: 'partner_match',
            entityId: m.id,
          }),
          notify({
            recipientId: m.player_b,
            type: 'partner_match_lock_reminder',
            params: { actorName: a.name, tournamentName: t.name },
            link,
            entityType: 'partner_match',
            entityId: m.id,
          }),
        ]);
        await svc.from('partner_matches').update({ lock_reminded_at: remindedAt }).eq('id', m.id);
        sent++;
      }
    } catch {
      // One tournament's failure must not abort the rest.
    }
  }
  return sent;
}

/** Daily "new candidates" digest, idempotent by existence like the rest of the reminders cron: at
 *  most one `partner_search_new_candidates` per recipient per tournament per 24h, and only when at
 *  least one genuinely new open search appeared since the last digest (or since this search opened,
 *  for a searcher who has never had one). */
async function sendDigests(stillOpenSearches: SearchRow[]): Promise<number> {
  if (stillOpenSearches.length === 0) return 0;
  const svc = createServiceClient();
  const byTournament = new Map<string, SearchRow[]>();
  for (const s of stillOpenSearches) {
    const list = byTournament.get(s.tournament_id) ?? [];
    list.push(s);
    byTournament.set(s.tournament_id, list);
  }

  let sent = 0;
  const nowMs = Date.now();
  for (const [tournamentId, searches] of byTournament) {
    if (searches.length < 2) continue; // nobody else to be a "new candidate"
    try {
      const tm = await getTournamentMini(tournamentId);
      const link = tm.slug ? `/tournaments/${tm.slug}/partners` : '/tournaments';
      for (const searcher of searches) {
        try {
          const { data: lastDigestRow } = await svc
            .from('notifications')
            .select('created_at')
            .eq('recipient_id', searcher.player_id)
            .eq('type', 'partner_search_new_candidates')
            .eq('entity_id', tournamentId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const lastDigestAt = (lastDigestRow as { created_at: string } | null)?.created_at ?? null;
          if (lastDigestAt && nowMs - new Date(lastDigestAt).getTime() < DAY_MS) continue; // throttled
          const sinceIso = lastDigestAt ?? searcher.created_at;
          const newCount = searches.filter(
            (other) => other.player_id !== searcher.player_id && other.created_at > sinceIso,
          ).length;
          if (newCount === 0) continue;
          await notify({
            recipientId: searcher.player_id,
            type: 'partner_search_new_candidates',
            params: { tournamentName: tm.name },
            link,
            entityType: 'tournament',
            entityId: tournamentId,
          });
          sent++;
        } catch {
          // One searcher's failure must not abort the rest.
        }
      }
    } catch {
      // One tournament's failure must not abort the rest.
    }
  }
  return sent;
}

/** Purge swipes belonging to searches closed more than `swipePurgeDays` ago (§2AV G/I: swipes are
 *  personal data with no client read policy at all - they should not linger forever). */
async function purgeOldSwipes(swipePurgeDays: number): Promise<number> {
  const svc = createServiceClient();
  const cutoff = new Date(Date.now() - swipePurgeDays * DAY_MS).toISOString();
  const { data: rows, error } = await svc
    .from('partner_searches')
    .select('tournament_id, player_id')
    .eq('status', 'closed')
    .lte('updated_at', cutoff)
    .limit(MAX_ROWS);
  if (error) throw error;
  const closed = (rows ?? []) as { tournament_id: string; player_id: string }[];
  let purged = 0;
  for (const s of closed) {
    try {
      const { data: deleted, error: delErr } = await svc
        .from('partner_swipes')
        .delete()
        .eq('tournament_id', s.tournament_id)
        .eq('swiper_id', s.player_id)
        .select('id');
      if (delErr) throw delErr;
      purged += (deleted ?? []).length;
    } catch {
      // One search's failure must not abort the rest.
    }
  }
  return purged;
}

/** Run one partner-matchmaking maintenance pass (master_plan §2AV G). Hooked into
 *  `lib/tournaments/reminders.ts` `runReminders()` so it shares the nightly cron and the Admin
 *  "Run reminders now" button with no separate schedule. Never throws - every phase is independently
 *  guarded, and a phase that fails reports 0 rather than aborting the others. */
export async function runPartnerMaintenance(): Promise<PartnerMaintenanceCounts> {
  const counts: PartnerMaintenanceCounts = {
    closedSearches: 0,
    enteredMatches: 0,
    reconciledMatches: 0,
    matchReminders: 0,
    lockReminders: 0,
    digests: 0,
    purgedSwipes: 0,
  };
  let stillOpenSearches: SearchRow[] = [];
  try {
    const { count, stillOpen } = await closeStaleSearches();
    counts.closedSearches = count;
    stillOpenSearches = stillOpen;
  } catch {
    // degrade to 0
  }
  try {
    counts.enteredMatches = await enterSharedTeamMatches();
  } catch {
    // degrade to 0
  }
  try {
    counts.reconciledMatches = await reconcileStrandedMatches(stillOpenSearches);
  } catch {
    // degrade to 0
  }
  try {
    const settings = await getPartnerSettings();
    counts.matchReminders = await sendMatchReminders(settings.matchReminderHours);
    counts.purgedSwipes = await purgeOldSwipes(settings.swipePurgeDays);
  } catch {
    // degrade to 0
  }
  try {
    counts.lockReminders = await sendLockReminders();
  } catch {
    // degrade to 0
  }
  try {
    counts.digests = await sendDigests(stillOpenSearches);
  } catch {
    // degrade to 0
  }
  return counts;
}
