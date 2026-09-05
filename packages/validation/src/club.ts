import { z } from 'zod';

/**
 * Club form schemas (handover §15.2). Enum values locked to migration 0006. Logo is handled as a
 * separate optional file upload (like avatars), not in these text schemas.
 */
export const clubCreateSchema = z.object({
  name: z.string().trim().min(2, 'Club name is too short').max(80, 'Club name is too long'),
  city: z.string().trim().max(120).optional().or(z.literal('')),
  description: z.string().trim().max(2000, 'Description is too long').optional().or(z.literal('')),
  privacy: z.enum(['public', 'approval_required']).default('public'),
  contact: z.string().trim().max(200).optional().or(z.literal('')),
});
export type ClubCreateInput = z.infer<typeof clubCreateSchema>;

export const clubUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Club name is too short').max(80, 'Club name is too long'),
  city: z.string().trim().max(120).optional().or(z.literal('')),
  description: z.string().trim().max(2000, 'Description is too long').optional().or(z.literal('')),
  privacy: z.enum(['public', 'approval_required']),
  contact: z.string().trim().max(200).optional().or(z.literal('')),
});
export type ClubUpdateInput = z.infer<typeof clubUpdateSchema>;
