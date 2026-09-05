/**
 * Safety & moderation canonical constants (handover §14, §11.3, §47).
 *
 * These label maps are the single source of truth for the UI copy and the enum-value contract shared
 * between the DB (migration 0005), the Zod schemas (@vouchplay/validation), and the app. The enum
 * VALUES are locked to the migration; only labels/descriptions are cosmetic.
 */

// ---------- Report reason codes (§14.2) ----------
export const REPORT_REASON_CODES = [
  'harassment',
  'impersonation',
  'abusive_content',
  'fake_account',
  'spam',
  'fraud',
  'inappropriate_behavior',
  'other',
] as const;
export type ReportReasonCode = (typeof REPORT_REASON_CODES)[number];

export const REPORT_REASON_LABELS: Record<ReportReasonCode, string> = {
  harassment: 'Harassment',
  impersonation: 'Impersonation',
  abusive_content: 'Abusive content',
  fake_account: 'Fake account',
  spam: 'Spam',
  fraud: 'Fraud',
  inappropriate_behavior: 'Inappropriate behavior',
  other: 'Other policy violation',
};

// ---------- Report target types (§36.33) ----------
export const REPORT_TARGET_TYPES = ['player', 'comment', 'club', 'tournament'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

// ---------- Report statuses (§14.2) ----------
export const REPORT_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Open',
  reviewing: 'Reviewing',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

// ---------- Skill review statuses (§14.1) ----------
export const SKILL_REVIEW_STATUSES = [
  'open',
  'under_review',
  'resolved_no_change',
  'resolved_admin_note',
  'resolved_vouch_action',
  'closed',
] as const;
export type SkillReviewStatus = (typeof SKILL_REVIEW_STATUSES)[number];

export const SKILL_REVIEW_STATUS_LABELS: Record<SkillReviewStatus, string> = {
  open: 'Open',
  under_review: 'Under review',
  resolved_no_change: 'Resolved — no change',
  resolved_admin_note: 'Resolved — admin note',
  resolved_vouch_action: 'Resolved — vouch action',
  closed: 'Closed',
};

// ---------- Fraud-flag statuses (§11.3) ----------
export const FRAUD_FLAG_STATUSES = ['open', 'reviewing', 'cleared', 'action_taken'] as const;
export type FraudFlagStatus = (typeof FRAUD_FLAG_STATUSES)[number];

export const FRAUD_FLAG_STATUS_LABELS: Record<FraudFlagStatus, string> = {
  open: 'Open',
  reviewing: 'Reviewing',
  cleared: 'Cleared',
  action_taken: 'Action taken',
};

// ---------- Support ticket statuses (§36.38) ----------
export const SUPPORT_TICKET_STATUSES = [
  'open',
  'pending_user',
  'pending_staff',
  'resolved',
  'closed',
] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_CATEGORIES = [
  'appeal',
  'account',
  'safety',
  'bug',
  'billing',
  'other',
] as const;
export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];

export const SUPPORT_TICKET_CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  appeal: 'Appeal a moderation action',
  account: 'Account issue',
  safety: 'Safety concern',
  bug: 'Report a bug',
  billing: 'Billing',
  other: 'Something else',
};

// ---------- Moderation actions (§47, §11.3) ----------
/** The moderation actions a staff member can take. Each writes an append-only audit_logs row. */
export const MODERATION_ACTIONS = [
  'dismiss',
  'warn',
  'invalidate_vouch',
  'restrict_vouching',
  'restrict_account',
  'suspend',
  'ban',
  'hide_content',
  'remove_content',
  'lift_status',
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];
