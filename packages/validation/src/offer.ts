import { z } from 'zod';

/**
 * Club offer (recruitment/sponsorship) form schemas (Phase 14A, handover §16). Skill targeting is
 * advisory only. Expiry is expressed in days and converted to a timestamp server-side.
 */

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));
const skillOrdinal = z.coerce.number().int().min(0).max(6).optional();

export const offerCreateSchema = z
  .object({
    type: z.enum(['recruitment', 'sponsorship']).default('recruitment'),
    title: z.string().trim().min(2, 'Add a short title').max(120, 'Title is too long'),
    description: optionalText(2000),
    city: optionalText(120),
    minSkill: skillOrdinal,
    maxSkill: skillOrdinal,
    expiresInDays: z.coerce.number().int().min(1).max(180).optional(),
  })
  .refine((d) => d.minSkill == null || d.maxSkill == null || d.minSkill <= d.maxSkill, {
    message: 'Minimum skill cannot exceed maximum skill',
    path: ['maxSkill'],
  });
export type OfferCreateInput = z.infer<typeof offerCreateSchema>;

export const offerResponseSchema = z.object({
  message: z.string().trim().max(500, 'Message is too long').optional().or(z.literal('')),
});
export type OfferResponseInput = z.infer<typeof offerResponseSchema>;
