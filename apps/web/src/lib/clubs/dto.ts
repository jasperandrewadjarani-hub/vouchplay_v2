/**
 * Club DTO projections (handover §15.5, §37). Public reads expose only safe club fields; viewer-
 * specific flags (my membership / can-manage) are layered on server-side, never cached publicly.
 */
import type { ClubRow, ClubRole, ClubMembershipStatus, ClubPrivacy } from '@vouchplay/db';
import { clubLogoUrl } from '@/lib/storage';

export interface ClubViewer {
  viewerId: string | null;
  isStaff: boolean;
}

export const ANON_CLUB_VIEWER: ClubViewer = { viewerId: null, isStaff: false };

export interface ClubCardDTO {
  slug: string;
  name: string;
  city: string | null;
  logoUrl: string | null;
  verified: boolean;
  memberCount: number;
  privacy: ClubPrivacy;
}

export interface ClubMemberDTO {
  userId: string;
  name: string;
  slug: string | null;
  initials: string;
  avatarUrl: string | null;
  role: ClubRole;
  status: ClubMembershipStatus;
  since: string | null;
}

export interface ClubDetailDTO extends ClubCardDTO {
  id: string;
  description: string | null;
  contact: string | null;
  socialLinks: Record<string, unknown>;
  createdAt: string;
  verificationStatus: string;
  activityStatus: string;
  owners: ClubMemberDTO[];
  admins: ClubMemberDTO[];
  /** The viewer's own membership (any status), or null. */
  myMembership: { role: ClubRole; status: ClubMembershipStatus } | null;
  isOwner: boolean;
  isManager: boolean;
  isMember: boolean;
  canManage: boolean;
}

/** The exact column lists every club read selects — never `select('*')` (§34A/§35). */
export const CLUB_CARD_COLUMNS =
  'id, slug, name, city, logo_path, privacy, verification_status, activity_status';
export const CLUB_DETAIL_COLUMNS = `${CLUB_CARD_COLUMNS}, description, contact, social_links, created_by, created_at`;

export function toClubCardDTO(row: ClubRow, memberCount: number): ClubCardDTO {
  return {
    slug: row.slug,
    name: row.name,
    city: row.city,
    logoUrl: clubLogoUrl(row.logo_path),
    verified: row.verification_status === 'verified',
    memberCount,
    privacy: row.privacy,
  };
}
