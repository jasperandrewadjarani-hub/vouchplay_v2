import 'server-only';
import { createHash } from 'node:crypto';
import {
  LEADERBOARD_ALGORITHM_VERSION,
  derivePublicLeaderboardScopes,
  evaluateClubLeaderboardEligibility,
  evaluatePlayerLeaderboardEligibility,
  leaderboardCta,
  rankLeaderboard,
  type LeaderboardCategory,
  type LeaderboardFact,
  type RankedLeaderboardRow,
} from '@vouchplay/core';
import type { SkillAlgorithmVersion } from '@vouchplay/config';
import { createServiceClient } from '@/lib/supabase/service';
import { fetchAllRows } from '@/lib/supabase/fetch-all';
import { getLeaderboardSettings, getActiveSkillVersion } from '@/lib/settings';
import {
  pickActiveSkill,
  skillProfileColumns,
  type SkillProfileRow,
} from '@/lib/vouches/active-skill';
import { recomputeAllContributions } from '@/lib/contribution/recompute';
import { notifyMany } from '@/lib/notifications/create';
import type { LeaderboardPeriod, LeaderboardScope } from './types';

type Row = Record<string, unknown>;

interface Subject {
  id: string;
  kind: 'player' | 'club';
  name: string;
  slug: string;
  imagePath: string | null;
  city: string | null;
  region: string | null;
  privateEligible: boolean;
  publicEligible: boolean;
  exclusionCode: string | null;
}

interface SourceBundle {
  profiles: Row[];
  clubs: Row[];
  contributions: Row[];
  skillProfiles: Row[];
  registrations: Row[];
  members: Row[];
  representations: Row[];
  memberships: Row[];
  achievements: Row[];
  playerAchievements: Row[];
  exclusions: Row[];
  fraudFlags: Row[];
}

