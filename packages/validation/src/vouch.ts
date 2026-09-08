import { z } from 'zod';

/**
 * Vouch form (handover §10.1). skillLevel is a canonical band ordinal 0..6. `asCoach` and
 * `anonymous` are booleans (the server further gates asCoach on the voucher actually holding an
 * approved Coach role). Comments are optional and, when present, ALWAYS attributed (§10.1).
 */
export const vouchSchema = z.object({
  targetId: z.string().uuid('Invalid target'),
  skillLevel: z.coerce.number().int().min(0, 'Select a skill level').max(6, 'Invalid skill level'),
  // 'observed' (migration 0024): watched them play, never partnered with or against them. It is a
  // CONTEXT label only - interaction type has never been an input to effective_weight (§10.5), so
  // vouch weighting is untouched.
  interactionType: z.enum(['with', 'against', 'both', 'observed'], {
    message: 'Select how you know their game',
  }),
  asCoach: z.boolean().default(false),
  anonymous: z.boolean().default(true),
  comment: z.string().trim().max(1000, 'Comment is too long').optional().or(z.literal('')),
});
export type VouchInput = z.infer<typeof vouchSchema>;

export const vouchRequestSchema = z.object({
  recipientId: z.string().uuid('Invalid recipient'),
  message: z.string().trim().max(500, 'Message is too long').optional().or(z.literal('')),
});
export type VouchRequestInput = z.infer<typeof vouchRequestSchema>;
