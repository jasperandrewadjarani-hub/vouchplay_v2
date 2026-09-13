import 'server-only';
import { cache } from 'react';
import {
  scorePartnerCandidate,
  comparePartnerScores,
  evaluateDivisionFit,
  effectivePlayerSkill,
  ageAtDate,
  type PartnerScoreInput,
  type DivisionFitResult,
} from '@vouchplay/core';
import { skillByOrdinal, parseVisibility, fieldVisible, type SkillBand } from '@vouchplay/config';
import { createServiceClient } from '@/lib/supabase/service';
import { avatarUrl } from '@/lib/storage';
import { getPartnerSettings, getEligibilitySettings, getLeaderboardSettings } from '@/lib/settings';
import { getTournamentRules, type TournamentRules } from '@/lib/tournaments/queries';
import { divisionName } from '@/lib/tournaments/dto';
import { getSlotsByRegistration } from '@/lib/payments/slots';
import type {
  PartnerCard,
  PartnerDeckData,
  PartnerDivisionRef,
  PartnerMatchDoor,
  PartnerMatchView,
} from './types';

/**
 * Partner matchmaking deck (master_plan §2AV). Every read here is bounded and column-explicit -
 * never `select('*')` (handover §34A/§35) - and this module never trusts a client-supplied division
 * or player id without re-checking fit/blocks/account status server-side (§2AV I: "fit is re-checked
 * at the door").
 */

const MAX_SEARCHES = 200;
const MAX_CARDS = 30;
const DOUBLES = 'doubles';

// ---------------------------------------------------------------------------
// Manila-day boundary (§2AV F: the daily swipe limit resets on the Manila calendar day, mirroring the
// PH_UTC_OFFSET_MINUTES convention in packages/core/src/time/ph-time.ts - a fixed +8, no DST, so a
// constant offset is exact without depending on the host's timezone database).
// ---------------------------------------------------------------------------
const PH_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC instant of the start of "today" in Manila, for `now` (defaults to the current time). */
export function manilaDayStartIso(now: Date = new Date()): string {
  const shifted = now.getTime() + PH_UTC_OFFSET_MS;
  const dayStartShifted = Math.floor(shifted / DAY_MS) * DAY_MS;
  return new Date(dayStartShifted - PH_UTC_OFFSET_MS).toISOString();
}

// ---------------------------------------------------------------------------
// Small, dependency-free row shapes (no generated DB types exist yet for these 0047 tables) - the
// same inline-cast convention every other query module in this codebase uses for narrow selects.
// ---------------------------------------------------------------------------

interface TournamentMiniRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  start_at: string | null;
  /** Organizer per-tournament switch (migration 0048; master_plan §2AV addendum 3). Read
   *  defensively in `loadTournament` - null (column missing pre-migration, or unset) defaults on. */
  partner_matchmaking_enabled: boolean | null;
}

export interface PartnerEligibleDivisionRow {
  id: string;
  name_override: string | null;
  skill_policy: string;
  minimum_skill: number | null;
  maximum_skill: number | null;
  format: string;
  sex_classification: string;
  minimum_age: number | null;
  maximum_age: number | null;
  status: string;
}
type DivisionRow = PartnerEligibleDivisionRow;

interface ProfileRow {
  id: string;
  slug: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  avatar_path: string | null;
  sex: 'male' | 'female' | null;
  city: string | null;
  date_of_birth: string | null;
  self_rated_skill: number | null;
  account_status: string;
  onboarded_at: string | null;
  guest_created_at: string | null;
  profile_visibility: unknown;
}

interface SkillRow {
  player_id: string;
  community_skill_level: number | null;
  sts: number | string | null;
  skill_verified: boolean | null;
  coach_vouch_count: number | null;
}

interface SearchRow {
  id: string;
  player_id: string;
  division_ids: string[] | null;
  note: string | null;
  status: string;
  last_active_at: string;
  created_at: string;
}

interface SwipeRow {
  swiper_id: string;
  target_id: string;
  direction: 'left' | 'right';
  created_at: string;
  updated_at: string;
}

/** Exported so `lib/partners/maintenance.ts` can share the exact row shape `promoteEnteredMatchesForTournament`
 *  reads and writes - one definition of a match row, not two that could drift apart. */
export interface PartnerMatchRow {
  id: string;
  tournament_id: string;
  player_a: string;
  player_b: string;
  division_ids: string[] | null;
  status: string;
  closed_reason: string | null;
  door: unknown;
  matched_at: string;
  updated_at: string;
}
type MatchRow = PartnerMatchRow;

/** The door as stored on `partner_matches.door` (master_plan §2AV F) - viewer-agnostic, so the deck
 *  maps it per viewer (`mapMatchDoorForViewer`). Shared with `actions/partners.ts`, which writes it. */
export type StoredMatchDoor =
  | {
      kind: 'invited';
      inviterId: string;
      registrationId: string | null;
      divisionId: string;
      invitationId?: string;
      fallbackReason?: string;
    }
  | { kind: 'enter_together'; divisionId: string; fallbackReason?: string }
  | { kind: 'entered' }
  | { kind: 'closed'; reason: string };

function parseStoredDoor(raw: unknown): StoredMatchDoor {
  const d = (raw ?? {}) as Partial<StoredMatchDoor> & { kind?: string };
  if (d.kind === 'invited' && typeof (d as { inviterId?: unknown }).inviterId === 'string') {
    return d as StoredMatchDoor & { kind: 'invited' };
  }
  if (
    d.kind === 'enter_together' &&
    typeof (d as { divisionId?: unknown }).divisionId === 'string'
  ) {
    return d as StoredMatchDoor & { kind: 'enter_together' };
  }
  if (d.kind === 'entered') return { kind: 'entered' };
  if (d.kind === 'closed')
    return { kind: 'closed', reason: String((d as { reason?: unknown }).reason ?? '') };
  // Defensive fallback - an empty/malformed door reads as closed rather than crashing the deck.
  return { kind: 'closed', reason: 'unknown' };
}

/** Map the viewer-agnostic stored door to what THIS viewer should see (§2AV F: "the href must use
 *  the OTHER player's slug"). Exported for `actions/partners.ts` to build the just-created match's
 *  view without a second round trip. */
export function mapMatchDoorForViewer(
  door: StoredMatchDoor,
  viewerId: string,
  otherSlug: string | null,
  tournamentSlug: string,
): PartnerMatchDoor {
  switch (door.kind) {
    case 'invited':
      return {
        kind: 'invited',
        byViewer: door.inviterId === viewerId,
        registrationId: door.registrationId ?? null,
      };
    case 'enter_together':
      return {
        kind: 'enter_together',
        href: otherSlug
          ? `/tournaments/${tournamentSlug}?register=1&division=${door.divisionId}&partner=${otherSlug}`
          : `/tournaments/${tournamentSlug}?register=1&division=${door.divisionId}`,
      };
    case 'entered':
      return { kind: 'entered' };
    case 'closed':
      return { kind: 'closed', reason: door.reason };
  }
}

