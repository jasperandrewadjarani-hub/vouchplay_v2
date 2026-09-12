/**
 * Player DTO projections (handover §8.1, §9, §37 RLS-safe projection).
 *
 * RLS lets the public SELECT a profile row, so PRIVACY IS ENFORCED HERE: these projections drop any
 * field a non-privileged viewer is not allowed to see BEFORE the payload reaches the client. Never
 * return the raw ProfileRow to a component.
 *
 * Skill/trust separation (§3.3, §72): Community Skill Level and STS are distinct from Self-Rated
 * Skill and live in `player_skill_profiles` (Phase 3). Until that lands, `communitySkill`/`sts`/
 * `skillVerified` are null/false and the UI falls back to the labeled Self-Rated value.
 */

import {
  SKILL_BANDS,
  fieldVisible,
  parseVisibility,
  skillByOrdinal,
  type SkillBand,
  type SkillAlgorithmVersion,
} from '@vouchplay/config';
import type { GlobalRole, ProfileRow } from '@vouchplay/db';
import { avatarUrl } from '@/lib/storage';

export interface ViewerContext {
  /** The signed-in viewer's user id, or null for anonymous. */
  viewerId: string | null;
  /** Authorized moderation/admin - sees otherwise-hidden fields. */
  isStaff: boolean;
}

export const ANON_VIEWER: ViewerContext = { viewerId: null, isStaff: false };

/** Club membership shown on cards/profiles. Sourced in Phase 5; empty for now. */
export interface ClubRef {
  slug: string;
  name: string;
  iconUrl: string | null;
  verified: boolean;
  relationship: 'owner' | 'admin' | 'member';
}

export interface PlayerCardDTO {
  slug: string;
  displayName: string;
  nickname: string | null;
  initials: string;
  avatarUrl: string | null;
  sex: 'male' | 'female' | null;
  city: string | null;
  /** Community Skill Level (Phase 3). Null until vouches exist. */
  communitySkill: SkillBand | null;
  /** Self-rated band - shown (clearly labeled) when there is no community skill yet. */
  selfRatedSkill: SkillBand | null;
  /** Skill-Trust Score 0–5 (Phase 3). Null until computed. Never used to rank the directory. */
  sts: number | null;
  /**
   * Unique active vouchers. STS saturates by design, so this is the number that keeps growing and
   * it belongs beside the score wherever the score appears (master_plan §1W).
   */
  uniqueVoucherCount: number;
  /**
   * The version-aware evidence count behind the current skill numbers (master_plan §2AF "Workflow and
   * UX"): the raw unique-voucher tally under STS_V1, or the independent-equivalent count (N_eff,
   * rounded) under STS_V2. Null when there is no skill profile yet. Kept separate from
   * `uniqueVoucherCount` above so existing V1 callers never see their field change shape.
   */
  evidenceCount: number | null;
  /** Which skill algorithm produced the numbers above (master_plan §2AF rollout step 2). Defaults to
   *  'STS_V1' - byte-identical to pre-§2AF behaviour until the Admin setting is flipped. */
  skillVersion: SkillAlgorithmVersion;
  skillVerified: boolean;
  identityVerified: boolean;
  isCoach: boolean;
  isOrganizer: boolean;
  isClubOwner: boolean;
  lookingForPartner: boolean;
  openForSponsorship: boolean;
  /**
   * Onboarded within the admin `new_account_badge_days` window (master_plan §2AG A3, D5). A neutral
   * "New" pill, never a warning - it fades on its own once the account ages past the window, and
   * moves instantly when Admin changes the setting (no deploy).
   */
  isNew: boolean;
  /**
   * Whether the viewing user already has an active vouch for this player (master_plan §2U). Defaults
   * to false; listPlayers sets it for the signed-in viewer so the card's Vouch button can show the
   * "already vouched" state. Never true for an anonymous viewer.
   */
  viewerHasVouched: boolean;
  /**
   * When the viewer has vouched, ms remaining on the update cooldown (0 = changeable now); null when
   * they have not vouched (master_plan §2V). Drives the "Vouched" confirm dialog's copy.
   */
  viewerVouchCanUpdateInMs: number | null;
  clubs: ClubRef[];
  /**
   * At least one active, coach-weighted vouch exists for this player (master_plan §2AO D2), from
   * `player_skill_profiles.coach_vouch_count` (migration 0042, maintained by the recompute path).
   * Defaults to false when the column is not yet present - see `queries.ts`'s defensive read.
   */
  coachVouched: boolean;
}

