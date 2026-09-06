import { z } from 'zod';

/**
 * Safety & moderation form schemas (handover §14, §11.3, §47). Enum value tuples are locked to
 * migration 0005 + @vouchplay/config (moderation.ts). Evidence in V1 is an optional text note plus
 * optional links (stored in the `evidence` jsonb column) - private-bucket file evidence (§38) is a
 * later fold-in.
 */

const url = z.string().trim().url('Enter a valid URL').max(500);

/** Optional evidence: a short note and/or up to 5 links. Shaped to match the `evidence` jsonb. */
export const evidenceSchema = z
  .object({
    note: z.string().trim().max(2000, 'Evidence note is too long').optional().or(z.literal('')),
    links: z.array(url).max(5, 'At most 5 links').optional(),
  })
  .optional();
export type EvidenceInput = z.infer<typeof evidenceSchema>;

// ---------- Report (§14.2) ----------
export const reportSchema = z.object({
  targetType: z.enum(['player', 'comment', 'club', 'tournament'], {
    message: 'Invalid report target',
  }),
  targetId: z.string().uuid('Invalid target'),
  reasonCode: z.enum(
    [
      'harassment',
      'impersonation',
      'abusive_content',
      'fake_account',
      'spam',
      'fraud',
      'inappropriate_behavior',
      'other',
    ],
    { message: 'Select a reason' },
  ),
  details: z.string().trim().max(2000, 'Details are too long').optional().or(z.literal('')),
  evidenceNote: z
    .string()
    .trim()
    .max(2000, 'Evidence note is too long')
    .optional()
    .or(z.literal('')),
  evidenceLink: z.string().trim().max(500).optional().or(z.literal('')),
});
export type ReportInput = z.infer<typeof reportSchema>;

// ---------- Skill review (§14.1) ----------
export const skillReviewSchema = z.object({
  targetPlayerId: z.string().uuid('Invalid target'),
  tournamentId: z.string().uuid().optional().or(z.literal('')),
  reason: z.string().trim().min(1, 'Please describe the concern').max(2000, 'Reason is too long'),
  evidenceNote: z
    .string()
    .trim()
    .max(2000, 'Evidence note is too long')
    .optional()
    .or(z.literal('')),
  evidenceLink: z.string().trim().max(500).optional().or(z.literal('')),
});
export type SkillReviewInput = z.infer<typeof skillReviewSchema>;

// ---------- Block (§14.3) ----------
export const blockSchema = z.object({
  targetId: z.string().uuid('Invalid target'),
});
export type BlockInput = z.infer<typeof blockSchema>;

// ---------- Support ticket / appeal (§36.38, §47) ----------
export const supportTicketSchema = z.object({
  category: z.enum(['appeal', 'account', 'safety', 'bug', 'billing', 'other'], {
    message: 'Select a category',
  }),
  subject: z.string().trim().min(1, 'Add a subject').max(200, 'Subject is too long'),
  body: z.string().trim().min(1, 'Describe your request').max(4000, 'Message is too long'),
});
export type SupportTicketInput = z.infer<typeof supportTicketSchema>;

// ---------- Moderation action (staff, §47) ----------
export const moderationActionSchema = z.object({
  action: z.enum(
    [
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
    ],
    { message: 'Select an action' },
  ),
  reason: z.string().trim().min(1, 'A reason is required').max(2000, 'Reason is too long'),
  /** Days for temporary suspension / vouching restriction (optional; blank = indefinite). */
  durationDays: z.coerce.number().int().min(1).max(3650).optional(),
});
export type ModerationActionInput = z.infer<typeof moderationActionSchema>;
