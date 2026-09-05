/**
 * Database types for the applied schema (migrations 0001–0002).
 *
 * NOTE: normally generated with `supabase gen types typescript --project-id <ref>`. The Supabase CLI
 * / access token was not available in the build environment, so these are hand-authored to match the
 * migrations exactly. Keep in sync when new migrations land, or regenerate once the CLI is wired up.
 * Only tables that currently exist live here; Phase-3+ tables (vouches, clubs, achievements, …) are
 * added alongside their migrations.
 */

export type Sex = 'male' | 'female';
export type AccountStatus = 'active' | 'restricted' | 'suspended' | 'banned' | 'deactivated';
export type GlobalRole = 'coach' | 'organizer' | 'moderator' | 'support' | 'admin' | 'super_admin';
export type RoleStatus = 'active' | 'revoked';
export type ApplicationRole = 'coach' | 'organizer';
export type ApplicationStatus = 'pending' | 'reviewing' | 'approved' | 'rejected' | 'withdrawn';
export type IdentityVerificationStatus =
  | 'pending'
  | 'reviewing'
  | 'approved'
  | 'rejected'
  | 'resubmit_required';

export interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  slug: string | null;
  city: string | null;
  sex: Sex | null;
  date_of_birth: string | null;
  avatar_path: string | null;
  bio: string | null;
  self_rated_skill: number | null;
  facebook_url: string | null;
  looking_for_partner: boolean;
  open_for_sponsorship: boolean;
  profile_visibility: Record<string, unknown>;
  account_status: AccountStatus;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UserRoleRow {
  id: string;
  user_id: string;
  role: GlobalRole;
  status: RoleStatus;
  approved_by: string | null;
  approved_at: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
  reason: string | null;
  created_at: string;
}

export interface IdentityVerificationRow {
  id: string;
  user_id: string;
  document_type: string | null;
  document_storage_path: string | null;
  status: IdentityVerificationStatus;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_reason: string | null;
  document_delete_after: string | null;
  document_deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemSettingRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}
