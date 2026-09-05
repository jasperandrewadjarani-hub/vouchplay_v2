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
} from '@vouchplay/config';
import type { GlobalRole, ProfileRow } from '@vouchplay/db';
import { avatarUrl } from '@/lib/storage';

export interface ViewerContext {
  /** The signed-in viewer's user id, or null for anonymous. */
  viewerId: string | null;
  /** Authorized moderation/admin — sees otherwise-hidden fields. */
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
  /** Self-rated band — shown (clearly labeled) when there is no community skill yet. */
  selfRatedSkill: SkillBand | null;
  /** Skill-Trust Score 0–5 (Phase 3). Null until computed. Never used to rank the directory. */
  sts: number | null;
  skillVerified: boolean;
  identityVerified: boolean;
  isCoach: boolean;
  isOrganizer: boolean;
  isClubOwner: boolean;
  lookingForPartner: boolean;
  openForSponsorship: boolean;
  clubs: ClubRef[];
}

export interface PlayerProfileDTO extends PlayerCardDTO {
  /** The target's user id — needed by the vouch form (profile only). */
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
  uniqueVoucherCount: number;
}

function fullName(row: ProfileRow): string {
  const parts = [row.first_name, row.last_name].filter(Boolean) as string[];
  return parts.join(' ').trim();
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
}

/** Extra facts fetched in bulk (avoids N+1) and passed alongside the profile row. */
export interface ProfileExtras {
  roles: GlobalRole[];
  identityVerified: boolean;
  clubs?: ClubRef[];
  skill?: SkillSnapshot | null;
}

export function toPlayerCardDTO(
  row: ProfileRow,
  extras: ProfileExtras,
  viewer: ViewerContext,
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
    skillVerified: extras.skill?.skillVerified ?? false,
    identityVerified: extras.identityVerified,
    isCoach: extras.roles.includes('coach'),
    isOrganizer: extras.roles.includes('organizer'),
    isClubOwner: (extras.clubs ?? []).some((c) => c.relationship === 'owner'),
    lookingForPartner: row.looking_for_partner,
    openForSponsorship: row.open_for_sponsorship,
    clubs: extras.clubs ?? [],
  };
}

export function toPlayerProfileDTO(
  row: ProfileRow,
  extras: ProfileExtras,
  viewer: ViewerContext,
): PlayerProfileDTO {
  const visibility = parseVisibility(row.profile_visibility);
  const privileged = viewer.isStaff || viewer.viewerId === row.id;
  const showAge = privileged || fieldVisible(visibility, 'age');

  return {
    ...toPlayerCardDTO(row, extras, viewer),
    id: row.id,
    bio: row.bio ?? null,
    facebookUrl: row.facebook_url ?? null,
    age: showAge ? ageFromDob(row.date_of_birth) : null,
    memberSince: row.created_at,
    isOwnProfile: viewer.viewerId === row.id,
    distribution: extras.skill?.distribution ?? {},
    uniqueVoucherCount: extras.skill?.uniqueVoucherCount ?? 0,
  };
}

/** The exact column list every player read selects — never `select('*')` (handover §34A, §35). */
export const PLAYER_CARD_COLUMNS =
  'id, slug, first_name, last_name, nickname, city, sex, avatar_path, self_rated_skill, ' +
  'looking_for_partner, open_for_sponsorship, profile_visibility, account_status, ' +
  'onboarded_at, created_at, updated_at, deleted_at';

export const PLAYER_PROFILE_COLUMNS = `${PLAYER_CARD_COLUMNS}, bio, facebook_url, date_of_birth`;

/** Skill-band lookup helper re-exported for card/profile rendering convenience. */
export { SKILL_BANDS };
