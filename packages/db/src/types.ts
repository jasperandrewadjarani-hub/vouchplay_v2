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
  'pending' | 'reviewing' | 'approved' | 'rejected' | 'resubmit_required';

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
  // Moderation-action metadata (migration 0005).
  status_reason: string | null;
  status_updated_at: string | null;
  status_updated_by: string | null;
  suspended_until: string | null;
  vouching_restricted_until: string | null;
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

// ---------- Vouch engine (migration 0004) ----------
export type VouchInteraction = 'with' | 'against';
export type VouchVisibility = 'anonymous' | 'public';
export type VouchStatus = 'active' | 'withdrawn' | 'invalidated';
export type VouchChangeType = 'created' | 'updated' | 'withdrawn' | 'invalidated' | 'reinstated';
export type VouchCommentStatus = 'active' | 'hidden' | 'removed';
export type VouchRequestStatus = 'pending' | 'fulfilled' | 'dismissed' | 'cancelled' | 'expired';
export type SkillVerificationType = 'none' | 'community' | 'admin_override';

export interface VouchRow {
  id: string;
  voucher_id: string;
  target_id: string;
  skill_level: number;
  interaction_type: VouchInteraction;
  visibility: VouchVisibility;
  used_coach_weight: boolean;
  effective_weight: number;
  weight_rule_version: string;
  status: VouchStatus;
  created_at: string;
  updated_at: string;
  invalidated_by: string | null;
  invalidation_reason: string | null;
}

export interface VouchCommentRow {
  id: string;
  vouch_id: string;
  author_id: string;
  target_id: string;
  body: string;
  status: VouchCommentStatus;
  created_at: string;
  updated_at: string;
}

export interface VouchRequestRow {
  id: string;
  requester_id: string;
  recipient_id: string;
  message: string | null;
  status: VouchRequestStatus;
  created_at: string;
  fulfilled_at: string | null;
}

export interface PlayerSkillProfileRow {
  player_id: string;
  community_skill_level: number | null;
  weighted_mean: number | null;
  sts: number;
  unique_voucher_count: number;
  effective_weight_sum: number;
  agreement_component: number;
  count_component: number;
  weight_component: number;
  distribution: Record<string, number>;
  skill_verified: boolean;
  verification_type: SkillVerificationType;
  algorithm_version: string;
  calculated_at: string;
}

export interface BlockRow {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

// ---------- Fraud flags (migration 0004) ----------
export type FraudSubjectType = 'user' | 'vouch' | 'cluster' | 'coach';
export type FraudStatus = 'open' | 'reviewing' | 'cleared' | 'action_taken';

export interface FraudFlagRow {
  id: string;
  subject_type: FraudSubjectType;
  subject_id: string;
  flag_type: string;
  severity: string | null;
  evidence: Record<string, unknown>;
  status: FraudStatus;
  reviewed_by: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Safety & moderation (migration 0005) ----------
export type ReportTargetType = 'player' | 'comment' | 'club' | 'tournament';
export type ReportReasonCode =
  | 'harassment'
  | 'impersonation'
  | 'abusive_content'
  | 'fake_account'
  | 'spam'
  | 'fraud'
  | 'inappropriate_behavior'
  | 'other';
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type SkillReviewStatus =
  | 'open'
  | 'under_review'
  | 'resolved_no_change'
  | 'resolved_admin_note'
  | 'resolved_vouch_action'
  | 'closed';
export type SupportTicketStatus = 'open' | 'pending_user' | 'pending_staff' | 'resolved' | 'closed';

export interface ReportRow {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason_code: ReportReasonCode;
  details: string | null;
  evidence: Record<string, unknown>;
  status: ReportStatus;
  assigned_to: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkillReviewRow {
  id: string;
  requester_id: string;
  target_player_id: string;
  tournament_id: string | null;
  division_id: string | null;
  reason: string;
  evidence: Record<string, unknown>;
  status: SkillReviewStatus;
  reviewed_by: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketRow {
  id: string;
  user_id: string | null;
  category: string;
  subject: string;
  body: string;
  status: SupportTicketStatus;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  reason: string | null;
  request_id: string | null;
  created_at: string;
}
