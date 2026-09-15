/**
 * Badge rules (master_plan §2BK A, D). Pure, framework-free and fully tested: no I/O, no dates
 * other than the `now` the caller supplies, no database types. The server (apps/web
 * `lib/badges/compute.ts`) is the only impure layer - it loads facts in batch, calls
 * `evaluateAutoBadges`, and diffs the result against the live `player_badges` rows.
 *
 * Every NUMBER a rule uses is an Admin setting (`BadgeRuleSettings`, sourced from the `badges`
 * settings group) - never hardcoded here. The catalog (`packages/config/src/badges.ts`) supplies
 * only fixed vocabulary (which badges exist, their family/rarity/time-boundedness).
 *
 * Grant-only badges (`og`, `referee`, `ambassador`, `hof`, `supporter`) are never produced by this
 * module - they only ever exist as admin-tagged `source = 'grant'` rows (§2BK B).
 */

import { badgeDef, BADGE_RARITY_RANK } from '@vouchplay/config';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** The `badges` settings group (packages/config/src/settings.ts), camelCased for rule code. */
export interface BadgeRuleSettings {
  championWindowMonths: number;
  legendMinTitles: number;
  podiumWindowMonths: number;
  regularMinEvents: number;
  regularLevel2Events: number;
  regularLevel3Events: number;
  topContributorSize: number;
  trustedVoiceMinVouches: number;
  pioneerCutoff: number;
  matchmakerMinEntered: number;
  risingTopN: number;
  risingMinClimb: number;
  risingDays: number;
  levelUpDays: number;
  provenMinVouchers: number;
  tierCrownMinVouchers: number;
  organizerMinTournaments: number;
}

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

export type OfficialTitleKey =
  'champion' | 'runner_up' | 'bronze' | 'mvp' | 'sportsmanship' | 'participant';

/**
 * One official (organizer-issued, `verification_status = 'verified'`) result. Peer-nominated or
 * unverified achievements must never reach this list (§2BK "Loose ends") - the server filters them
 * out before building facts.
 */
export interface OfficialResultFact {
  placement: '1st' | '2nd' | '3rd' | null;
  titleKey: OfficialTitleKey;
  /** ISO instant the achievement was issued. */
  issuedAt: string;
  tournamentName: string;
  divisionName: string | null;
}

/** A confirmed entry in a tournament an admin marked commemorative (§2BK B). */
export interface CommemorativeEntryFact {
  tournamentId: string;
  label: string;
}

export interface PlayerMomentumFact {
  privateRank: number | null;
  previousRank: number | null;
}

export interface PlayerBadgeFacts {
  officialResults: readonly OfficialResultFact[];
  /** Confirmed entries across DISTINCT completed tournaments (§2BK A "Tour Regular"). */
  completedTournamentEntries: number;
  /** Active standing vouches given by this player (§2BK A "Trusted Voice"). */
  standingVouchesGiven: number;
  onboardedAt: string | null;
  /** Already-assigned Pioneer number, if any - kept forever, never reassigned. */
  existingPioneerNumber: number | null;
  /** Owner/admin of an active club. */
  clubCaptain: boolean;
  /** Swipe matches (`partner_matches.status = 'entered'`) this player is part of. */
  enteredPartnerMatches: number;
  /** Players-board momentum (category 'players', global scope, the board's default period). */
  playersMomentum: PlayerMomentumFact | null;
  /** Rank on the Community Champions (contribution) board, 1-based; null when unranked. */
  communityContributionRank: number | null;
  /** Current community skill ordinal (0-6), or null when unrated. */
  communityLevel: number | null;
  /** The level last observed by the tracker BEFORE this run (player_badge_progress). */
  communityLevelSeen: number | null;
  /** The tracker's stamped level-up instant (player_badge_progress.level_up_at), if any. */
  levelUpAt: string | null;
  uniqueVouchers: number;
  sts: number | null;
  /** Community skill band key, or null when unrated. */
  communityBand: string | null;
  communityRatingPrivate: boolean;
  isCoach: boolean;
  isOrganizer: boolean;
  ownedNonDraftTournaments: number;
  commemorativeEntries: readonly CommemorativeEntryFact[];
}

/** Every player's facts, keyed by player id. Some rules (Pioneer, Rising, Top of Tier) compare
 *  players against one another, so the whole set is evaluated together. */
export type AutoBadgeInput = Map<string, PlayerBadgeFacts>;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Mirrors `apps/web/src/lib/badges/types.ts` BadgeMeta - kept local so this package stays
 *  independent of the app layer. Structurally identical, so callers can assign it directly. */