// ---------------------------------------------------------------------------
// Name / initials - the same inline convention `registration-queries.ts`'s `resolve()` uses (never
// imported from `lib/players/dto.ts`, whose equivalents are either typed against the full generated
// `ProfileRow` or private).
// ---------------------------------------------------------------------------
function displayNameOf(p: {
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
}): string {
  return (
    [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.nickname || 'VouchPlay player'
  );
}
function initialsOf(p: {
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
}): string {
  const a = p.first_name?.trim()?.[0] ?? '';
  const b = p.last_name?.trim()?.[0] ?? '';
  const combined = `${a}${b}`.toUpperCase();
  if (combined) return combined;
  return (p.nickname?.trim()?.[0] ?? '?').toUpperCase();
}

// ---------------------------------------------------------------------------
// Bulk loaders
// ---------------------------------------------------------------------------

/** Defensive read: `tournaments.partner_matchmaking_enabled` (migration 0048; master_plan §2AV
 *  addendum 3) may not exist yet - the same precedent as `confirmation_email_enabled` (migration
 *  0044): try the full select, and on error (column missing pre-migration) re-select without it,
 *  defaulting the flag to null (fail-open to true wherever it is read). */
async function loadTournament(slug: string): Promise<TournamentMiniRow | null> {
  const svc = createServiceClient();
  try {
    const { data, error } = await svc
      .from('tournaments')
      .select('id, slug, name, status, start_at, partner_matchmaking_enabled')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw error;
    return (data as TournamentMiniRow | null) ?? null;
  } catch {
    // Column not present yet (migration 0048 pending) - re-select without it, still defaulting on.
    const { data } = await svc
      .from('tournaments')
      .select('id, slug, name, status, start_at')
      .eq('slug', slug)
      .maybeSingle();
    if (!data) return null;
    return {
      ...(data as Omit<TournamentMiniRow, 'partner_matchmaking_enabled'>),
      partner_matchmaking_enabled: null,
    };
  }
}

/** Open doubles divisions for a tournament (master_plan §2AV, the hard-filter universe). */
export async function loadEligibleDivisions(tournamentId: string): Promise<DivisionRow[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('divisions')
    .select(
      'id, name_override, skill_policy, minimum_skill, maximum_skill, format, sex_classification, minimum_age, maximum_age, status',
    )
    .eq('tournament_id', tournamentId)
    .eq('format', DOUBLES)
    .eq('status', 'open');
  return (data ?? []) as DivisionRow[];
}

/** Any division on the tournament, by id (for a match's stored `division_ids`, which may no longer be
 *  open by the time a card is rendered - a closed match still needs to say what it was for). */
async function loadDivisionsByIds(divisionIds: string[]): Promise<Map<string, DivisionRow>> {
  const map = new Map<string, DivisionRow>();
  const ids = Array.from(new Set(divisionIds.filter(Boolean)));
  if (ids.length === 0) return map;
  const svc = createServiceClient();
  const { data } = await svc
    .from('divisions')
    .select(
      'id, name_override, skill_policy, minimum_skill, maximum_skill, format, sex_classification, minimum_age, maximum_age, status',
    )
    .in('id', ids);
  for (const d of (data ?? []) as DivisionRow[]) map.set(d.id, d);
  return map;
}

async function loadProfiles(ids: string[]): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return map;
  const svc = createServiceClient();
  const { data } = await svc
    .from('profiles')
    .select(
      'id, slug, first_name, last_name, nickname, avatar_path, sex, city, date_of_birth, self_rated_skill, account_status, onboarded_at, guest_created_at, profile_visibility',
    )
    .in('id', unique);
  for (const p of (data ?? []) as unknown as ProfileRow[]) map.set(p.id, p);
  return map;
}

async function loadSkillRows(ids: string[]): Promise<Map<string, SkillRow>> {
  const map = new Map<string, SkillRow>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return map;
  const svc = createServiceClient();
  const { data } = await svc
    .from('player_skill_profiles')
    .select('player_id, community_skill_level, sts, skill_verified, coach_vouch_count')
    .in('player_id', unique);
  for (const r of (data ?? []) as SkillRow[]) map.set(r.player_id, r);
  return map;
}

interface PublicFacts {
  identityVerified: boolean;
}

/** Identity verification, via the same RLS-clean `public_player_facts` RPC the directory uses
 *  (`lib/players/queries.ts`) - safe to call with the service client too (never revoked from PUBLIC). */
async function loadPublicFacts(ids: string[]): Promise<Map<string, PublicFacts>> {
  const map = new Map<string, PublicFacts>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return map;
  try {
    const svc = createServiceClient();
    const { data, error } = await svc.rpc('public_player_facts', { ids: unique });
    if (error || !data) return map;
    for (const row of data as { user_id: string; identity_verified: boolean }[]) {
      map.set(row.user_id, { identityVerified: !!row.identity_verified });
    }
  } catch {
    // Facts are decoration for the trust term / badge - degrade to "not verified" rather than fail.
  }
  return map;
}

/** Bidirectional blocks between the viewer and a bounded candidate set, one read each direction
 *  (master_plan §2AV I: "blocked pairs never see each other"). */
async function loadBlockedPairs(viewerId: string, candidateIds: string[]): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (candidateIds.length === 0) return blocked;
  const svc = createServiceClient();
  const [{ data: byViewer }, { data: onViewer }] = await Promise.all([
    svc
      .from('blocks')
      .select('blocked_id')
      .eq('blocker_id', viewerId)
      .in('blocked_id', candidateIds),
    svc
      .from('blocks')
      .select('blocker_id')
      .eq('blocked_id', viewerId)
      .in('blocker_id', candidateIds),
  ]);
  for (const r of (byViewer ?? []) as { blocked_id: string }[]) blocked.add(r.blocked_id);
  for (const r of (onViewer ?? []) as { blocker_id: string }[]) blocked.add(r.blocker_id);
  return blocked;
}

/**
 * Live solo teams (master_plan §2AV Ground truth 1, §2AT A `mergeable_solo_team`): for each player in
 * `playerIds`, the division ids (restricted to `divisionIds`) where they hold a team with exactly one
 * confirmed member (themselves), no pending invitation, and no paid TEAM receipt. Replicated with
 * bounded reads rather than one `mergeable_solo_team()` RPC call per (player, division) pair - the SQL
 * predicate is the single source of truth this mirrors exactly (see migration 0045).
 */
export async function loadLiveSoloTeams(
  tournamentId: string,
  divisionIds: string[],
  playerIds: string[],
): Promise<
  Map<string, Map<string, { teamId: string; registrationId: string | null; paid: boolean }>>
