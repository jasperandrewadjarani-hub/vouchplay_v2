/**
 * Tournament DTO projections (handover §17–§19, §37). Public reads expose non-draft tournaments;
 * organizer/staff see drafts. Division names are composed from attributes (§18 - never hardcoded).
 */
import type {
  TournamentRow,
  DivisionRow,
  TournamentStatus,
  TournamentVisibility,
} from '@vouchplay/db';
import { skillByOrdinal } from '@vouchplay/config';
import { tournamentCoverUrl } from '@/lib/storage';

export interface TournamentViewer {
  viewerId: string | null;
  isStaff: boolean;
}
export const ANON_TOURNAMENT_VIEWER: TournamentViewer = { viewerId: null, isStaff: false };

export interface TournamentCardDTO {
  slug: string;
  name: string;
  city: string | null;
  coverUrl: string | null;
  status: TournamentStatus;
  visibility: TournamentVisibility;
  startAt: string | null;
  endAt: string | null;
}

export interface DivisionDTO {
  id: string;
  name: string;
  nameOverride: string | null;
  skillPolicy: string;
  minimumSkill: number | null;
  maximumSkill: number | null;
  format: string;
  sexClassification: string;
  minimumAge: number | null;
  maximumAge: number | null;
  teamSize: number;
  capacityTeams: number;
  feeAmount: number;
  currency: string;
  skillVerifiedRequired: boolean;
  minimumSts: number | null;
  organizerApprovalRequired: boolean;
  status: string;
}

export interface OrganizerDTO {
  userId: string;
  name: string;
  slug: string | null;
  isOwner: boolean;
  permissions: Record<string, unknown>;
}

export interface AnnouncementDTO {
  id: string;
  title: string;
  body: string;
  audience: string;
  publishedAt: string;
}

export interface TournamentDetailDTO extends TournamentCardDTO {
  id: string;
  description: string | null;
  venueName: string | null;
  addressText: string | null;
  timezone: string;
  registrationOpenAt: string | null;
  registrationCloseAt: string | null;
  contact: string | null;
  termsText: string | null;
  paymentInstructions: string | null;
  paymentMethods: string | null;
  ownerId: string;
  ownerName: string | null;
  ownerSlug: string | null;
  maxClubsPerPlayer: number;
  divisions: DivisionDTO[];
  organizers: OrganizerDTO[];
  announcements: AnnouncementDTO[];
  interestedCount: number;
  myInterest: boolean;
  isOwner: boolean;
  canManage: boolean;
}

const SEX_LABEL: Record<string, string> = {
  men: "Men's",
  women: "Women's",
  mixed: 'Mixed',
  genderless: 'Open',
};
const FORMAT_LABEL: Record<string, string> = { singles: 'Singles', doubles: 'Doubles' };

/** Compose a human division name from its attributes (§18.1 name_override wins). */
export function divisionName(d: {
  name_override: string | null;
  skill_policy: string;
  minimum_skill: number | null;
  maximum_skill: number | null;
  format: string;
  sex_classification: string;
  minimum_age: number | null;
  maximum_age: number | null;
}): string {
  if (d.name_override && d.name_override.trim()) return d.name_override.trim();
  const parts: string[] = [SEX_LABEL[d.sex_classification] ?? '', FORMAT_LABEL[d.format] ?? ''];
  if (d.skill_policy === 'band') {
    const lo = d.minimum_skill != null ? skillByOrdinal(d.minimum_skill)?.label : null;
    const hi = d.maximum_skill != null ? skillByOrdinal(d.maximum_skill)?.label : null;
    if (lo && hi) parts.push(lo === hi ? lo : `${lo}–${hi}`);
    else if (lo) parts.push(`${lo}+`);
    else if (hi) parts.push(`up to ${hi}`);
  } else if (d.skill_policy === 'open') {
    parts.push('Open skill');
  } else {
    parts.push('Custom');
  }
  if (d.minimum_age != null && d.maximum_age != null)
    parts.push(`${d.minimum_age}–${d.maximum_age}`);
  else if (d.minimum_age != null) parts.push(`${d.minimum_age}+`);
  else if (d.maximum_age != null) parts.push(`≤${d.maximum_age}`);
  return parts.filter(Boolean).join(' ');
}

export function toDivisionDTO(row: DivisionRow): DivisionDTO {
  return {
    id: row.id,
    name: divisionName(row),
    nameOverride: row.name_override,
    skillPolicy: row.skill_policy,
    minimumSkill: row.minimum_skill,
    maximumSkill: row.maximum_skill,
    format: row.format,
    sexClassification: row.sex_classification,
    minimumAge: row.minimum_age,
    maximumAge: row.maximum_age,
    teamSize: row.team_size,
    capacityTeams: row.capacity_teams,
    feeAmount: Number(row.fee_amount),
    currency: row.currency,
    skillVerifiedRequired: row.skill_verified_required,
    minimumSts: row.minimum_sts != null ? Number(row.minimum_sts) : null,
    organizerApprovalRequired: row.organizer_approval_required,
    status: row.status,
  };
}

export function toTournamentCardDTO(row: TournamentRow): TournamentCardDTO {
  return {
    slug: row.slug,
    name: row.name,
    city: row.city,
    coverUrl: tournamentCoverUrl(row.cover_path),
    status: row.status,
    visibility: row.visibility,
    startAt: row.start_at,
    endAt: row.end_at,
  };
}

export const DIVISION_COLUMNS =
  'id, tournament_id, name_override, skill_policy, minimum_skill, maximum_skill, format, ' +
  'sex_classification, minimum_age, maximum_age, team_size, capacity_teams, fee_amount, currency, ' +
  'skill_verified_required, minimum_sts, organizer_approval_required, max_entries_per_player, ' +
  'registration_open_at, registration_close_at, status, created_at, updated_at';

export const TOURNAMENT_CARD_COLUMNS =
  'id, slug, name, city, cover_path, status, visibility, start_at, end_at';
export const TOURNAMENT_DETAIL_COLUMNS =
  `${TOURNAMENT_CARD_COLUMNS}, description, venue_name, address_text, timezone, ` +
  'registration_open_at, registration_close_at, contact, terms_text, payment_instructions, payment_methods, ' +
  'owner_organizer_id, max_divisions_per_player, max_clubs_per_player, club_representation_required, verified_clubs_only';