function displayName(row: Row): string {
  return String(
    row.nickname || [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Player',
  );
}

function seasonCutoff(now: Date, start: string): Date {
  const [month, day] = start.split('-').map(Number);
  const candidate = new Date(
    Date.UTC(now.getUTCFullYear(), Math.max(0, (month || 1) - 1), day || 1),
  );
  return candidate > now
    ? new Date(Date.UTC(now.getUTCFullYear() - 1, Math.max(0, (month || 1) - 1), day || 1))
    : candidate;
}

function periodCutoff(
  period: LeaderboardPeriod,
  now: Date,
  monthDays: number,
  seasonStart: string,
) {
  if (period === 'all_time') return null;
  if (period === 'season') return seasonCutoff(now, seasonStart);
  return new Date(now.getTime() - monthDays * 86_400_000);
}

function inPeriod(value: unknown, cutoff: Date | null): boolean {
  return !cutoff || (typeof value === 'string' && Date.parse(value) >= cutoff.getTime());
}

function placementValue(value: unknown): number {
  const placement = String(value ?? '').toLowerCase();
  if (/champion|winner|gold|first|1st/.test(placement)) return 3;
  if (/runner|silver|second|2nd/.test(placement)) return 2;
  if (/bronze|third|3rd|semi/.test(placement)) return 1;
  return 0;
}

function profileCompleteness(row: Row): number {
  const fields = ['avatar_path', 'bio', 'city', 'facebook_url', 'self_rated_skill'];
  return fields.filter((field) => row[field] !== null && row[field] !== '').length / fields.length;
}

function scopeMatches(subject: Subject, type: LeaderboardScope, value: string | null): boolean {
  if (type === 'global') return true;
  const actual = type === 'city' ? subject.city : subject.region;
  return Boolean(actual && value && actual.toLocaleLowerCase() === value.toLocaleLowerCase());
}

function exclusionFor(
  rows: Row[],
  kind: 'player' | 'club',
  id: string,
  category: LeaderboardCategory,
) {
  return rows.some(
    (row) =>
      row.entity_type === kind &&
      row.entity_id === id &&
      row.active === true &&
      (row.category == null || row.category === category),
  );
}

/**
 * `player_skill_profiles.skill_verified` (V1) alone would be stale the moment the site flips to
 * STS_V2 (§2AF rollout step 2), since STS_V2 has no separate `skill_verified` column of its own (it is
 * derived from `sts_v2`/`n_eff_v2` via `pickActiveSkill`, §2AF E2/E3) - the leaderboard's "verified"
 * weight would silently keep ranking on the retired algorithm. This selects the version-routed column
 * set, falls open to V1 on a 42703 (migration 0034 not applied), and reduces every row back down to
 * `{ player_id, skill_verified }` so the rest of this file is untouched.
 */
async function fetchSkillVerifiedRows(
  db: ReturnType<typeof createServiceClient>,
  limit: number,
): Promise<{ rows: Row[]; count: number; capped: boolean }> {
  const version = await getActiveSkillVersion();
  const columnsFor = (v: SkillAlgorithmVersion) => `player_id, ${skillProfileColumns(v)}`;
  // Supabase's client falls back to an opaque `GenericStringError[]` data type for a dynamic (non-
  // literal) `.select()` column string, so this one cast is required here (same reasoning as
  // `PostgrestLikeResponse` in active-skill.ts, which fetchAllRows's stricter `PageResult<T>` shape
  // does not accept without it).
  const page = (v: SkillAlgorithmVersion) => (from: number, to: number) =>
    db
      .from('player_skill_profiles')
      .select(columnsFor(v), { count: 'exact' })
      .order('player_id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{
      data: (SkillProfileRow & { player_id: string })[] | null;
      error: { message?: string; code?: string; details?: string } | null;
      count: number | null;
    }>;

  let result: { rows: (SkillProfileRow & { player_id: string })[]; count: number; capped: boolean };
  try {
    result = await fetchAllRows<SkillProfileRow & { player_id: string }>(
      page(version),
      limit,
      'leaderboard_skill_profiles',
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (version !== 'STS_V2' || !message.includes('42703')) throw e;
    // The V2 columns do not exist yet (migration 0034 not applied) - fail open to V1, §2R.
    result = await fetchAllRows<SkillProfileRow & { player_id: string }>(
      page('STS_V1'),
      limit,
      'leaderboard_skill_profiles',
    );
  }

  const rows: Row[] = result.rows.map((row) => ({
    player_id: row.player_id,
    skill_verified: pickActiveSkill(row, version).skillVerified,
  }));
  return { rows, count: result.count, capped: result.capped };
}

async function loadSources(max: number): Promise<SourceBundle> {
  const db = createServiceClient();
  const limit = Math.max(100, max);
  const wide = limit * 4;
  // Every source is PAGED past PostgREST's ~1000-row response cap, not read with a single
  // `.limit()`. A lone `.limit(bound)` is silently clamped to 1000 rows, and the old truncation
  // guard then killed the whole rebuild the moment a table crossed 1,000 (master_plan §2I). Each
  // read carries a stable total order so pages never skip or repeat a row.
  const [
    profiles,
    clubs,
    contributions,
    skillProfiles,
    registrations,
    members,
    representations,
    memberships,
    achievements,
    playerAchievements,
    exclusions,
    fraudFlags,
  ] = await Promise.all([
    fetchAllRows<Row>(
      (from, to) =>
        db
          .from('profiles')
          .select(
            'id, first_name, last_name, nickname, slug, city, date_of_birth, avatar_path, bio, facebook_url, self_rated_skill, profile_visibility, account_status, deleted_at',
            { count: 'exact' },
          )
          .order('id', { ascending: true })
          .range(from, to),
      limit,
      'leaderboard_profiles',
    ),
    fetchAllRows<Row>(
      (from, to) =>
        db
          .from('clubs')
          .select(
            'id, name, slug, city, logo_path, verification_status, activity_status, deleted_at',
            { count: 'exact' },
          )
          .order('id', { ascending: true })
          .range(from, to),
      limit,
      'leaderboard_clubs',
    ),
    fetchAllRows<Row>(
      (from, to) =>
        db
          .from('player_contributions')
          .select(
            'player_id, algorithm_version, score, distinct_players_helped, newcomer_players_helped, current_streak_weeks',
            { count: 'exact' },
          )
          .order('player_id', { ascending: true })
          .range(from, to),
      limit,
      'leaderboard_contributions',
    ),
    fetchSkillVerifiedRows(db, limit),
    fetchAllRows<Row>(
      (from, to) =>
        db
          .from('registrations')
          .select('id, tournament_id, team_id, status, confirmed_at, created_at', {
            count: 'exact',
          })
          .eq('status', 'confirmed')
          .order('id', { ascending: true })
          .range(from, to),
      wide,
      'leaderboard_registrations',
    ),
    fetchAllRows<Row>(
      (from, to) =>
        db
          .from('team_members')
          .select('team_id, player_id', { count: 'exact' })
          .order('team_id', { ascending: true })
          .order('player_id', { ascending: true })
          .range(from, to),
      wide,
      'leaderboard_team_members',
    ),
    fetchAllRows<Row>(
      (from, to) =>
        db
          .from('tournament_player_club_representations')
          .select(
            'tournament_id, player_id, club_id, membership_verified_at_selection, organizer_override, created_at',
            { count: 'exact' },
          )
          .order('tournament_id', { ascending: true })
          .order('player_id', { ascending: true })
          .order('club_id', { ascending: true })
          .range(from, to),
      wide,
      'leaderboard_representations',
    ),
    fetchAllRows<Row>(
      (from, to) =>
        db
          .from('club_memberships')
          .select('club_id, user_id, role, status', { count: 'exact' })
          .eq('status', 'active')
          .order('club_id', { ascending: true })
          .order('user_id', { ascending: true })
          .range(from, to),
      wide,
      'leaderboard_club_memberships',
    ),
    fetchAllRows<Row>(
      (from, to) =>
        db
          .from('achievements')
          .select('id, tournament_id, issued_at, type, verification_status', { count: 'exact' })
          .eq('type', 'official')
          .eq('verification_status', 'verified')
          .order('id', { ascending: true })
          .range(from, to),
      wide,
      'leaderboard_achievements',
    ),
    fetchAllRows<Row>(
      (from, to) =>
        db
          .from('player_achievements')
          .select('player_id, achievement_id, placement', { count: 'exact' })
          .order('player_id', { ascending: true })
          .order('achievement_id', { ascending: true })
          .range(from, to),
      wide,
      'leaderboard_player_achievements',
    ),
    fetchAllRows<Row>(
      (from, to) =>
        db
          .from('leaderboard_exclusions')
          .select('entity_type, entity_id, category, active', { count: 'exact' })
          .eq('active', true)
          .order('entity_type', { ascending: true })
          .order('entity_id', { ascending: true })
          .order('category', { ascending: true })
          .range(from, to),
      limit,
      'leaderboard_exclusions',
    ),
    fetchAllRows<Row>(
      (from, to) =>
        db
          .from('fraud_flags')
          .select('subject_type, subject_id, severity, status', { count: 'exact' })
          .in('status', ['open', 'reviewing'])
          .in('severity', ['high', 'critical'])
          .order('subject_id', { ascending: true })
          .order('subject_type', { ascending: true })
          .range(from, to),
      limit,
      'leaderboard_fraud_flags',
    ),
  ]);
  // A source that genuinely holds more than its bound is a real overload, not ordinary growth.
  if (
    [
      profiles,
      clubs,
      contributions,
      skillProfiles,
      registrations,
      members,
      representations,
      memberships,
      achievements,
      playerAchievements,
      exclusions,
      fraudFlags,
    ].some((source) => source.capped)
  )
    throw new Error('leaderboard_source_bound_exceeded');
  return {
    profiles: profiles.rows,
    clubs: clubs.rows,
    contributions: contributions.rows,
    skillProfiles: skillProfiles.rows,
    registrations: registrations.rows,
    members: members.rows,
    representations: representations.rows,
    memberships: memberships.rows,
    achievements: achievements.rows,
    playerAchievements: playerAchievements.rows,
    exclusions: exclusions.rows,
    fraudFlags: fraudFlags.rows,
  };
}

function playerSubjects(
  source: SourceBundle,
  category: LeaderboardCategory,
  now: Date,
  minAge: number,
  excludeUnknownDob: boolean,
  regions: Record<string, string>,
): Subject[] {
  const highRisk = new Set(
    source.fraudFlags
      .filter((row) => row.subject_type === 'user' || row.subject_type === 'coach')
      .map((row) => String(row.subject_id)),
  );
  return source.profiles.map((row) => {
    const id = String(row.id);
    const visibility = (row.profile_visibility ?? {}) as Record<string, unknown>;
    const dob = row.date_of_birth ? String(row.date_of_birth) : null;
    const decision = evaluatePlayerLeaderboardEligibility({
      accountActive: row.account_status === 'active',
      deleted: Boolean(row.deleted_at),
      unresolvedHighRiskFraud: highRisk.has(id),
      adminExcluded: exclusionFor(source.exclusions, 'player', id, category),
      directoryHidden: visibility.directory === 'hidden',
      profilePrivate: visibility.profile === 'private',
      leaderboardOptOut: visibility.leaderboards === 'hidden',
      dateOfBirth: dob,
      excludeUnknownDateOfBirth: excludeUnknownDob,
      minimumPublicAge: minAge,
      hasPublicSlug: Boolean(row.slug),
      evaluatedAt: now,
    });
    const city = row.city ? String(row.city) : null;
    return {
      id,
      kind: 'player',
      name: displayName(row),
      slug: String(row.slug ?? ''),
      imagePath: row.avatar_path ? String(row.avatar_path) : null,
      city,
      region: city ? (regions[city] ?? regions[city.toLocaleLowerCase()] ?? null) : null,
      privateEligible: decision.privateEligible,
      publicEligible: decision.publicEligible,
      exclusionCode: decision.exclusionCode,
    };
  });
}

function clubSubjects(source: SourceBundle, regions: Record<string, string>): Subject[] {
  return source.clubs.map((row) => {
    const id = String(row.id);
    const city = row.city ? String(row.city) : null;
    const excluded = exclusionFor(source.exclusions, 'club', id, 'clubs');
    const decision = evaluateClubLeaderboardEligibility({
      verified: row.verification_status === 'verified',
      active: row.activity_status === 'active',
      deleted: Boolean(row.deleted_at),
      adminExcluded: excluded,
      hasPublicSlug: Boolean(row.slug),
    });
    return {
      id,
      kind: 'club',
      name: String(row.name),
      slug: String(row.slug),
      imagePath: row.logo_path ? String(row.logo_path) : null,
      city,
      region: city ? (regions[city] ?? regions[city.toLocaleLowerCase()] ?? null) : null,
      privateEligible: decision.privateEligible,
      publicEligible: decision.publicEligible,
      exclusionCode: decision.exclusionCode,
    };
  });
}

function makeFacts(
  category: LeaderboardCategory,
  subjects: Subject[],
  source: SourceBundle,
  cutoff: Date | null,
): LeaderboardFact[] {
  const confirmedTeams = new Map(
    source.registrations
      .filter((row) => inPeriod(row.confirmed_at ?? row.created_at, cutoff))
      .map((row) => [String(row.team_id), String(row.tournament_id)]),
  );
  const playerTournaments = new Map<string, Set<string>>();
  for (const member of source.members) {
    const tournament = confirmedTeams.get(String(member.team_id));
    if (!tournament) continue;
    const values = playerTournaments.get(String(member.player_id)) ?? new Set<string>();
    values.add(tournament);
    playerTournaments.set(String(member.player_id), values);
  }
  const achievements = new Map(
    source.achievements
      .filter((row) => inPeriod(row.issued_at, cutoff))
      .map((row) => [String(row.id), row]),
  );
  const playerPlacement = new Map<string, number>();
  for (const link of source.playerAchievements) {
    if (!achievements.has(String(link.achievement_id))) continue;
    playerPlacement.set(
      String(link.player_id),
      (playerPlacement.get(String(link.player_id)) ?? 0) + placementValue(link.placement),
    );
  }
  const contribution = new Map(source.contributions.map((row) => [String(row.player_id), row]));
  const verified = new Set(
    source.skillProfiles
      .filter((row) => row.skill_verified === true)
      .map((row) => String(row.player_id)),
  );
  const profiles = new Map(source.profiles.map((row) => [String(row.id), row]));

  if (category === 'players') {
    return subjects.map((subject) => {
      const participation = playerTournaments.get(subject.id)?.size ?? 0;
      const placement = playerPlacement.get(subject.id) ?? 0;
      const profile = profileCompleteness(profiles.get(subject.id) ?? {});
      return {
        subjectId: subject.id,
        eligible: subject.privateEligible,
        components: {
          participation,
          placement,
          profile,
          skillVerified: verified.has(subject.id) ? 1 : 0,
        },
        tieBreak: [placement, participation, profile],
        explanation: `${participation} verified tournament${participation === 1 ? '' : 's'}; ${placement} official placement points.`,
      };
    });
  }
  if (category === 'community') {
    return subjects.map((subject) => {
      const row = contribution.get(subject.id) ?? {};
      const score = Number(row.score ?? 0);
      const distinct = Number(row.distinct_players_helped ?? 0);
      const newcomers = Number(row.newcomer_players_helped ?? 0);
      const streak = Number(row.current_streak_weeks ?? 0);
      return {
        subjectId: subject.id,
        eligible: subject.privateEligible,
        components: { contribution: score },
        tieBreak: [newcomers, distinct, streak],
        // Short by design: the trailing "repeat pairs / rings" clause was truncated mid-word by the
        // one-line clamp on the board, so it is dropped (§2O). The scoring still discounts repeats.
        explanation: `${distinct} distinct players supported; ${newcomers} were newcomers.`,
      };
    });
  }

  const activeMembers = new Map<string, Set<string>>();
  for (const membership of source.memberships) {
    const values = activeMembers.get(String(membership.club_id)) ?? new Set<string>();
    values.add(String(membership.user_id));
    activeMembers.set(String(membership.club_id), values);
  }
  const validRepresentations = source.representations.filter(
    (row) => row.membership_verified_at_selection === true || row.organizer_override === true,
  );
  const clubTournaments = new Map<string, Set<string>>();
  const clubAttendance = new Map<string, Set<string>>();
  const clubPlacement = new Map<string, number>();
  const placementByPlayerTournament = new Map<string, number>();
  for (const link of source.playerAchievements) {
    const achievement = achievements.get(String(link.achievement_id));
    if (!achievement?.tournament_id) continue;
    const key = `${String(link.player_id)}:${String(achievement.tournament_id)}`;
    placementByPlayerTournament.set(
      key,
      (placementByPlayerTournament.get(key) ?? 0) + placementValue(link.placement),
    );
  }
  for (const rep of validRepresentations) {
    const playerEvents = playerTournaments.get(String(rep.player_id));
    if (!playerEvents?.has(String(rep.tournament_id))) continue;
    const clubId = String(rep.club_id);
    const tournaments = clubTournaments.get(clubId) ?? new Set<string>();
    tournaments.add(String(rep.tournament_id));
    clubTournaments.set(clubId, tournaments);
    const attendance = clubAttendance.get(clubId) ?? new Set<string>();
    attendance.add(`${String(rep.tournament_id)}:${String(rep.player_id)}`);
    clubAttendance.set(clubId, attendance);
    const placement =
      placementByPlayerTournament.get(`${String(rep.player_id)}:${String(rep.tournament_id)}`) ?? 0;
    clubPlacement.set(clubId, (clubPlacement.get(clubId) ?? 0) + placement);
  }
  return subjects.map((subject) => {
    const members = activeMembers.get(subject.id) ?? new Set<string>();
    const contributionTotal = [...members].reduce(
      (sum, id) => sum + Number(contribution.get(id)?.score ?? 0),
      0,
    );
    const participation = clubTournaments.get(subject.id)?.size ?? 0;
    const attendance = clubAttendance.get(subject.id)?.size ?? 0;
    const placement = clubPlacement.get(subject.id) ?? 0;
    return {
      subjectId: subject.id,
      eligible: subject.privateEligible,
      components: {
        participation,
        activeMembers: Math.sqrt(members.size),
        attendance: Math.sqrt(attendance),
        placement,
        contribution: Math.sqrt(contributionTotal),
      },
      tieBreak: [placement, participation, attendance],
      explanation: `${participation} verified tournament${participation === 1 ? '' : 's'}, ${attendance} represented attendances, and ${members.size} active members.`,
    };
  });
}

async function milestoneNotifications(
  category: LeaderboardCategory,
  publicRows: RankedLeaderboardRow[],
  previous: Map<string, number>,
  source: SourceBundle,
  clubMovementNotifyPlaces: number,
) {
  const db = createServiceClient();
  const candidates: { recipientId: string; milestone: string }[] = [];
  if (category === 'players' || category === 'community') {
    for (const row of publicRows.slice(0, 10)) {
      candidates.push({
        recipientId: row.subjectId,
        milestone: row.rank <= 3 ? 'podium' : 'top_10',
      });
    }
  } else {
    const owners = new Map(
      source.memberships
        .filter((row) => row.role === 'owner')
        .map((row) => [String(row.club_id), String(row.user_id)]),
    );
    for (const row of publicRows) {
      const old = previous.get(row.subjectId);
      const owner = owners.get(row.subjectId);
      if (owner && old && old - row.rank >= clubMovementNotifyPlaces)
        candidates.push({
          recipientId: owner,
          milestone: 'club_movement',
        });
    }
  }
  if (!candidates.length) return;
  const ids = [...new Set(candidates.map((candidate) => candidate.recipientId))];
  const { data: existing } = await db
    .from('leaderboard_milestones')
    .select('recipient_id, milestone')
    .in('recipient_id', ids)
    .eq('category', category)
    .eq('scope_type', 'global')
    .eq('scope_value', '')
    .eq('period', 'all_time');
  const seen = new Set(
    ((existing ?? []) as Row[]).map((row) => `${row.recipient_id}:${row.milestone}`),
  );
  const fresh = candidates.filter(
    (candidate) => !seen.has(`${candidate.recipientId}:${candidate.milestone}`),
  );
  if (!fresh.length) return;
  const { error } = await db.from('leaderboard_milestones').insert(
    fresh.map((candidate) => ({
      recipient_id: candidate.recipientId,
      category,
      scope_type: 'global',
      scope_value: '',
      period: 'all_time',
      milestone: candidate.milestone,
      last_notified_at: new Date().toISOString(),
    })),
  );
  if (error) return;
  for (const milestone of ['podium', 'top_10', 'club_movement']) {
    const recipients = fresh
      .filter((candidate) => candidate.milestone === milestone)
      .map((candidate) => candidate.recipientId);
    if (!recipients.length) continue;
    const label = category === 'community' ? 'Community Champions' : 'Players';
    await notifyMany(recipients, {
      type: 'leaderboard_milestone',
      params: {
        outcome:
          milestone === 'podium'
            ? `You reached the ${label} podium`
            : milestone === 'top_10'
              ? `You reached the ${label} top 10`
              : 'Your club made a meaningful leaderboard move',
        extra:
          milestone === 'club_movement'
            ? 'Your club moved up by at least three places on the global all-time board.'
            : 'Rankings reward distinct, verified activity and are not based on raw STS.',
      },
      link: '/leaderboards',
      entityType: 'leaderboard',
      entityId: `${category}:global:all_time:${milestone}`,
    });
  }
}

export interface BuildSummary {
  runs: number;
  entries: number;
  contributionRows: number;
}

/** Fixed-query, bounded source load; all scope/period/category variants are ranked in memory. */
export async function buildAllLeaderboards(): Promise<BuildSummary> {
  const settings = await getLeaderboardSettings();
  if (!settings.enabled) return { runs: 0, entries: 0, contributionRows: 0 };
  if (settings.activeVersion !== LEADERBOARD_ALGORITHM_VERSION)
    throw new Error(
      'Unsupported active leaderboard scoring version. Activate an existing compatible snapshot instead.',
    );
  const contributionRows = await recomputeAllContributions();
  const source = await loadSources(settings.maxSubjects);
  const now = new Date();
  const db = createServiceClient();
  const allPlayerSubjects = playerSubjects(
    source,
    'players',
    now,
    settings.minAge,
    settings.excludeUnknownDob,
    settings.cityRegionMap,
  );
  const clubs = clubSubjects(source, settings.cityRegionMap);
  // Scope controls are public metadata. Derive them only from subjects that may appear publicly so
  // opted-out, private, restricted, deleted, under-age, or otherwise ineligible records cannot
  // create an empty city/region label in the public selector.
  const { cities, regions } = derivePublicLeaderboardScopes(
    [...allPlayerSubjects, ...clubs],
    settings.maxScopes,
  );
  const scopes: { type: LeaderboardScope; value: string | null }[] = [
    { type: 'global', value: null },
    ...cities.map((value) => ({ type: 'city' as const, value })),
    ...regions.map((value) => ({ type: 'region' as const, value })),
  ];
  const fingerprint = createHash('sha256').update(JSON.stringify(settings)).digest('hex');
  const staleAfter = new Date(now.getTime() + settings.cadenceHours * 3_600_000).toISOString();
  let runs = 0;
  let entries = 0;
  for (const category of ['players', 'community', 'clubs'] as const) {
    if (settings.paused[category]) continue;
    const baseSubjects =
      category === 'clubs'
        ? clubs
        : playerSubjects(
            source,
            category,
            now,
            settings.minAge,
            settings.excludeUnknownDob,
            settings.cityRegionMap,
          );
    const periods: LeaderboardPeriod[] =
      category === 'community' ? ['all_time'] : ['month', 'season', 'all_time'];
    const factsByPeriod = new Map(
      periods.map((period) => [
        period,
        makeFacts(
          category,
          baseSubjects,
          source,
          periodCutoff(period, now, settings.monthDays, settings.seasonStart),
        ),
      ]),
    );
    for (const scope of scopes) {
      const scopedSubjects = baseSubjects.filter((subject) =>
        scopeMatches(subject, scope.type, scope.value),
      );
      if (!scopedSubjects.length && scope.type !== 'global') continue;
      for (const period of periods) {
        const scopedIds = new Set(scopedSubjects.map((subject) => subject.id));
        const facts = (factsByPeriod.get(period) ?? []).filter((fact) =>
          scopedIds.has(fact.subjectId),
        );
        const privateRows = rankLeaderboard(facts, {
          weights: settings.weights[category],
          minimumScore: settings.minimumScores[category],
          maximumComponentValue: settings.componentCaps[category] ?? settings.componentCap,
        });
        const publicIds = new Set(
          scopedSubjects.filter((subject) => subject.publicEligible).map((subject) => subject.id),
        );
        const publicRows = rankLeaderboard(
          facts.map((fact) => ({ ...fact, eligible: publicIds.has(fact.subjectId) })),
          {
            weights: settings.weights[category],
            minimumScore: settings.minimumScores[category],
            maximumComponentValue: settings.componentCaps[category] ?? settings.componentCap,
          },
        ).slice(0, settings.fullLimit);
        const subjects = new Map(scopedSubjects.map((subject) => [subject.id, subject]));
        const previous = new Map<string, number>();
        if (scope.type === 'global' && period === 'all_time') {
          const { data: oldRun } = await db
            .from('leaderboard_snapshot_runs')
            .select('id')
            .eq('category', category)
            .eq('scope_type', 'global')
            .is('scope_value', null)
            .eq('period', 'all_time')
            .eq('active', true)
            .maybeSingle();
          if (oldRun) {
            const { data: oldRows } = await db
              .from('leaderboard_snapshot_entries')
              .select('subject_id, rank')
              .eq('run_id', String((oldRun as Row).id));
            for (const row of (oldRows ?? []) as Row[])
              previous.set(String(row.subject_id), Number(row.rank));
          }
        }
        const payloadEntries = publicRows.map((row) => {
          const subject = subjects.get(row.subjectId)!;
          return {
            subject_type: subject.kind,
            subject_id: subject.id,
            rank: row.rank,
            score: row.score,
            components: row.components,
            explanation: row.explanation,
            display_name: subject.name,
            slug: subject.slug,
            image_path: subject.imagePath,
            city: subject.city,
            region: subject.region,
          };
        });
        const privateMap = new Map(privateRows.map((row) => [row.subjectId, row]));
        const momentum =
          category === 'clubs'
            ? []
            : scopedSubjects.map((subject) => {
                const row = privateMap.get(subject.id);
                return {
                  player_id: subject.id,
                  eligible_public: subject.publicEligible,
                  exclusion_code: subject.exclusionCode,
                  private_rank: row?.rank ?? null,
                  score: row?.score ?? 0,
                  components: row?.components ?? {},
                  cta_key: leaderboardCta(category, row?.components ?? {}),
                };
              });
        const { error } = await db.rpc('publish_leaderboard_snapshot', {
          p_scoring_version: LEADERBOARD_ALGORITHM_VERSION,
          p_category: category,
          p_scope_type: scope.type,
          p_scope_value: scope.value,
          p_period: period,
          p_settings_fingerprint: fingerprint,
          p_source_cutoff: now.toISOString(),
          p_stale_after: staleAfter,
          p_entries: payloadEntries,
          p_momentum: momentum,
        });
        // Carry the real Postgres reason, not just which snapshot failed - a rebuild that dies here
        // used to store only 'BUILD_FAILED' with the actual cause discarded (master_plan §2H).
        if (error)
          throw new Error(
            `Snapshot publish failed for ${category}/${scope.type}/${period}: ${error.message}` +
              `${error.code ? ` [${error.code}]` : ''}${error.details ? ` - ${error.details}` : ''}` +
              `${error.hint ? ` (hint: ${error.hint})` : ''}`,
          );
        runs += 1;
        entries += publicRows.length;
        if (scope.type === 'global' && period === 'all_time' && settings.milestoneNotifications)
          await milestoneNotifications(
            category,
            publicRows,
            previous,
            source,
            settings.clubMovementNotifyPlaces,
          );
      }
    }
  }
  return { runs, entries, contributionRows };
}