/**
 * One coach who publicly vouched for a player, for the profile's skill-distribution avatars
 * (master_plan §2AO D3). Loaded ONLY on the profile query (never the directory list) and only from
 * vouches whose author chose `visibility = 'public'` - anonymous coach vouches never appear here.
 */
export interface CoachVoucherDTO {
  name: string;
  slug: string | null;
  avatarUrl: string | null;
  verified: boolean;
  /** The skill-band ordinal (0..6) the coach vouched at - matches `SkillBand.ordinal`. */
  level: number;
}

export interface PlayerProfileDTO extends PlayerCardDTO {
  /** The target's user id - needed by the vouch form (profile only). */
  id: string;
  bio: string | null;
  facebookUrl: string | null;
  /** Displayed age (derived from DOB), only when present AND visible to this viewer. */
  age: number | null;
  memberSince: string;
  /** True when the row belongs to the current viewer (drives owner-only affordances). */
  isOwnProfile: boolean;
  /** Vouch distribution by band ordinal (0..6 → count) and total unique vouchers (§9.2). */
  distribution: Record<string, number>;
  /** Coaches who publicly vouched for this player, bounded to 20 (master_plan §2AO D3). Empty when
   *  there are none, or when the read failed (fail-open - never blocks the profile). */
  coachVouchers: CoachVoucherDTO[];
}

/** Exported for reuse by the directory sort (master_plan §2AG A1): the same "First Last" (falling
 *  back to the nickname elsewhere) that every card and profile shows, so name-sort orders players
 *  the same way their name actually renders. */
export function fullName(row: ProfileRow): string {
  const parts = [row.first_name, row.last_name].filter(Boolean) as string[];
  return parts.join(' ').trim();
}

/** Whether `onboardedAt` falls within `days` of now (master_plan §2AG A3, D5). `days <= 0` disables
 *  the badge outright (an Admin setting of 0 means "never show New"), and an invalid/absent date is
 *  never "new". */
function isRecentlyOnboarded(onboardedAt: string | null, days: number): boolean {
  if (!onboardedAt || !Number.isFinite(days) || days <= 0) return false;
  const onboarded = new Date(onboardedAt).getTime();
  if (Number.isNaN(onboarded)) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return onboarded >= cutoff;
}

function initialsFrom(row: ProfileRow): string {
  const a = row.first_name?.trim()?.[0] ?? '';
  const b = row.last_name?.trim()?.[0] ?? '';
  const combined = `${a}${b}`.toUpperCase();
  if (combined) return combined;
  return (row.nickname?.trim()?.[0] ?? '?').toUpperCase();
}

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function bandFromOrdinal(ordinal: number | null): SkillBand | null {
  if (ordinal == null) return null;
  return skillByOrdinal(ordinal) ?? null;
}

/** Computed community-skill snapshot (from player_skill_profiles; Phase 3). */
export interface SkillSnapshot {
  communitySkillLevel: number | null;
  sts: number;
  skillVerified: boolean;
  uniqueVoucherCount: number;
  distribution: Record<string, number>;
  /** Version-aware evidence count and the version it came from (master_plan §2AF); see
   *  `PlayerCardDTO.evidenceCount` / `skillVersion` for the exact meaning. */
  evidenceCount: number | null;
  skillVersion: SkillAlgorithmVersion;
}