> {
  const result = new Map<
    string,
    Map<string, { teamId: string; registrationId: string | null; paid: boolean }>
  >();
  const divIds = Array.from(new Set(divisionIds.filter(Boolean)));
  const players = new Set(playerIds.filter(Boolean));
  if (divIds.length === 0 || players.size === 0) return result;

  const svc = createServiceClient();
  const { data: teamRows } = await svc
    .from('teams')
    .select('id, division_id, status')
    .eq('tournament_id', tournamentId)
    .in('division_id', divIds)
    .in('status', ['forming', 'formed', 'locked']);
  const teams = (teamRows ?? []) as { id: string; division_id: string; status: string }[];
  if (teams.length === 0) return result;
  const teamIds = teams.map((t) => t.id);

  const { data: memberRows } = await svc
    .from('team_members')
    .select('team_id, player_id, confirmed_at')
    .in('team_id', teamIds);
  const members = (memberRows ?? []) as {
    team_id: string;
    player_id: string;
    confirmed_at: string | null;
  }[];
  const membersByTeam = new Map<string, typeof members>();
  for (const m of members) {
    const list = membersByTeam.get(m.team_id) ?? [];
    list.push(m);
    membersByTeam.set(m.team_id, list);
  }

  // Candidate solo teams: exactly one membership row on the whole team, confirmed, and it is one of
  // the players we care about.
  const soloTeams = teams.filter((t) => {
    const list = membersByTeam.get(t.id) ?? [];
    const only = list[0];
    return list.length === 1 && !!only && !!only.confirmed_at && players.has(only.player_id);
  });
  if (soloTeams.length === 0) return result;
  const soloTeamIds = soloTeams.map((t) => t.id);

  const [{ data: sentInvites }, { data: regRows }] = await Promise.all([
    svc
      .from('partner_invitations')
      .select('team_id')
      .in('team_id', soloTeamIds)
      .eq('status', 'sent'),
    svc
      .from('registrations')
      .select('id, team_id, status')
      .in('team_id', soloTeamIds)
      .not('status', 'in', '(withdrawn,cancelled,rejected)'),
  ]);
  const invitedTeamIds = new Set(
    ((sentInvites ?? []) as { team_id: string | null }[]).map((r) => r.team_id),
  );
  const regs = (regRows ?? []) as { id: string; team_id: string; status: string }[];
  const regByTeam = new Map(regs.map((r) => [r.team_id, r]));
  const regIds = regs.map((r) => r.id);

  const [{ data: teamPayRows }, slotsByReg] = await Promise.all([
    regIds.length
      ? svc
          .from('payments')
          .select('registration_id, status')
          .in('registration_id', regIds)
          .in('status', ['submitted', 'verified'])
      : Promise.resolve({ data: [] }),
    getSlotsByRegistration(regIds),
  ]);
  // A team receipt in the organizer's hands - mergeable_solo_team must not treat this as free supply.
  const paidTeamRegIds = new Set(
    ((teamPayRows ?? []) as { registration_id: string }[]).map((r) => r.registration_id),
  );
  const paidTeamTeamIds = new Set(
    regs.filter((r) => paidTeamRegIds.has(r.id)).map((r) => r.team_id),
  );

  for (const t of soloTeams) {
    if (invitedTeamIds.has(t.id) || paidTeamTeamIds.has(t.id)) continue;
    const sole = (membersByTeam.get(t.id) ?? [])[0];
    if (!sole) continue;
    const reg = regByTeam.get(t.id) ?? null;
    let paid = false;
    if (reg) {
      if (reg.status === 'confirmed') paid = true;
      else {
        const slots = slotsByReg.get(reg.id) ?? [];
        paid = slots.some((s) => s.player_id === sole.player_id && s.status === 'verified');
      }
    }
    const byPlayer = result.get(sole.player_id) ?? new Map();
    byPlayer.set(t.division_id, { teamId: t.id, registrationId: reg?.id ?? null, paid });
    result.set(sole.player_id, byPlayer);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Fit / effective divisions (master_plan §2AV C)
// ---------------------------------------------------------------------------

interface FitProfile {
  id: string;
  sex: 'male' | 'female' | null;
  effectiveSkill: number | null;
  ageAtStart: number | null;
}

function toFitProfile(
  id: string,
  profile: ProfileRow,
  tournamentStartAt: string | null,
  skill: SkillRow | undefined,
): FitProfile {
  return {
    id,
    sex: profile.sex,
    effectiveSkill: effectivePlayerSkill(
      skill?.community_skill_level ?? null,
      profile.self_rated_skill,
    ),
    ageAtStart: ageAtDate(profile.date_of_birth, tournamentStartAt),
  };
}

function soloFit(
  profile: FitProfile,
  division: DivisionRow,
  rules: TournamentRules,
): DivisionFitResult {
  return evaluateDivisionFit({
    playerSex: profile.sex,
    effectiveSkill: profile.effectiveSkill,
    sexClassification: division.sex_classification,
    skillPolicy: division.skill_policy,
    divisionMinimumSkill: division.minimum_skill,
    divisionMaximumSkill: division.maximum_skill,
    enforceSkillFloor: rules.enforceSkillFloor,
    allowPlayDownOneLevel: rules.allowPlayDownOneLevel,
    ageAtStart: profile.ageAtStart,
    divisionMinimumAge: division.minimum_age,
    divisionMaximumAge: division.maximum_age,
  });
}

function pairFit(
  profile: FitProfile,
  partner: FitProfile,
  division: DivisionRow,
  rules: TournamentRules,
): DivisionFitResult {
  return evaluateDivisionFit({
    playerSex: profile.sex,
    effectiveSkill: profile.effectiveSkill,
    sexClassification: division.sex_classification,
    skillPolicy: division.skill_policy,
    divisionMinimumSkill: division.minimum_skill,
    divisionMaximumSkill: division.maximum_skill,
    enforceSkillFloor: rules.enforceSkillFloor,
    allowPlayDownOneLevel: rules.allowPlayDownOneLevel,
    partnerSex: partner.sex,
    format: DOUBLES,
    ageAtStart: profile.ageAtStart,
    divisionMinimumAge: division.minimum_age,
    divisionMaximumAge: division.maximum_age,
  });
}

function isRecommended(fit: DivisionFitResult): boolean {
  return fit.fits && !fit.playingUp && !fit.playingDown;
}

/** Effective divisions (§2AV C): the player's live seat divisions when they hold any, else their
 *  chosen search divisions (intersected with what is still open/doubles). */
function effectiveDivisionIds(
  playerId: string,
  seatDivisionsByPlayer: Map<string, Map<string, unknown>>,
  chosenDivisionIds: string[],
  eligibleIds: Set<string>,
): string[] {
  const seats = seatDivisionsByPlayer.get(playerId);
  if (seats && seats.size > 0) return Array.from(seats.keys());
  return chosenDivisionIds.filter((id) => eligibleIds.has(id));
}

interface CommonDivision {
  id: string;
  name: string;
  recommendedForA: boolean;
  recommendedForB: boolean;
}

/** Divisions both players want AND both fit with each other as partner (§2AV C). */
function commonDivisionsFor(
  a: FitProfile,
  b: FitProfile,
  effectiveA: string[],
  effectiveB: string[],
  divisionsById: Map<string, DivisionRow>,
  rules: TournamentRules,
): CommonDivision[] {
  const setB = new Set(effectiveB);
  const out: CommonDivision[] = [];
  for (const id of effectiveA) {
    if (!setB.has(id)) continue;
    const division = divisionsById.get(id);
    if (!division) continue;
    const aFitsWithB = pairFit(a, b, division, rules);
    const bFitsWithA = pairFit(b, a, division, rules);
    if (!aFitsWithB.fits || !bFitsWithA.fits) continue;
    out.push({
      id,
      name: divisionName(division),
      recommendedForA: isRecommended(soloFit(a, division, rules)),
      recommendedForB: isRecommended(soloFit(b, division, rules)),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Standalone pair computation - used at match time (`actions/partners.ts`), independent of any
// already-loaded deck (master_plan §2AV F: "recompute with the same helper as the deck").
// ---------------------------------------------------------------------------
export async function computeCommonDivisions(
  tournamentId: string,
  aId: string,
  bId: string,
): Promise<{ id: string; name: string; recommendedForA: boolean; recommendedForB: boolean }[]> {
  const svc = createServiceClient();
  const [{ data: tRow }, divisions, rules] = await Promise.all([
    svc.from('tournaments').select('start_at').eq('id', tournamentId).maybeSingle(),
    loadEligibleDivisions(tournamentId),
    getTournamentRules(tournamentId),
  ]);
  const startAt = (tRow as { start_at: string | null } | null)?.start_at ?? null;
  const eligibleIds = new Set(divisions.map((d) => d.id));
  const divisionsById = new Map(divisions.map((d) => [d.id, d]));

  const [profiles, skills, seatMap, searchRows] = await Promise.all([
    loadProfiles([aId, bId]),
    loadSkillRows([aId, bId]),
    loadLiveSoloTeams(tournamentId, Array.from(eligibleIds), [aId, bId]),
    svc.from('partner_searches').select('player_id, division_ids').in('player_id', [aId, bId]),
  ]);
  const chosenByPlayer = new Map<string, string[]>();
  for (const r of (searchRows.data ?? []) as {
    player_id: string;
    division_ids: string[] | null;
  }[]) {
    chosenByPlayer.set(r.player_id, r.division_ids ?? []);
  }

  const pa = profiles.get(aId);
  const pb = profiles.get(bId);
  if (!pa || !pb) return [];
  const fitA = toFitProfile(aId, pa, startAt, skills.get(aId));
  const fitB = toFitProfile(bId, pb, startAt, skills.get(bId));
  const effA = effectiveDivisionIds(aId, seatMap, chosenByPlayer.get(aId) ?? [], eligibleIds);
  const effB = effectiveDivisionIds(bId, seatMap, chosenByPlayer.get(bId) ?? [], eligibleIds);
  return commonDivisionsFor(fitA, fitB, effA, effB, divisionsById, rules);
}

// ---------------------------------------------------------------------------
// The deck
// ---------------------------------------------------------------------------

function emptyDeck(
  tournament: {
    id: string;
    slug: string;
    name: string;
    registrationOpen: boolean;
  },
  offForTournament = false,
): PartnerDeckData {
  return {
    enabled: false,
    tournament,
    eligibleDivisions: [],
    search: null,
    cards: [],
    lookingCount: 0,
    matches: [],
    swipesLeftToday: 0,
    canUndo: false,
    offForTournament,
  };
}

interface SupplyCandidate {
  playerId: string;
  /** Declared or locked divisions; empty = "any division this player fits" (a global looker). */
  divisionIds: string[];
  note: string | null;
  lastActiveAt: string;
  /** Tied to THIS tournament (search / open seat / paid slot) - counts as "looking here". A global
   *  looker fills the deck for cold-start but is not counted. */
  tournamentSpecific: boolean;
}

/**
 * The partner-deck supply for a tournament (master_plan §2AV, cold-start fix). A brand-new opt-in
 * feature is empty until people opt in, and nobody opts into an empty deck - so the deck is seeded
 * from the population already available to partner by their own prior actions:
 *  1. an open partner search here (explicit opt-in);
 *  2. a live open-seat solo entry in an open doubles division ("no partner yet" - their entry's
 *     division is locked, the same money rule as a seat);
 *  3. a paid / awaiting bare reservation with no team yet ("bought their slot only");
 *  4. a profile flagged "looking for a partner" globally (any division they fit).
 * (1)-(3) are tournament-specific and count as "looking here"; (4) fills the deck but is not counted.
 * Every candidate is still hard-filtered by division fit downstream, so an ill-fitting global looker
 * never actually appears. All reads bounded; never throws (a failure yields whatever was gathered).
 */
async function loadSupplyCandidates(
  tournamentId: string,
  eligibleDivisionIds: Set<string>,
): Promise<Map<string, SupplyCandidate>> {
  const svc = createServiceClient();
  const map = new Map<string, SupplyCandidate>();
  const merge = (c: SupplyCandidate) => {
    const existing = map.get(c.playerId);
    if (!existing) {
      map.set(c.playerId, c);
      return;
    }
    existing.divisionIds = Array.from(new Set([...existing.divisionIds, ...c.divisionIds]));
    existing.tournamentSpecific = existing.tournamentSpecific || c.tournamentSpecific;
    existing.note = existing.note ?? c.note;
    if ((c.lastActiveAt ?? '') > (existing.lastActiveAt ?? ''))
      existing.lastActiveAt = c.lastActiveAt;
  };

  // 1. Explicit searches.
  try {
    const { data } = await svc
      .from('partner_searches')
      .select('player_id, division_ids, note, last_active_at')
      .eq('tournament_id', tournamentId)
      .eq('status', 'open')
      .order('last_active_at', { ascending: false })
      .limit(MAX_SEARCHES);
    for (const s of (data ?? []) as {
      player_id: string;
      division_ids: string[] | null;
      note: string | null;
      last_active_at: string;
    }[]) {
      merge({
        playerId: s.player_id,
        divisionIds: (s.division_ids ?? []).filter((id) => eligibleDivisionIds.has(id)),
        note: s.note,
        lastActiveAt: s.last_active_at,
        tournamentSpecific: true,
      });
    }
  } catch {
    /* fail open */
  }

  // 2. Open-seat solo entries: a live team in an eligible division with exactly one confirmed member.
  if (eligibleDivisionIds.size > 0) {
    try {
      const { data: teamRows } = await svc
        .from('teams')
        .select('id, division_id, status, updated_at, created_at')
        .eq('tournament_id', tournamentId)
        .in('division_id', Array.from(eligibleDivisionIds))
        .in('status', ['forming', 'formed', 'locked'])
        .limit(500);
      const teams = (teamRows ?? []) as {
        id: string;
        division_id: string;
        updated_at: string | null;
        created_at: string;
      }[];
      if (teams.length > 0) {
        const { data: memberRows } = await svc
          .from('team_members')
          .select('team_id, player_id, confirmed_at')
          .in(
            'team_id',
            teams.map((t) => t.id),
          )
          .not('confirmed_at', 'is', null)
          .limit(2000);
        const membersByTeam = new Map<string, string[]>();
        for (const m of (memberRows ?? []) as { team_id: string; player_id: string }[]) {
          const arr = membersByTeam.get(m.team_id) ?? [];
          arr.push(m.player_id);
          membersByTeam.set(m.team_id, arr);
        }
        for (const t of teams) {
          const members = membersByTeam.get(t.id) ?? [];
          if (members.length !== 1) continue; // an open seat = one confirmed player, one empty slot
          merge({
            playerId: members[0]!,
            divisionIds: [t.division_id],
            note: null,
            lastActiveAt: t.updated_at ?? t.created_at,
            tournamentSpecific: true,
          });
        }
      }
    } catch {
      /* fail open */
    }
  }

  // 3. Bare reservations ("bought their slot only"): a paid/awaiting slot with no team yet.
  try {
    const { data } = await svc
      .from('tournament_slots')
      .select('player_id, division_id, status, created_at')
      .eq('tournament_id', tournamentId)
      .is('registration_id', null)
      .in('status', ['submitted', 'verified'])
      .limit(500);
    for (const s of (data ?? []) as {
      player_id: string;
      division_id: string | null;
      created_at: string;
    }[]) {
      merge({
        playerId: s.player_id,
        divisionIds: s.division_id && eligibleDivisionIds.has(s.division_id) ? [s.division_id] : [],
        note: null,
        lastActiveAt: s.created_at,
        tournamentSpecific: true,
      });
    }
  } catch {
    /* fail open */
  }

  // 4. Globally looking players (any division they fit). Bounded; not tournament-specific.
  try {
    const { data } = await svc
      .from('profiles')
      .select('id, updated_at')
      .eq('looking_for_partner', true)
      .eq('account_status', 'active')
      .not('onboarded_at', 'is', null)
      .limit(300);
    for (const p of (data ?? []) as { id: string; updated_at: string | null }[]) {
      merge({
        playerId: p.id,
        divisionIds: [],
        note: null,
        lastActiveAt: p.updated_at ?? '',
        tournamentSpecific: false,
      });
    }
  } catch {
    /* fail open */
  }

  return map;
}

/** A candidate's effective divisions (master_plan §2AV C, cold-start extension): their live seat
 *  divisions when they hold any (the money rule), else the divisions they declared, else - for a
 *  passive candidate who declared none (a global looker or a slot with no division) - every open
 *  division they fit as a solo, so the pairwise fit filter downstream can still find common ground. */
function candidateEffectiveDivisions(
  candidateId: string,
  candidateFit: FitProfile,
  seatMap: Map<string, Map<string, unknown>>,
  declaredIds: string[],
  divisions: DivisionRow[],
  eligibleIds: Set<string>,
  rules: TournamentRules,
): string[] {
  const seats = seatMap.get(candidateId);
  if (seats && seats.size > 0) return Array.from(seats.keys());
  const declared = declaredIds.filter((id) => eligibleIds.has(id));
  if (declared.length > 0) return declared;
  return divisions.filter((d) => soloFit(candidateFit, d, rules).fits).map((d) => d.id);
}

export async function getPartnerDeck(
  slug: string,
  viewerId: string,
): Promise<PartnerDeckData | null> {
  const tournament = await loadTournament(slug);
  if (!tournament) return null;
  const tMini = {
    id: tournament.id,
    slug: tournament.slug,
    name: tournament.name,
    registrationOpen: tournament.status === 'registration_open',
  };
  // §2AV addendum 3: the organizer's per-tournament switch, read defensively above (fail-open true
  // before migration 0048 is applied). Effective enabled = the Admin global setting AND this column.
  const tournamentEnabled = tournament.partner_matchmaking_enabled ?? true;

  const settings = await getPartnerSettings();
  const viewerProfile = (await loadProfiles([viewerId])).get(viewerId) ?? null;
  // §2AV E: a guest (guest_created_at set, onboarded_at still null) is never enabled - `onboarded_at`
  // being null already covers that case, stated explicitly here to match the brief's own wording.
  const viewerReady =
    !!viewerProfile &&
    viewerProfile.account_status === 'active' &&
    !!viewerProfile.onboarded_at &&
    !(viewerProfile.guest_created_at && !viewerProfile.onboarded_at);
  if (!settings.enabled || !viewerReady) return emptyDeck(tMini);
  // Off specifically because the ORGANIZER turned it off for this tournament (global on, viewer
  // ready) - carry that distinction so the deck page can explain why, instead of the generic message.
  if (!tournamentEnabled) return emptyDeck(tMini, true);

  const divisions = await loadEligibleDivisions(tournament.id);
  const eligibleIds = new Set(divisions.map((d) => d.id));
  const divisionsById = new Map(divisions.map((d) => [d.id, d]));
  const rules = await getTournamentRules(tournament.id);

  const svc = createServiceClient();

  const [viewerSkillRows, viewerSearchRow] = await Promise.all([
    loadSkillRows([viewerId]),
    svc
      .from('partner_searches')
      .select('id, player_id, division_ids, note, status, last_active_at, created_at')
      .eq('tournament_id', tournament.id)
      .eq('player_id', viewerId)
      .maybeSingle(),
  ]);
  const viewerSkill = viewerSkillRows.get(viewerId);
  const viewerSearch = (viewerSearchRow.data as SearchRow | null) ?? null;

  const viewerSeatMap = await loadLiveSoloTeams(tournament.id, Array.from(eligibleIds), [viewerId]);
  const viewerFit = toFitProfile(viewerId, viewerProfile, tournament.start_at, viewerSkill);
  const viewerEffectiveDivisions = effectiveDivisionIds(
    viewerId,
    viewerSeatMap,
    viewerSearch?.division_ids ?? [],
    eligibleIds,
  );

  // Divisions the viewer could choose in the opt-in sheet (master_plan §2AV B): fits (Recommended or
  // Other), or already locked on via a live seat.
  const viewerHasSeatDivisions = viewerSeatMap.get(viewerId) ?? new Map();
  const eligibleDivisions: PartnerDivisionRef[] = divisions
    .map((d) => {
      const fit = soloFit(viewerFit, d, rules);
      const hasSeat = viewerHasSeatDivisions.has(d.id);
      if (!fit.fits && !hasSeat) return null;
      return {
        id: d.id,
        name: divisionName(d),
        recommended: isRecommended(fit),
        viewerHasSeat: hasSeat,
      } satisfies PartnerDivisionRef;
    })
    .filter((d): d is PartnerDivisionRef => d !== null);

  // --- Candidates (master_plan §2AV, cold-start supply) ---------------------------------------
  const supplyByCandidate = await loadSupplyCandidates(tournament.id, eligibleIds);
  supplyByCandidate.delete(viewerId);
  let candidateIds = Array.from(supplyByCandidate.keys());

  const [profiles, skills, blocked, viewerSwipeRows, teammateIds, matchRows] = await Promise.all([
    loadProfiles(candidateIds),
    loadSkillRows(candidateIds),
    loadBlockedPairs(viewerId, candidateIds),
    svc
      .from('partner_swipes')
      .select('target_id, direction, created_at, updated_at')
      .eq('tournament_id', tournament.id)
      .eq('swiper_id', viewerId),
    loadTeammateIds(tournament.id, viewerId),
    svc
      .from('partner_matches')
      .select(
        'id, tournament_id, player_a, player_b, division_ids, status, closed_reason, door, matched_at, updated_at',
      )
      .eq('tournament_id', tournament.id)
      .or(`player_a.eq.${viewerId},player_b.eq.${viewerId}`),
  ]);

  const viewerSwipes = (viewerSwipeRows.data ?? []) as SwipeRow[];
  const leftSwipedRecently = new Set<string>();
  const rightSwiped = new Set<string>();
  const hideBeforeMs = Date.now() - settings.leftSwipeHideDays * DAY_MS;
  for (const s of viewerSwipes) {
    const at = new Date(s.updated_at ?? s.created_at).getTime();
    if (s.direction === 'right') rightSwiped.add(s.target_id);
    else if (Number.isFinite(at) && at >= hideBeforeMs) leftSwipedRecently.add(s.target_id);
  }
  const matchRowsData = (matchRows.data as MatchRow[] | null) ?? [];
  const matchedIds = new Set(
    matchRowsData.map((m) => (m.player_a === viewerId ? m.player_b : m.player_a)),
  );

  candidateIds = candidateIds.filter((id) => {
    const p = profiles.get(id);
    if (!p || p.account_status !== 'active' || !p.onboarded_at) return false;
    if (blocked.has(id)) return false;
    if (teammateIds.has(id)) return false;
    if (leftSwipedRecently.has(id)) return false;
    if (rightSwiped.has(id)) return false;
    if (matchedIds.has(id)) return false;
    return true;
  });

  const candidateSeatMap = await loadLiveSoloTeams(
    tournament.id,
    Array.from(eligibleIds),
    candidateIds,
  );
  const publicFacts = await loadPublicFacts(candidateIds);
  const { thresholds } = await getEligibilitySettings();
  const leaderboardSettings = await getLeaderboardSettings();
  const cityRegionByLowerCity = new Map<string, string>();
  for (const [city, region] of Object.entries(leaderboardSettings.cityRegionMap)) {
    cityRegionByLowerCity.set(city.trim().toLowerCase(), region);
  }
  const regionOf = (city: string | null): string | null => {
    if (!city) return null;
    return cityRegionByLowerCity.get(city.trim().toLowerCase()) ?? null;
  };

  // Reciprocity (§2AV D): every candidate who has already swiped right on the viewer, bounded.
  const { data: reciprocalRows } = candidateIds.length
    ? await svc
        .from('partner_swipes')
        .select('swiper_id, direction')
        .eq('tournament_id', tournament.id)
        .eq('target_id', viewerId)
        .in('swiper_id', candidateIds)
        .eq('direction', 'right')
    : { data: [] };
  const swipedRightOnViewer = new Set(
    ((reciprocalRows ?? []) as { swiper_id: string }[]).map((r) => r.swiper_id),
  );

  const nowIso = new Date().toISOString();
  const cards: PartnerCard[] = [];
  for (const candidateId of candidateIds) {
    const profile = profiles.get(candidateId);
    const supply = supplyByCandidate.get(candidateId);
    if (!profile || !supply) continue;
    const skill = skills.get(candidateId);
    const candidateFit = toFitProfile(candidateId, profile, tournament.start_at, skill);
    const candidateSeats = candidateSeatMap.get(candidateId) ?? new Map();
    const candEffectiveDivisions = candidateEffectiveDivisions(
      candidateId,
      candidateFit,
      candidateSeatMap,
      supply.divisionIds,
      divisions,
      eligibleIds,
      rules,
    );
    const common = commonDivisionsFor(
      viewerFit,
      candidateFit,
      viewerEffectiveDivisions,
      candEffectiveDivisions,
      divisionsById,
      rules,
    );
    if (common.length === 0) continue;

    const commonIds = new Set(common.map((c) => c.id));
    let seat: PartnerCard['seat'] = null;
    let candidateSeatForScore: PartnerScoreInput['candidateSeat'] = null;
    for (const [divisionId, s] of candidateSeats) {
      if (!commonIds.has(divisionId)) continue;
      const division = divisionsById.get(divisionId);
      if (!division) continue;
      seat = { divisionId, divisionName: divisionName(division), paid: s.paid };
      candidateSeatForScore = { divisionId, paid: s.paid };
      break;
    }

    const visibility = parseVisibility(profile.profile_visibility);
    const communityRatingPrivate = !fieldVisible(visibility, 'community_rating');
    const selfRatingPrivate = !fieldVisible(visibility, 'self_rating');
    const communitySkillBand: SkillBand | null =
      skill?.community_skill_level != null
        ? (skillByOrdinal(skill.community_skill_level) ?? null)
        : null;
    const selfRatedSkillBand: SkillBand | null =
      profile.self_rated_skill != null ? (skillByOrdinal(profile.self_rated_skill) ?? null) : null;

    const scoreInput: PartnerScoreInput = {
      commonDivisions: common.map((c) => ({ id: c.id, recommendedForViewer: c.recommendedForA })),
      candidateSeat: candidateSeatForScore,
      viewerSkill: viewerFit.effectiveSkill,
      candidateSkill: candidateFit.effectiveSkill,
      candidateSwipedRightOnViewer: swipedRightOnViewer.has(candidateId),
      sameCity: !!(
        viewerProfile.city &&
        profile.city &&
        viewerProfile.city.trim().toLowerCase() === profile.city.trim().toLowerCase()
      ),
      sameRegion: !!(
        regionOf(viewerProfile.city) && regionOf(viewerProfile.city) === regionOf(profile.city)
      ),
      candidateIdentityVerified: publicFacts.get(candidateId)?.identityVerified ?? false,
      candidateCoachVouched: (skill?.coach_vouch_count ?? 0) > 0,
      candidateStsAtOrAboveThreshold: Number(skill?.sts ?? 0) >= thresholds.reviewBelowSts,
      candidateSearchLastActiveAt: supply.lastActiveAt,
      now: nowIso,
    };
    const { score } = scorePartnerCandidate(scoreInput, settings.weights);

    cards.push({
      playerId: candidateId,
      slug: profile.slug ?? candidateId,
      displayName: displayNameOf(profile),
      initials: initialsOf(profile),
      avatarUrl: avatarUrl(profile.avatar_path),
      sex: profile.sex,
      city: profile.city,
      communitySkill: communityRatingPrivate ? null : communitySkillBand,
      selfRatedSkill: selfRatingPrivate ? null : selfRatedSkillBand,
      communityRatingPrivate,
      selfRatingPrivate,
      sts: skill?.sts != null ? Number(skill.sts) : null,
      identityVerified: publicFacts.get(candidateId)?.identityVerified ?? false,
      coachVouched: (skill?.coach_vouch_count ?? 0) > 0,
      commonDivisions: common.map((c) => ({ id: c.id, name: c.name })),
      seat,
      note: supply.note,
      score,
    });
  }
  cards.sort((a, b) =>
    comparePartnerScores(
      {
        score: a.score,
        lastActiveAt: supplyByCandidate.get(a.playerId)?.lastActiveAt ?? '',
      },
      {
        score: b.score,
        lastActiveAt: supplyByCandidate.get(b.playerId)?.lastActiveAt ?? '',
      },
    ),
  );
  const topCards = cards.slice(0, MAX_CARDS);

  // --- Matches ----------------------------------------------------------------------------------
  const allMatches = matchRowsData;
  const visibleMatches = allMatches.filter((m) => {
    if (m.status !== 'closed') return true;
    const closedAt = new Date(m.updated_at).getTime();
    return Number.isFinite(closedAt) && Date.now() - closedAt <= 7 * DAY_MS;
  });
  const promoted = await promoteEnteredMatchesForTournament(tournament.id, visibleMatches);
  const matchPartnerIds = promoted.map((m) => (m.player_a === viewerId ? m.player_b : m.player_a));
  const matchProfiles = await loadProfiles(matchPartnerIds);
  const matchDivisionIds = Array.from(new Set(promoted.flatMap((m) => m.division_ids ?? [])));
  const matchDivisionsById = await loadDivisionsByIds(matchDivisionIds);

  const matches: PartnerMatchView[] = promoted.map((m) => {
    const otherId = m.player_a === viewerId ? m.player_b : m.player_a;
    const other = matchProfiles.get(otherId) ?? null;
    const door = mapMatchDoorForViewer(
      parseStoredDoor(m.door),
      viewerId,
      other?.slug ?? null,
      tournament.slug,
    );
    return {
      id: m.id,
      partner: {
        playerId: otherId,
        slug: other?.slug ?? otherId,
        displayName: other ? displayNameOf(other) : 'VouchPlay player',
        initials: other ? initialsOf(other) : '?',
        avatarUrl: avatarUrl(other?.avatar_path ?? null),
      },
      divisions: (m.division_ids ?? [])
        .map((id) => matchDivisionsById.get(id))
        .filter((d): d is DivisionRow => !!d)
        .map((d) => ({ id: d.id, name: divisionName(d) })),
      matchedAt: m.matched_at,
      status: m.status as 'open' | 'entered' | 'closed',
      door,
    };
  });

  // --- Swipe budget / undo -----------------------------------------------------------------------
  const todayStart = manilaDayStartIso();
  const { count: swipesToday } = await svc
    .from('partner_swipes')
    .select('id', { count: 'exact', head: true })
    .eq('swiper_id', viewerId)
    .eq('tournament_id', tournament.id)
    .gte('created_at', todayStart);
  const swipesLeftToday = Math.max(0, settings.swipeDailyLimit - (swipesToday ?? 0));

  const { data: lastSwipeRow } = await svc
    .from('partner_swipes')
    .select('target_id, direction, updated_at')
    .eq('tournament_id', tournament.id)
    .eq('swiper_id', viewerId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastSwipe = lastSwipeRow as { target_id: string; direction: string } | null;
  const canUndo =
    !!lastSwipe &&
    lastSwipe.direction === 'left' &&
    !allMatches.some(
      (m) => m.player_a === lastSwipe.target_id || m.player_b === lastSwipe.target_id,
    );

  return {
    enabled: true,
    tournament: tMini,
    eligibleDivisions,
    search: viewerSearch
      ? {
          id: viewerSearch.id,
          divisionIds: viewerSearch.division_ids ?? [],
          note: viewerSearch.note,
          status: viewerSearch.status as 'open' | 'closed',
          createdAt: viewerSearch.created_at,
        }
      : null,
    cards: topCards,
    // The header's "N players looking" = everyone the deck can actually offer this viewer (those who
    // fit at least one common division), not the raw opt-in count, so it never says "0 looking" over
    // a full deck (master_plan §2AV cold-start supply).
    lookingCount: cards.length,
    matches,
    swipesLeftToday,
    canUndo,
  };
}

/** Players already sharing a live team with the viewer in this tournament (master_plan §2AV E) - a
 *  confirmed teammate is never a swipe candidate, matched or not. */
async function loadTeammateIds(tournamentId: string, viewerId: string): Promise<Set<string>> {
  const svc = createServiceClient();
  const { data: myMemberRows } = await svc
    .from('team_members')
    .select('team_id')
    .eq('player_id', viewerId);
  const myTeamIds = ((myMemberRows ?? []) as { team_id: string }[]).map((r) => r.team_id);
  if (myTeamIds.length === 0) return new Set();
  const { data: myTeams } = await svc
    .from('teams')
    .select('id')
    .in('id', myTeamIds)
    .eq('tournament_id', tournamentId)
    .in('status', ['forming', 'formed', 'locked']);
  const liveTeamIds = ((myTeams ?? []) as { id: string }[]).map((t) => t.id);
  if (liveTeamIds.length === 0) return new Set();
  const { data: members } = await svc
    .from('team_members')
    .select('team_id, player_id')
    .in('team_id', liveTeamIds);
  const out = new Set<string>();
  for (const m of (members ?? []) as { team_id: string; player_id: string }[]) {
    if (m.player_id !== viewerId) out.add(m.player_id);
  }
  return out;
}

/** master_plan §2AV G: a match becomes `entered` once both players sit on one live team in the
 *  tournament, checked on every deck load (and again by `runPartnerMaintenance`). Mutates the DB and
 *  returns the same list with promoted rows patched in-memory, so this one load never disagrees with
 *  itself about a match it just promoted. */
export async function promoteEnteredMatchesForTournament(
  tournamentId: string,
  matches: PartnerMatchRow[],
): Promise<PartnerMatchRow[]> {
  const openMatches = matches.filter((m) => m.status === 'open');
  if (openMatches.length === 0) return matches;
  const participantIds = Array.from(new Set(openMatches.flatMap((m) => [m.player_a, m.player_b])));
  const svc = createServiceClient();
  const { data: memberRows } = await svc
    .from('team_members')
    .select('team_id, player_id, confirmed_at')
    .in('player_id', participantIds);
  const members = (memberRows ?? []) as {
    team_id: string;
    player_id: string;
    confirmed_at: string | null;
  }[];
  const teamIds = Array.from(new Set(members.map((m) => m.team_id)));
  if (teamIds.length === 0) return matches;
  const { data: teamRows } = await svc
    .from('teams')
    .select('id, tournament_id, status')
    .in('id', teamIds)
    .eq('tournament_id', tournamentId)
    .in('status', ['forming', 'formed', 'locked']);
  const liveTeamIds = new Set(((teamRows ?? []) as { id: string }[]).map((t) => t.id));
  const confirmedTeamsByPlayer = new Map<string, Set<string>>();
  for (const m of members) {
    if (!m.confirmed_at || !liveTeamIds.has(m.team_id)) continue;
    const set = confirmedTeamsByPlayer.get(m.player_id) ?? new Set<string>();
    set.add(m.team_id);
    confirmedTeamsByPlayer.set(m.player_id, set);
  }

  const now = new Date().toISOString();
  const patched = [...matches];
  for (const [i, m] of patched.entries()) {
    if (m.status !== 'open') continue;
    const aTeams = confirmedTeamsByPlayer.get(m.player_a) ?? new Set();
    const bTeams = confirmedTeamsByPlayer.get(m.player_b) ?? new Set();
    const shared = Array.from(aTeams).some((id) => bTeams.has(id));
    if (!shared) continue;
    await svc
      .from('partner_matches')
      .update({ status: 'entered', door: { kind: 'entered' }, updated_at: now })
      .eq('id', m.id);
    patched[i] = { ...m, status: 'entered' as const, door: { kind: 'entered' }, updated_at: now };
  }
  return patched;
}

// ---------------------------------------------------------------------------
// Cheap summaries
// ---------------------------------------------------------------------------

/** Defensive read: `tournaments.partner_matchmaking_enabled` (migration 0048; master_plan §2AV
 *  addendum 3) - the same precedent as `getConfirmationEmailEnabled` (queries.ts, migration 0044):
 *  before the migration is applied the column does not exist, and BOTH that case and an unset flag
 *  degrade to true, the feature's default. */
async function loadTournamentMatchmakingEnabled(tournamentId: string): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient()
      .from('tournaments')
      .select('partner_matchmaking_enabled')
      .eq('id', tournamentId)
      .maybeSingle();
    if (error) throw error;
    return (
      (data as { partner_matchmaking_enabled: boolean | null } | null)
        ?.partner_matchmaking_enabled ?? true
    );
  } catch {
    return true;
  }
}

export const getPartnerSummary = cache(async function getPartnerSummary(
  tournamentId: string,
  viewerId: string | null,
): Promise<{
  enabled: boolean;
  lookingCount: number;
  viewerSearchOpen: boolean;
  openMatches: number;
  hasOpenDoublesDivisions: boolean;
}> {
  const settings = await getPartnerSettings();
  const tournamentEnabled = await loadTournamentMatchmakingEnabled(tournamentId);
  const svc = createServiceClient();
  // The eligible (open doubles) divisions bound the supply scan; also answer hasOpenDoublesDivisions.
  const eligibleDivisions = await loadEligibleDivisions(tournamentId);
  const eligibleIds = new Set(eligibleDivisions.map((d) => d.id));
  const [supply, searchRow, { count: openMatches }] = await Promise.all([
    loadSupplyCandidates(tournamentId, eligibleIds),
    viewerId
      ? svc
          .from('partner_searches')
          .select('status')
          .eq('tournament_id', tournamentId)
          .eq('player_id', viewerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    viewerId
      ? svc
          .from('partner_matches')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', tournamentId)
          .eq('status', 'open')
          .or(`player_a.eq.${viewerId},player_b.eq.${viewerId}`)
      : Promise.resolve({ count: 0 }),
  ]);
  // "Looking here" = tournament-specific supply (opt-in / open seat / paid slot), excluding the
  // viewer; a globally looking player fills the deck but is not counted (master_plan §2AV).
  let lookingCount = 0;
  for (const [playerId, c] of supply) {
    if (playerId !== viewerId && c.tournamentSpecific) lookingCount += 1;
  }
  const viewerSearchOpen = (searchRow.data as { status: string } | null)?.status === 'open';
  return {
    enabled: settings.enabled && tournamentEnabled,
    lookingCount,
    viewerSearchOpen,
    openMatches: openMatches ?? 0,
    hasOpenDoublesDivisions: eligibleIds.size > 0,
  };
});

export interface PartnerSearcherRow {
  slug: string;
  displayName: string;
  divisions: string[];
  hasSeat: boolean;
}

/** Organizer "Looking for partners" list (master_plan §2AV H), bounded to 50. */
export async function listPartnerSearchers(
  tournamentId: string,
): Promise<{ count: number; players: PartnerSearcherRow[] }> {
  const svc = createServiceClient();
  const { data: searchRows, count } = await svc
    .from('partner_searches')
    .select('player_id, division_ids', { count: 'exact' })
    .eq('tournament_id', tournamentId)
    .eq('status', 'open')
    .order('last_active_at', { ascending: false })
    .limit(50);
  const searches = (searchRows ?? []) as { player_id: string; division_ids: string[] | null }[];
  if (searches.length === 0) return { count: count ?? 0, players: [] };

  const allDivisionIds = Array.from(new Set(searches.flatMap((s) => s.division_ids ?? [])));
  const [profiles, divisionsById, eligibleDivisions] = await Promise.all([
    loadProfiles(searches.map((s) => s.player_id)),
    loadDivisionsByIds(allDivisionIds),
    loadEligibleDivisions(tournamentId),
  ]);
  const seatMap = await loadLiveSoloTeams(
    tournamentId,
    eligibleDivisions.map((d) => d.id),
    searches.map((s) => s.player_id),
  );

  const players: PartnerSearcherRow[] = searches.map((s) => {
    const profile = profiles.get(s.player_id);
    return {
      slug: profile?.slug ?? s.player_id,
      displayName: profile ? displayNameOf(profile) : 'VouchPlay player',
      divisions: (s.division_ids ?? [])
        .map((id) => divisionsById.get(id))
        .filter((d): d is DivisionRow => !!d)
        .map((d) => divisionName(d)),
      hasSeat: (seatMap.get(s.player_id)?.size ?? 0) > 0,
    };
  });
  return { count: count ?? 0, players };
}

// ---------------------------------------------------------------------------
// Players-directory strip (master_plan §2AV, directory follow-up): where are people
// looking for a partner right now? A discovery aid on /players, before the funnel.
// ---------------------------------------------------------------------------

export interface PartnerLookingTournament {
  slug: string;
  name: string;
  /** OTHER players with an open search here (the viewer's own search is never counted). */
  lookingCount: number;
  /** The viewer already has an open search here - the strip says "Open my deck". */
  viewerSearchOpen: boolean;
  /** The viewer already holds an entry or reservation here - surfaced first (strong signal). */
  viewerEntered: boolean;
}

/**
 * Tournaments with at least one open partner search, for the directory strip. Bounded and cheap:
 * one read of open searches (most-recently-active first), one read of the tournaments they belong
 * to (only `registration_open` ones survive), one read of the viewer's own entries so their
 * tournaments float to the top. Ordering: the viewer's entered tournaments first, then the ones
 * where they already have a search, then by how many others are looking. Capped small - this is a
 * nudge, not a list. Never throws: any failure degrades to an empty strip.
 */
export const getPartnerLookingStrip = cache(
  async (viewerId: string | null, limit = 4): Promise<PartnerLookingTournament[]> => {
    try {
      const settings = await getPartnerSettings();
      if (!settings.enabled) return [];
      const svc = createServiceClient();

      // A generous but bounded scan of open searches; grouped by tournament in memory.
      const { data: searchRows } = await svc
        .from('partner_searches')
        .select('tournament_id, player_id, last_active_at')
        .eq('status', 'open')
        .order('last_active_at', { ascending: false })
        .limit(500);
      const searches = (searchRows ?? []) as {
        tournament_id: string;
        player_id: string;
        last_active_at: string;
      }[];
      if (searches.length === 0) return [];

      const othersByTournament = new Map<string, number>();
      const viewerSearchTournaments = new Set<string>();
      const lastActiveByTournament = new Map<string, string>();
      for (const s of searches) {
        if (viewerId && s.player_id === viewerId) {
          viewerSearchTournaments.add(s.tournament_id);
        } else {
          othersByTournament.set(
            s.tournament_id,
            (othersByTournament.get(s.tournament_id) ?? 0) + 1,
          );
        }
        if (!lastActiveByTournament.has(s.tournament_id)) {
          lastActiveByTournament.set(s.tournament_id, s.last_active_at);
        }
      }

      const tournamentIds = Array.from(new Set(searches.map((s) => s.tournament_id)));
      const { data: tournRows } = await svc
        .from('tournaments')
        .select('id, slug, name, status')
        .in('id', tournamentIds)
        .eq('status', 'registration_open');
      const openTournaments = (tournRows ?? []) as {
        id: string;
        slug: string | null;
        name: string;
        status: string;
      }[];
      if (openTournaments.length === 0) return [];

      // The viewer's own live entries, so tournaments they are already in surface first. One bounded
      // read of their confirmed team memberships mapped to tournaments (mirrors the unpaid-nudge scan).
      const enteredTournamentIds = new Set<string>();
      if (viewerId) {
        const { data: memberRows } = await svc
          .from('team_members')
          .select('team_id')
          .eq('player_id', viewerId)
          .not('confirmed_at', 'is', null)
          .limit(50);
        const teamIds = Array.from(
          new Set(((memberRows ?? []) as { team_id: string }[]).map((m) => m.team_id)),
        );
        if (teamIds.length > 0) {
          const { data: regRows } = await svc
            .from('registrations')
            .select('tournament_id, status')
            .in('team_id', teamIds)
            .not('status', 'in', '("withdrawn","cancelled","rejected","refunded")')
            .limit(100);
          for (const r of (regRows ?? []) as { tournament_id: string }[]) {
            enteredTournamentIds.add(r.tournament_id);
          }
        }
      }

      const rows: (PartnerLookingTournament & { _lastActive: string })[] = openTournaments
        .filter((t) => t.slug)
        .map((t) => ({
          slug: t.slug as string,
          name: t.name,
          lookingCount: othersByTournament.get(t.id) ?? 0,
          viewerSearchOpen: viewerSearchTournaments.has(t.id),
          viewerEntered: enteredTournamentIds.has(t.id),
          _lastActive: lastActiveByTournament.get(t.id) ?? '',
        }))
        // Nothing to say about a tournament where only the viewer is looking and they know it.
        .filter((t) => t.lookingCount > 0 || t.viewerSearchOpen);

      rows.sort((a, b) => {
        if (a.viewerEntered !== b.viewerEntered) return a.viewerEntered ? -1 : 1;
        if (a.viewerSearchOpen !== b.viewerSearchOpen) return a.viewerSearchOpen ? -1 : 1;
        if (b.lookingCount !== a.lookingCount) return b.lookingCount - a.lookingCount;
        return b._lastActive.localeCompare(a._lastActive);
      });

      return rows.slice(0, limit).map((r) => ({
        slug: r.slug,
        name: r.name,
        lookingCount: r.lookingCount,
        viewerSearchOpen: r.viewerSearchOpen,
        viewerEntered: r.viewerEntered,
      }));
    } catch {
      return [];
    }
  },
);
