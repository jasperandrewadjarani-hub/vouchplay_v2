import 'server-only';
import { revalidateTag } from 'next/cache';
import {
  badgeDef,
  OFFICIAL_ACHIEVEMENTS,
  fieldVisible,
  parseVisibility,
  skillByOrdinal,
} from '@vouchplay/config';
import {
  evaluateAutoBadges,
  type AutoBadgeInput,
  type CommemorativeEntryFact,
  type DesiredBadge,
  type OfficialResultFact,
  type OfficialTitleKey,
  type PlayerBadgeFacts,
} from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';
import { getBadgeSettings } from '@/lib/settings';
import { notify } from '@/lib/notifications/create';
import { PLAYERS_LIST_TAG, playerTag } from '@/lib/players/tags';

/**
 * Automatic badge computation (master_plan §2BK D). Batched reads (no per-player query loops), the
 * pure `evaluateAutoBadges` rules, then a diff against the live `auto` rows:
 *  - new key desired, no live row  -> INSERT, notify `badge_earned` once.
 *  - key still desired, live row exists -> UPDATE tally/meta/expires_at silently (no notification).
 *  - key no longer desired, live row exists, NOT time-bound -> REVOKE (`auto:no_longer_qualifies`),
 *    unless it is already `auto_blocked` (an admin's "Keep it off") or `source = 'grant'` (never
 *    touched by this job).
 *  - key no longer desired, live row exists, TIME-BOUND -> left alone; it simply expires via its own
 *    `expires_at` (never actively revoked - §2BK "Loose ends").
 *
 * Fails open: any error (including "table missing", pre-migration) returns zero counts rather than
 * throwing, so a cron/admin trigger before `0051` is applied is a harmless no-op.
 */
export interface ComputeAutoBadgesResult {
  awarded: number;
  updated: number;
  retired: number;
  skippedBlocked: number;
}

const EMPTY_RESULT: ComputeAutoBadgesResult = {
  awarded: 0,
  updated: 0,
  retired: 0,
  skippedBlocked: 0,
};

const OFFICIAL_TITLE_BY_TEXT: Record<string, OfficialTitleKey> = Object.fromEntries(
  OFFICIAL_ACHIEVEMENTS.map((a) => [a.title, a.key as OfficialTitleKey]),
);

interface LiveRow {
  id: string;
  player_id: string;
  badge_key: string;
  source: 'auto' | 'grant';
  tally: number;
  meta: Record<string, unknown> | null;
  expires_at: string | null;
  auto_blocked: boolean;
}

function metaEqual(a: Record<string, unknown>, b: Record<string, unknown> | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b ?? {});
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Batched fact loader. Always loads GLOBAL context (Pioneer/Rising/Top of Tier need it), even when
 *  `onlyPlayerIds` narrows which players will actually be WRITTEN (§2BK D). */