/** Extra facts fetched in bulk (avoids N+1) and passed alongside the profile row. */
export interface ProfileExtras {
  roles: GlobalRole[];
  identityVerified: boolean;
  clubs?: ClubRef[];
  skill?: SkillSnapshot | null;
  /** `player_skill_profiles.coach_vouch_count > 0` (master_plan §2AO D2). Kept separate from `skill`
   *  because it is not version-routed (STS_V1/V2) and is read defensively on its own (§2AO, migration
   *  0042). Undefined/missing → false. */
  coachVouched?: boolean;
  /** Profile-query-only (§2AO D3); never populated for the directory list. See `CoachVoucherDTO`. */
  coachVouchers?: CoachVoucherDTO[];
}

export function toPlayerCardDTO(
  row: ProfileRow,
  extras: ProfileExtras,
  viewer: ViewerContext,
  /** Admin `new_account_badge_days` (default 7 - the seeded default - when the caller has not yet
   *  loaded the live setting). */
  newAccountBadgeDays = 7,
): PlayerCardDTO {
  const visibility = parseVisibility(row.profile_visibility);
  const privileged = viewer.isStaff || viewer.viewerId === row.id;
  const showSex = privileged || fieldVisible(visibility, 'sex');
  const showCity = privileged || fieldVisible(visibility, 'city');

  return {
    slug: row.slug ?? row.id,
    displayName: fullName(row) || row.nickname || 'VouchPlay player',
    nickname: row.nickname ?? null,
    initials: initialsFrom(row),
    avatarUrl: avatarUrl(row.avatar_path),
    sex: showSex ? row.sex : null,
    city: showCity ? row.city : null,
    communitySkill: bandFromOrdinal(extras.skill?.communitySkillLevel ?? null),
    selfRatedSkill: bandFromOrdinal(row.self_rated_skill),
    sts: extras.skill?.sts ?? null,
    uniqueVoucherCount: extras.skill?.uniqueVoucherCount ?? 0,
    evidenceCount: extras.skill?.evidenceCount ?? null,
    skillVersion: extras.skill?.skillVersion ?? 'STS_V1',
    skillVerified: extras.skill?.skillVerified ?? false,
    identityVerified: extras.identityVerified,
    isCoach: extras.roles.includes('coach'),
    isOrganizer: extras.roles.includes('organizer'),
    isClubOwner: (extras.clubs ?? []).some((c) => c.relationship === 'owner'),
    lookingForPartner: row.looking_for_partner,
    openForSponsorship: row.open_for_sponsorship,
    isNew: isRecentlyOnboarded(row.onboarded_at, newAccountBadgeDays),
    viewerHasVouched: false,
    viewerVouchCanUpdateInMs: null,
    clubs: extras.clubs ?? [],
    coachVouched: extras.coachVouched ?? false,
  };
}

export function toPlayerProfileDTO(
  row: ProfileRow,
  extras: ProfileExtras,
  viewer: ViewerContext,
  newAccountBadgeDays = 7,
): PlayerProfileDTO {
  const visibility = parseVisibility(row.profile_visibility);
  const privileged = viewer.isStaff || viewer.viewerId === row.id;
  const showAge = privileged || fieldVisible(visibility, 'age');

  return {
    ...toPlayerCardDTO(row, extras, viewer, newAccountBadgeDays),
    id: row.id,
    bio: row.bio ?? null,
    facebookUrl: row.facebook_url ?? null,
    age: showAge ? ageFromDob(row.date_of_birth) : null,
    memberSince: row.created_at,
    isOwnProfile: viewer.viewerId === row.id,
    distribution: extras.skill?.distribution ?? {},
    uniqueVoucherCount: extras.skill?.uniqueVoucherCount ?? 0,
    coachVouchers: extras.coachVouchers ?? [],
  };
}

/** The exact column list every player read selects - never `select('*')` (handover §34A, §35). */
export const PLAYER_CARD_COLUMNS =
  'id, slug, first_name, last_name, nickname, city, sex, avatar_path, self_rated_skill, ' +
  'looking_for_partner, open_for_sponsorship, profile_visibility, account_status, ' +
  'onboarded_at, created_at, updated_at, deleted_at';

export const PLAYER_PROFILE_COLUMNS = `${PLAYER_CARD_COLUMNS}, bio, facebook_url, date_of_birth`;

/** Skill-band lookup helper re-exported for card/profile rendering convenience. */
export { SKILL_BANDS };