export interface DesiredBadgeMeta {
  event?: string;
  division?: string;
  tournamentId?: string;
  number?: number;
  tier?: string;
  level?: number;
  medal?: 'silver' | 'bronze';
  label?: string;
}

export interface DesiredBadge {
  key: string;
  tally: number;
  meta: DesiredBadgeMeta;
  expiresAt: string | null;
}

// ---------------------------------------------------------------------------
// Date helpers (pure; everything anchors off the caller's `now`)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

function monthsAgoMs(now: Date, months: number): number {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.getTime();
}

function latestBy<T>(rows: readonly T[], at: (r: T) => string): T | null {
  let best: T | null = null;
  let bestMs = -Infinity;
  for (const r of rows) {
    const ms = Date.parse(at(r));
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      best = r;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Per-player rules that need no cross-player context
// ---------------------------------------------------------------------------

function championBadge(
  facts: PlayerBadgeFacts,
  settings: BadgeRuleSettings,
  now: Date,
): DesiredBadge | null {
  const cutoff = monthsAgoMs(now, settings.championWindowMonths);
  const wins = facts.officialResults.filter(
    (r) => r.titleKey === 'champion' && Date.parse(r.issuedAt) >= cutoff,
  );
  if (wins.length === 0) return null;
  const latest = latestBy(wins, (r) => r.issuedAt)!;
  return {
    key: 'champion',
    tally: wins.length,
    meta: { event: latest.tournamentName, division: latest.divisionName ?? undefined },
    expiresAt: addMonths(latest.issuedAt, settings.championWindowMonths),
  };
}

function legendBadge(facts: PlayerBadgeFacts, settings: BadgeRuleSettings): DesiredBadge | null {
  const wins = facts.officialResults.filter((r) => r.titleKey === 'champion');
  if (wins.length < settings.legendMinTitles) return null;
  return { key: 'legend', tally: wins.length, meta: {}, expiresAt: null };
}

function podiumBadge(
  facts: PlayerBadgeFacts,
  settings: BadgeRuleSettings,
  now: Date,
): DesiredBadge | null {
  const cutoff = monthsAgoMs(now, settings.podiumWindowMonths);
  const placements = facts.officialResults.filter(
    (r) =>
      (r.titleKey === 'runner_up' || r.titleKey === 'bronze') && Date.parse(r.issuedAt) >= cutoff,
  );
  if (placements.length === 0) return null;
  const latest = latestBy(placements, (r) => r.issuedAt)!;
  return {
    key: 'podium',
    tally: placements.length,
    meta: {
      medal: latest.titleKey === 'runner_up' ? 'silver' : 'bronze',
      event: latest.tournamentName,
      division: latest.divisionName ?? undefined,
    },
    expiresAt: addMonths(latest.issuedAt, settings.podiumWindowMonths),
  };
}

function mvpBadge(facts: PlayerBadgeFacts): DesiredBadge | null {
  const wins = facts.officialResults.filter((r) => r.titleKey === 'mvp');
  if (wins.length === 0) return null;
  const latest = latestBy(wins, (r) => r.issuedAt)!;
  return {
    key: 'mvp',
    tally: wins.length,
    meta: { event: latest.tournamentName },
    expiresAt: null,
  };
}

function fairplayBadge(facts: PlayerBadgeFacts): DesiredBadge | null {
  const wins = facts.officialResults.filter((r) => r.titleKey === 'sportsmanship');
  if (wins.length === 0) return null;
  const latest = latestBy(wins, (r) => r.issuedAt)!;
  return {
    key: 'fairplay',
    tally: wins.length,
    meta: { event: latest.tournamentName },
    expiresAt: null,
  };
}

function regularBadge(facts: PlayerBadgeFacts, settings: BadgeRuleSettings): DesiredBadge | null {
  const n = facts.completedTournamentEntries;
  if (n < settings.regularMinEvents) return null;
  const level = n >= settings.regularLevel3Events ? 3 : n >= settings.regularLevel2Events ? 2 : 1;
  return { key: 'regular', tally: n, meta: { level }, expiresAt: null };
}

function topContributorBadge(
  facts: PlayerBadgeFacts,
  settings: BadgeRuleSettings,
): DesiredBadge | null {
  if (facts.communityContributionRank == null) return null;
  if (facts.communityContributionRank > settings.topContributorSize) return null;
  return { key: 'top_contributor', tally: 1, meta: {}, expiresAt: null };
}

function trustedVoiceBadge(
  facts: PlayerBadgeFacts,
  settings: BadgeRuleSettings,
): DesiredBadge | null {
  if (facts.standingVouchesGiven < settings.trustedVoiceMinVouches) return null;
  return { key: 'trusted_voice', tally: facts.standingVouchesGiven, meta: {}, expiresAt: null };
}

function captainBadge(facts: PlayerBadgeFacts): DesiredBadge | null {
  if (!facts.clubCaptain) return null;
  return { key: 'captain', tally: 1, meta: {}, expiresAt: null };
}

function matchmakerBadge(
  facts: PlayerBadgeFacts,
  settings: BadgeRuleSettings,
): DesiredBadge | null {
  if (facts.enteredPartnerMatches < settings.matchmakerMinEntered) return null;
  return { key: 'matchmaker', tally: facts.enteredPartnerMatches, meta: {}, expiresAt: null };
}

function provenBadge(facts: PlayerBadgeFacts, settings: BadgeRuleSettings): DesiredBadge | null {
  if (facts.uniqueVouchers < settings.provenMinVouchers) return null;
  return { key: 'proven', tally: facts.uniqueVouchers, meta: {}, expiresAt: null };
}

function coachBadge(facts: PlayerBadgeFacts): DesiredBadge | null {
  if (!facts.isCoach) return null;
  return { key: 'coach', tally: 1, meta: {}, expiresAt: null };
}

function organizerBadge(facts: PlayerBadgeFacts, settings: BadgeRuleSettings): DesiredBadge | null {
  if (!facts.isOrganizer) return null;
  if (facts.ownedNonDraftTournaments < settings.organizerMinTournaments) return null;
  return { key: 'organizer', tally: facts.ownedNonDraftTournaments, meta: {}, expiresAt: null };
}

function eventBadges(facts: PlayerBadgeFacts): DesiredBadge[] {
  return facts.commemorativeEntries.map((e) => ({
    key: `event:${e.tournamentId}`,
    tally: 1,
    meta: { tournamentId: e.tournamentId, label: e.label },
    expiresAt: null,
  }));
}

/**
 * Level Up (§2BK A/D). `facts.communityLevel`/`communityLevelSeen` decide whether a rise happened
 * ON THIS RUN (comparing to the tracker's PRE-update value); `facts.levelUpAt` is the tracker's
 * currently-stamped instant for the ACTIVE window (the caller stamps it fresh the moment a rise is
 * first detected and carries it forward unchanged afterward - see `lib/badges/compute.ts`). Pure:
 * both the "just rose" comparison and the window check are computed here from `now`.
 */
function levelUpBadge(
  facts: PlayerBadgeFacts,
  settings: BadgeRuleSettings,
  now: Date,
): DesiredBadge | null {
  const justRose =
    facts.communityLevel != null &&
    facts.communityLevelSeen != null &&
    facts.communityLevel > facts.communityLevelSeen;
  const stampMs = justRose ? now.getTime() : facts.levelUpAt ? Date.parse(facts.levelUpAt) : null;
  if (stampMs == null || !Number.isFinite(stampMs)) return null;
  const expiresMs = stampMs + settings.levelUpDays * DAY_MS;
  if (now.getTime() >= expiresMs) return null;
  return {
    key: 'level_up',
    tally: 1,
    meta: facts.communityLevel != null ? { level: facts.communityLevel } : {},
    expiresAt: new Date(expiresMs).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Cross-player rules
// ---------------------------------------------------------------------------

/**
 * Pioneer numbering (§2BK A/D): existing numbers are immutable; new numbers go to the next players
 * in `onboardedAt, id` order, but only while fewer than `cutoff` have ever been issued. Returns a
 * map of playerId -> assigned number (existing kept + any newly assigned this run).
 */
function assignPioneerNumbers(input: AutoBadgeInput, cutoff: number): Map<string, number> {
  const numbers = new Map<string, number>();
  let maxAssigned = 0;
  let totalIssued = 0;
  for (const [playerId, facts] of input) {
    if (facts.existingPioneerNumber != null) {
      numbers.set(playerId, facts.existingPioneerNumber);
      maxAssigned = Math.max(maxAssigned, facts.existingPioneerNumber);
      totalIssued += 1;
    }
  }
  let remaining = cutoff - totalIssued;
  if (remaining <= 0) return numbers;

  const eligible = Array.from(input.entries())
    .filter(([, f]) => f.existingPioneerNumber == null && f.onboardedAt != null)
    .sort(([idA, a], [idB, b]) => {
      const ma = Date.parse(a.onboardedAt as string);
      const mb = Date.parse(b.onboardedAt as string);
      if (ma !== mb) return ma - mb;
      return idA < idB ? -1 : idA > idB ? 1 : 0;
    });

  let next = maxAssigned + 1;
  for (const [playerId] of eligible) {
    if (remaining <= 0) break;
    numbers.set(playerId, next);
    next += 1;
    remaining -= 1;
  }
  return numbers;
}

/** Rising (§2BK A): top N climbers (previousRank - privateRank >= minClimb) on the players board. */
function risingWinners(input: AutoBadgeInput, settings: BadgeRuleSettings): Set<string> {
  const candidates: { playerId: string; climb: number; privateRank: number }[] = [];
  for (const [playerId, facts] of input) {
    const m = facts.playersMomentum;
    if (!m || m.privateRank == null || m.previousRank == null) continue;
    const climb = m.previousRank - m.privateRank;
    if (climb >= settings.risingMinClimb) {
      candidates.push({ playerId, climb, privateRank: m.privateRank });
    }
  }
  candidates.sort((a, b) => {
    if (b.climb !== a.climb) return b.climb - a.climb;
    if (a.privateRank !== b.privateRank) return a.privateRank - b.privateRank;
    return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
  });
  return new Set(candidates.slice(0, settings.risingTopN).map((c) => c.playerId));
}

/**
 * Top of Tier (§2BK A): the single highest-STS player per community band, among players with a
 * PUBLIC community rating and at least `tierCrownMinVouchers` unique vouchers. Ties: more unique
 * vouchers, then earlier onboardedAt.
 */
function tierCrownWinners(input: AutoBadgeInput, settings: BadgeRuleSettings): Map<string, string> {
  const bestByBand = new Map<
    string,
    { playerId: string; sts: number; uniqueVouchers: number; onboardedAtMs: number }
  >();
  for (const [playerId, facts] of input) {
    if (facts.communityRatingPrivate) continue;
    if (facts.communityBand == null || facts.sts == null) continue;
    if (facts.uniqueVouchers < settings.tierCrownMinVouchers) continue;
    const onboardedAtMs = facts.onboardedAt ? Date.parse(facts.onboardedAt) : Infinity;
    const current = bestByBand.get(facts.communityBand);
    const candidate = {
      playerId,
      sts: facts.sts,
      uniqueVouchers: facts.uniqueVouchers,
      onboardedAtMs,
    };
    if (
      !current ||
      candidate.sts > current.sts ||
      (candidate.sts === current.sts && candidate.uniqueVouchers > current.uniqueVouchers) ||
      (candidate.sts === current.sts &&
        candidate.uniqueVouchers === current.uniqueVouchers &&
        candidate.onboardedAtMs < current.onboardedAtMs)
    ) {
      bestByBand.set(facts.communityBand, candidate);
    }
  }
  const winnerToBand = new Map<string, string>();
  for (const [band, winner] of bestByBand) winnerToBand.set(winner.playerId, band);
  return winnerToBand;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Every automatic badge rule, evaluated for every player in `input` at once (§2BK D). */
export function evaluateAutoBadges(
  input: AutoBadgeInput,
  settings: BadgeRuleSettings,
  now: Date,
): Map<string, DesiredBadge[]> {
  const pioneerNumbers = assignPioneerNumbers(input, settings.pioneerCutoff);
  const risingSet = risingWinners(input, settings);
  const tierCrownBand = tierCrownWinners(input, settings);
  const risingExpiresAt = new Date(now.getTime() + settings.risingDays * DAY_MS).toISOString();
  const tierCrownExpiresAt = new Date(now.getTime() + 2 * DAY_MS).toISOString();

  const out = new Map<string, DesiredBadge[]>();
  for (const [playerId, facts] of input) {
    const badges: DesiredBadge[] = [];
    const push = (b: DesiredBadge | null) => {
      if (b) badges.push(b);
    };

    push(championBadge(facts, settings, now));
    push(legendBadge(facts, settings));
    push(podiumBadge(facts, settings, now));
    push(mvpBadge(facts));
    push(fairplayBadge(facts));
    push(regularBadge(facts, settings));
    push(topContributorBadge(facts, settings));
    push(trustedVoiceBadge(facts, settings));
    push(captainBadge(facts));
    push(matchmakerBadge(facts, settings));
    push(provenBadge(facts, settings));
    push(coachBadge(facts));
    push(organizerBadge(facts, settings));
    push(levelUpBadge(facts, settings, now));
    badges.push(...eventBadges(facts));

    const pioneerNumber = pioneerNumbers.get(playerId);
    if (pioneerNumber != null) {
      badges.push({ key: 'pioneer', tally: 1, meta: { number: pioneerNumber }, expiresAt: null });
    }
    if (risingSet.has(playerId)) {
      badges.push({ key: 'rising', tally: 1, meta: {}, expiresAt: risingExpiresAt });
    }
    const band = tierCrownBand.get(playerId);
    if (band) {
      badges.push({
        key: 'tier_crown',
        tally: 1,
        meta: { tier: band },
        expiresAt: tierCrownExpiresAt,
      });
    }

    out.set(playerId, badges);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Display helpers (§2BK E)
// ---------------------------------------------------------------------------

/**
 * Card order (§2BK E): pinned first, then rarity rank descending, then newest first. Legend hides
 * Champion (holding both, only Legend shows in the row). Generic over any badge-like shape so both
 * `BadgeView` (app layer) and `DesiredBadge`-derived rows can reuse it.
 */
export function pickCardOrder<T extends { key: string; awardedAt: string }>(
  badges: readonly T[],
  pinnedKey: string | null,
): T[] {
  const hasLegend = badges.some((b) => b.key === 'legend');
  const visible = hasLegend ? badges.filter((b) => b.key !== 'champion') : badges;
  return [...visible].sort((a, b) => {
    if (pinnedKey) {
      const aPinned = a.key === pinnedKey;
      const bPinned = b.key === pinnedKey;
      if (aPinned && !bPinned) return -1;
      if (bPinned && !aPinned) return 1;
    }
    const ra = badgeDef(a.key)?.rarity;
    const rb = badgeDef(b.key)?.rarity;
    const rank = (ra ? BADGE_RARITY_RANK[ra] : 0) - (rb ? BADGE_RARITY_RANK[rb] : 0);
    if (rank !== 0) return -rank;
    return Date.parse(b.awardedAt) - Date.parse(a.awardedAt);
  });
}

export interface BadgeProgressEntry {
  key: string;
  hint: string;
  pct: number;
}

/**
 * "Almost there" (§2BK E): up to 3 nearest locked badges, from the fixed candidate set (proven,
 * trusted_voice, regular, legend when at least one title is already held, top_contributor when
 * ranked at all). A candidate already at 100% is treated as earned, not "locked", and dropped.
 */
export function badgeProgressFor(
  facts: PlayerBadgeFacts,
  settings: BadgeRuleSettings,
): BadgeProgressEntry[] {
  const pct = (have: number, need: number) =>
    need <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((have / need) * 100)));

  const candidates: BadgeProgressEntry[] = [];

  const provenPct = pct(facts.uniqueVouchers, settings.provenMinVouchers);
  candidates.push({
    key: 'proven',
    hint: `${Math.max(0, settings.provenMinVouchers - facts.uniqueVouchers)} more unique vouchers`,
    pct: provenPct,
  });

  const trustedPct = pct(facts.standingVouchesGiven, settings.trustedVoiceMinVouches);
  candidates.push({
    key: 'trusted_voice',
    hint: `${Math.max(0, settings.trustedVoiceMinVouches - facts.standingVouchesGiven)} more vouches given`,
    pct: trustedPct,
  });

  const regularPct = pct(facts.completedTournamentEntries, settings.regularMinEvents);
  candidates.push({
    key: 'regular',
    hint: `${Math.max(0, settings.regularMinEvents - facts.completedTournamentEntries)} more completed tournaments`,
    pct: regularPct,
  });

  const titleCount = facts.officialResults.filter((r) => r.titleKey === 'champion').length;
  if (titleCount >= 1) {
    candidates.push({
      key: 'legend',
      hint: `${Math.max(0, settings.legendMinTitles - titleCount)} more official titles`,
      pct: pct(titleCount, settings.legendMinTitles),
    });
  }

  if (facts.communityContributionRank != null) {
    candidates.push({
      key: 'top_contributor',
      hint:
        facts.communityContributionRank <= settings.topContributorSize
          ? 'Already in range'
          : `${facts.communityContributionRank - settings.topContributorSize} places to the top ${settings.topContributorSize}`,
      pct: pct(
        settings.topContributorSize,
        Math.max(settings.topContributorSize, facts.communityContributionRank),
      ),
    });
  }

  return candidates
    .filter((c) => c.pct < 100)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);
}