async function loadFacts(): Promise<{ input: AutoBadgeInput; slugById: Map<string, string> }> {
  const svc = createServiceClient();

  const { data: profileRows } = await svc
    .from('profiles')
    .select('id, slug, onboarded_at, profile_visibility')
    .eq('account_status', 'active')
    .not('onboarded_at', 'is', null);
  const profiles = (profileRows ?? []) as Array<{
    id: string;
    slug: string | null;
    onboarded_at: string | null;
    profile_visibility: Record<string, unknown> | null;
  }>;
  const ids = profiles.map((p) => p.id);
  const slugById = new Map(profiles.filter((p) => p.slug).map((p) => [p.id, p.slug as string]));
  const input: AutoBadgeInput = new Map();
  if (ids.length === 0) return { input, slugById };

  const facts = new Map<string, PlayerBadgeFacts>();
  for (const p of profiles) {
    facts.set(p.id, {
      officialResults: [],
      completedTournamentEntries: 0,
      standingVouchesGiven: 0,
      onboardedAt: p.onboarded_at,
      existingPioneerNumber: null,
      clubCaptain: false,
      enteredPartnerMatches: 0,
      playersMomentum: null,
      communityContributionRank: null,
      communityLevel: null,
      communityLevelSeen: null,
      levelUpAt: null,
      uniqueVouchers: 0,
      sts: null,
      communityBand: null,
      communityRatingPrivate: !fieldVisible(
        parseVisibility(p.profile_visibility ?? {}),
        'community_rating',
      ),
      isCoach: false,
      isOrganizer: false,
      ownedNonDraftTournaments: 0,
      commemorativeEntries: [],
    });
  }

  // ---- Official achievements (Glory) - organizer-issued and verified ONLY. ----
  const { data: achRows } = await svc
    .from('achievements')
    .select('id, title, issuer_type, verification_status, tournament_id, division_id, issued_at')
    .eq('type', 'official')
    .eq('issuer_type', 'organizer')
    .eq('verification_status', 'verified');
  const achievements = (achRows ?? []) as Array<{
    id: string;
    title: string;
    tournament_id: string | null;
    division_id: string | null;
    issued_at: string;
  }>;
  if (achievements.length > 0) {
    const achIds = achievements.map((a) => a.id);
    const tournamentIds = Array.from(
      new Set(achievements.map((a) => a.tournament_id).filter(Boolean)),
    ) as string[];
    const divisionIds = Array.from(
      new Set(achievements.map((a) => a.division_id).filter(Boolean)),
    ) as string[];
    const [{ data: linkRows }, { data: tournamentRows }, { data: divisionRows }] =
      await Promise.all([
        svc
          .from('player_achievements')
          .select('player_id, achievement_id, placement')
          .in('achievement_id', achIds),
        tournamentIds.length
          ? svc.from('tournaments').select('id, name').in('id', tournamentIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        divisionIds.length
          ? svc.from('divisions').select('id, name').in('id', divisionIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
    const achById = new Map(achievements.map((a) => [a.id, a]));
    const tournamentNameById = new Map(
      ((tournamentRows ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
    );
    const divisionNameById = new Map(
      ((divisionRows ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name]),
    );
    for (const link of (linkRows ?? []) as Array<{
      player_id: string;
      achievement_id: string;
      placement: string | null;
    }>) {
      const f = facts.get(link.player_id);
      const ach = achById.get(link.achievement_id);
      if (!f || !ach) continue;
      const titleKey = OFFICIAL_TITLE_BY_TEXT[ach.title];
      if (!titleKey) continue; // an official achievement title outside the known template set
      const result: OfficialResultFact = {
        placement:
          link.placement === '1st' || link.placement === '2nd' || link.placement === '3rd'
            ? link.placement
            : null,
        titleKey,
        issuedAt: ach.issued_at,
        tournamentName:
          (ach.tournament_id && tournamentNameById.get(ach.tournament_id)) || 'a tournament',
        divisionName: (ach.division_id && divisionNameById.get(ach.division_id)) || null,
      };
      (f.officialResults as OfficialResultFact[]).push(result);
    }
  }

  // ---- Confirmed entries in COMPLETED tournaments (Tour Regular) + commemorative entries (Event). ----
  const { data: tournamentRows } = await svc
    .from('tournaments')
    .select('id, status, commemorative_badge_label');
  const tournaments = (tournamentRows ?? []) as Array<{
    id: string;
    status: string;
    commemorative_badge_label: string | null;
  }>;
  const completedTournamentIds = new Set(
    tournaments.filter((t) => t.status === 'completed').map((t) => t.id),
  );
  const commemorativeByTournament = new Map(
    tournaments
      .filter((t) => t.commemorative_badge_label)
      .map((t) => [t.id, t.commemorative_badge_label as string]),
  );
  const relevantTournamentIds = new Set<string>([
    ...completedTournamentIds,
    ...commemorativeByTournament.keys(),
  ]);

  if (relevantTournamentIds.size > 0) {
    const { data: teamRows } = await svc
      .from('teams')
      .select('id, tournament_id')
      .in('tournament_id', Array.from(relevantTournamentIds));
    const teams = (teamRows ?? []) as Array<{ id: string; tournament_id: string }>;
    const tournamentIdByTeam = new Map(teams.map((t) => [t.id, t.tournament_id]));
    const teamIds = teams.map((t) => t.id);

    if (teamIds.length > 0) {
      const confirmedTeamIds: string[] = [];
      for (const teamIdChunk of chunk(teamIds, 500)) {
        const { data } = await svc
          .from('registrations')
          .select('team_id')
          .in('team_id', teamIdChunk)
          .eq('status', 'confirmed');
        for (const r of (data ?? []) as { team_id: string }[]) confirmedTeamIds.push(r.team_id);
      }
      if (confirmedTeamIds.length > 0) {
        const membersByTeam = new Map<string, string[]>();
        for (const teamIdChunk of chunk(confirmedTeamIds, 500)) {
          const { data } = await svc
            .from('team_members')
            .select('team_id, player_id')
            .in('team_id', teamIdChunk);
          for (const m of (data ?? []) as { team_id: string; player_id: string }[]) {
            const list = membersByTeam.get(m.team_id) ?? [];
            list.push(m.player_id);
            membersByTeam.set(m.team_id, list);
          }
        }

        const completedTournamentsByPlayer = new Map<string, Set<string>>();
        for (const [teamId, playerIds] of membersByTeam) {
          const tournamentId = tournamentIdByTeam.get(teamId);
          if (!tournamentId) continue;
          if (completedTournamentIds.has(tournamentId)) {
            for (const playerId of playerIds) {
              const set = completedTournamentsByPlayer.get(playerId) ?? new Set<string>();
              set.add(tournamentId);
              completedTournamentsByPlayer.set(playerId, set);
            }
          }
          const label = commemorativeByTournament.get(tournamentId);
          if (label) {
            for (const playerId of playerIds) {
              const f = facts.get(playerId);
              if (!f) continue;
              const entry: CommemorativeEntryFact = { tournamentId, label };
              (f.commemorativeEntries as CommemorativeEntryFact[]).push(entry);
            }
          }
        }
        for (const [playerId, set] of completedTournamentsByPlayer) {
          const f = facts.get(playerId);
          if (f) f.completedTournamentEntries = set.size;
        }
      }
    }
  }

  // ---- Owned non-draft tournaments (Organizer). ----
  {
    const { data } = await svc
      .from('tournaments')
      .select('owner_organizer_id, status')
      .neq('status', 'draft');
    const counts = new Map<string, number>();
    for (const t of (data ?? []) as { owner_organizer_id: string; status: string }[]) {
      counts.set(t.owner_organizer_id, (counts.get(t.owner_organizer_id) ?? 0) + 1);
    }
    for (const [playerId, count] of counts) {
      const f = facts.get(playerId);
      if (f) f.ownedNonDraftTournaments = count;
    }
  }

  // ---- Standing vouches given (Trusted Voice) - active vouches, grouped by voucher. ----
  {
    const { data } = await svc
      .from('vouches')
      .select('voucher_id')
      .eq('status', 'active')
      .limit(20000);
    const counts = new Map<string, number>();
    for (const v of (data ?? []) as { voucher_id: string }[]) {
      counts.set(v.voucher_id, (counts.get(v.voucher_id) ?? 0) + 1);
    }
    for (const [playerId, count] of counts) {
      const f = facts.get(playerId);
      if (f) f.standingVouchesGiven = count;
    }
  }

  // ---- Club Captain: owner/admin of an ACTIVE club. ----
  {
    const { data: activeClubs } = await svc
      .from('clubs')
      .select('id')
      .eq('activity_status', 'active');
    const clubIds = ((activeClubs ?? []) as { id: string }[]).map((c) => c.id);
    if (clubIds.length > 0) {
      const { data: memberships } = await svc
        .from('club_memberships')
        .select('user_id, role')
        .in('club_id', clubIds)
        .eq('status', 'active')
        .in('role', ['owner', 'admin']);
      for (const m of (memberships ?? []) as { user_id: string; role: string }[]) {
        const f = facts.get(m.user_id);
        if (f) f.clubCaptain = true;
      }
    }
  }

  // ---- Matchmaker: swipe matches that entered a tournament. ----
  {
    const { data } = await svc
      .from('partner_matches')
      .select('player_a, player_b')
      .eq('status', 'entered');
    const counts = new Map<string, number>();
    for (const m of (data ?? []) as { player_a: string; player_b: string }[]) {
      counts.set(m.player_a, (counts.get(m.player_a) ?? 0) + 1);
      counts.set(m.player_b, (counts.get(m.player_b) ?? 0) + 1);
    }
    for (const [playerId, count] of counts) {
      const f = facts.get(playerId);
      if (f) f.enteredPartnerMatches = count;
    }
  }

  // ---- Players-board momentum (Rising) + Community/contribution board rank (Top Contributor). ----
  // Global scope, the board's own default period (`all_time` for both categories - see
  // apps/web/src/app/(app)/leaderboards/page.tsx).
  {
    for (const idChunk of chunk(ids, 500)) {
      const { data } = await svc
        .from('player_leaderboard_momentum')
        .select('player_id, category, private_rank, previous_rank')
        .in('player_id', idChunk)
        .in('category', ['players', 'community'])
        .eq('scope_type', 'global')
        .eq('scope_value', '')
        .eq('period', 'all_time');
      for (const m of (data ?? []) as Array<{
        player_id: string;
        category: 'players' | 'community';
        private_rank: number | null;
        previous_rank: number | null;
      }>) {
        const f = facts.get(m.player_id);
        if (!f) continue;
        if (m.category === 'players') {
          f.playersMomentum = { privateRank: m.private_rank, previousRank: m.previous_rank };
        } else {
          f.communityContributionRank = m.private_rank;
        }
      }
    }
  }

  // ---- Skill snapshot (Proven, Top of Tier, Level Up's "current level"). ----
  {
    for (const idChunk of chunk(ids, 500)) {
      const { data } = await svc
        .from('player_skill_profiles')
        .select('player_id, community_skill_level, sts, unique_voucher_count')
        .in('player_id', idChunk);
      for (const s of (data ?? []) as Array<{
        player_id: string;
        community_skill_level: number | null;
        sts: number | string | null;
        unique_voucher_count: number | null;
      }>) {
        const f = facts.get(s.player_id);
        if (!f) continue;
        f.uniqueVouchers = s.unique_voucher_count ?? 0;
        f.sts = s.sts != null ? Number(s.sts) : null;
        f.communityLevel = s.community_skill_level ?? null;
        f.communityBand =
          f.communityLevel != null ? (skillByOrdinal(f.communityLevel)?.key ?? null) : null;
      }
    }
  }

  // ---- Level Up tracker (player_badge_progress). ----
  {
    for (const idChunk of chunk(ids, 500)) {
      const { data } = await svc
        .from('player_badge_progress')
        .select('player_id, community_level_seen, level_up_at')
        .in('player_id', idChunk);
      for (const row of (data ?? []) as Array<{
        player_id: string;
        community_level_seen: number | null;
        level_up_at: string | null;
      }>) {
        const f = facts.get(row.player_id);
        if (!f) continue;
        f.communityLevelSeen = row.community_level_seen;
        f.levelUpAt = row.level_up_at;
      }
    }
  }

  // ---- Existing Pioneer numbers (from live auto rows). ----
  {
    const { data } = await svc
      .from('player_badges')
      .select('player_id, meta')
      .eq('badge_key', 'pioneer')
      .eq('source', 'auto')
      .is('revoked_at', null);
    for (const row of (data ?? []) as Array<{
      player_id: string;
      meta: Record<string, unknown> | null;
    }>) {
      const f = facts.get(row.player_id);
      const n = row.meta?.number;
      if (f && typeof n === 'number') f.existingPioneerNumber = n;
    }
  }

  // ---- Roles (Coach, Organizer). ----
  {
    const { data } = await svc
      .from('user_roles')
      .select('user_id, role')
      .eq('status', 'active')
      .in('role', ['coach', 'organizer']);
    for (const r of (data ?? []) as { user_id: string; role: string }[]) {
      const f = facts.get(r.user_id);
      if (!f) continue;
      if (r.role === 'coach') f.isCoach = true;
      if (r.role === 'organizer') f.isOrganizer = true;
    }
  }

  for (const [playerId, f] of facts) input.set(playerId, f);
  return { input, slugById };
}

/**
 * Persists the Level Up tracker for every player whose `evaluateAutoBadges` inputs suggested a fresh
 * rise this run (`communityLevel > communityLevelSeen`), so the NEXT run's `communityLevelSeen`
 * matches `communityLevel` and does not re-trigger - see the comment on `levelUpBadge` in
 * `packages/core/src/badges/rules.ts` for why this exact condition mirrors the pure rule.
 */
async function persistLevelUpTracker(input: AutoBadgeInput, now: Date): Promise<void> {
  const svc = createServiceClient();
  const rows: Array<{
    player_id: string;
    community_level_seen: number | null;
    community_level_seen_at: string;
    level_up_at: string | null;
  }> = [];
  const nowIso = now.toISOString();
  for (const [playerId, f] of input) {
    if (f.communityLevel == null) continue;
    const justRose = f.communityLevelSeen != null && f.communityLevel > f.communityLevelSeen;
    const seenChanged = f.communityLevelSeen !== f.communityLevel;
    if (!justRose && !seenChanged) continue;
    rows.push({
      player_id: playerId,
      community_level_seen: f.communityLevel,
      community_level_seen_at: nowIso,
      level_up_at: justRose ? nowIso : (f.levelUpAt ?? null),
    });
  }
  if (rows.length === 0) return;
  for (const rowChunk of chunk(rows, 500)) {
    await svc.from('player_badge_progress').upsert(rowChunk, { onConflict: 'player_id' });
  }
}

export async function computeAutoBadges(opts?: {
  playerIds?: string[];
}): Promise<ComputeAutoBadgesResult> {
  try {
    const settings = await getBadgeSettings();
    if (!settings.enabled) return EMPTY_RESULT;

    const now = new Date();
    const { input, slugById } = await loadFacts();
    if (input.size === 0) return EMPTY_RESULT;

    await persistLevelUpTracker(input, now);

    const desiredByPlayer = evaluateAutoBadges(input, settings.rules, now);
    const disabled = new Set(settings.disabledKeys);

    const writeIds = opts?.playerIds ? new Set(opts.playerIds) : null;
    const targetIds = writeIds
      ? Array.from(input.keys()).filter((id) => writeIds.has(id))
      : Array.from(input.keys());
    if (targetIds.length === 0) return EMPTY_RESULT;

    const svc = createServiceClient();
    const { data: liveRowsRaw } = await svc
      .from('player_badges')
      .select('id, player_id, badge_key, source, tally, meta, expires_at, auto_blocked')
      .in('player_id', targetIds)
      .is('revoked_at', null);
    const liveRows = (liveRowsRaw ?? []) as LiveRow[];
    const liveByPlayer = new Map<string, LiveRow[]>();
    for (const row of liveRows) {
      const list = liveByPlayer.get(row.player_id) ?? [];
      list.push(row);
      liveByPlayer.set(row.player_id, list);
    }

    const result: ComputeAutoBadgesResult = {
      awarded: 0,
      updated: 0,
      retired: 0,
      skippedBlocked: 0,
    };
    const inserts: Array<{
      player_id: string;
      badge_key: string;
      source: 'auto';
      tally: number;
      meta: Record<string, unknown>;
      expires_at: string | null;
    }> = [];
    const updates: Array<{
      id: string;
      tally: number;
      meta: Record<string, unknown>;
      expires_at: string | null;
    }> = [];
    const revokes: string[] = [];
    const notifications: Array<{ playerId: string; badgeKey: string; name: string }> = [];
    const changedPlayerIds = new Set<string>();

    for (const playerId of targetIds) {
      const desired = desiredByPlayer.get(playerId) ?? [];
      const desiredByKey = new Map(desired.map((d) => [d.key, d]));
      const live = liveByPlayer.get(playerId) ?? [];
      const liveByKey = new Map(live.map((r) => [r.badge_key, r]));

      for (const [key, d] of desiredByKey) {
        if (disabled.has(key)) continue;
        const existing = liveByKey.get(key);
        if (!existing) {
          inserts.push({
            player_id: playerId,
            badge_key: key,
            source: 'auto',
            tally: d.tally,
            meta: { ...d.meta },
            expires_at: d.expiresAt,
          });
          const label = typeof d.meta.label === 'string' ? d.meta.label : null;
          notifications.push({
            playerId,
            badgeKey: key,
            name: label ?? badgeDef(key)?.name ?? key,
          });
          changedPlayerIds.add(playerId);
          result.awarded += 1;
          continue;
        }
        if (existing.source === 'grant') continue; // never touched by the job
        const changed =
          existing.tally !== d.tally ||
          !metaEqual(d.meta as Record<string, unknown>, existing.meta) ||
          existing.expires_at !== d.expiresAt;
        if (changed) {
          updates.push({
            id: existing.id,
            tally: d.tally,
            meta: { ...d.meta },
            expires_at: d.expiresAt,
          });
          changedPlayerIds.add(playerId);
          result.updated += 1;
        }
      }

      for (const [key, existing] of liveByKey) {
        if (desiredByKey.has(key)) continue;
        if (existing.source === 'grant') continue;
        if (existing.auto_blocked) {
          result.skippedBlocked += 1;
          continue;
        }
        const def = timeBoundKey(key);
        if (def) continue; // leave it to expire on its own (§2BK "Loose ends")
        revokes.push(existing.id);
        changedPlayerIds.add(playerId);
        result.retired += 1;
      }
    }

    for (const rowChunk of chunk(inserts, 500)) {
      if (rowChunk.length) await svc.from('player_badges').insert(rowChunk);
    }
    for (const u of updates) {
      await svc
        .from('player_badges')
        .update({ tally: u.tally, meta: u.meta, expires_at: u.expires_at })
        .eq('id', u.id);
    }
    if (revokes.length) {
      for (const idChunk of chunk(revokes, 500)) {
        await svc
          .from('player_badges')
          .update({ revoked_at: now.toISOString(), revoke_reason: 'auto:no_longer_qualifies' })
          .in('id', idChunk);
      }
    }

    for (const n of notifications) {
      await notify({
        recipientId: n.playerId,
        type: 'badge_earned',
        params: { extra: n.name },
        link: '/me',
        entityType: 'player_badge',
      });
    }

    if (changedPlayerIds.size > 0) {
      revalidateTag(PLAYERS_LIST_TAG);
      for (const playerId of changedPlayerIds) {
        const slug = slugById.get(playerId);
        if (slug) revalidateTag(playerTag(slug));
      }
    }

    return result;
  } catch {
    return EMPTY_RESULT;
  }
}

/** Time-bound badge keys (§2BK "Loose ends": these are left to expire, never actively revoked). */
function timeBoundKey(key: string): boolean {
  return (
    key === 'champion' ||
    key === 'podium' ||
    key === 'rising' ||
    key === 'level_up' ||
    key === 'tier_crown'
  );
}

// Re-export so callers building meta/notification copy can resolve a fresh DesiredBadge shape
// without importing @vouchplay/core directly (keeps the badge server surface in one place).
export type { DesiredBadge };
