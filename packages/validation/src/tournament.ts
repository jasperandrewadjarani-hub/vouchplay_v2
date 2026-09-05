import { z } from 'zod';

/**
 * Tournament + division form schemas (handover §17, §18). Enum values locked to migration 0007.
 * Datetime fields arrive as `datetime-local` strings and are optional; the server converts them to
 * ISO. Cover photo is a separate optional file upload.
 */

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));
const optionalDate = z.string().trim().optional().or(z.literal(''));

export const tournamentCreateSchema = z.object({
  name: z.string().trim().min(2, 'Tournament name is too short').max(120, 'Name is too long'),
  city: optionalText(120),
  venueName: optionalText(200),
  description: optionalText(4000),
  visibility: z.enum(['public', 'unlisted']).default('public'),
  startAt: optionalDate,
  endAt: optionalDate,
  registrationOpenAt: optionalDate,
  registrationCloseAt: optionalDate,
  contact: optionalText(200),
  termsText: optionalText(8000),
  paymentInstructions: optionalText(2000),
});
export type TournamentCreateInput = z.infer<typeof tournamentCreateSchema>;

export const tournamentUpdateSchema = tournamentCreateSchema;
export type TournamentUpdateInput = z.infer<typeof tournamentUpdateSchema>;

const skillOrdinal = z.coerce.number().int().min(0).max(6).optional();
const ageValue = z.coerce.number().int().min(0).max(120).optional();

export const divisionSchema = z
  .object({
    nameOverride: optionalText(120),
    skillPolicy: z.enum(['band', 'open', 'custom']).default('open'),
    minimumSkill: skillOrdinal,
    maximumSkill: skillOrdinal,
    format: z.enum(['singles', 'doubles']).default('doubles'),
    sexClassification: z.enum(['men', 'women', 'mixed', 'genderless']).default('mixed'),
    minimumAge: ageValue,
    maximumAge: ageValue,
    teamSize: z.coerce.number().int().min(1).max(6).default(2),
    capacityTeams: z.coerce.number().int().min(0).max(100000).default(0),
    feeAmount: z.coerce.number().min(0).max(1000000).default(0),
    currency: z.string().trim().length(3).default('PHP'),
    skillVerifiedRequired: z.boolean().default(false),
    minimumSts: z.coerce.number().min(0).max(5).optional(),
    organizerApprovalRequired: z.boolean().default(false),
    registrationOpenAt: optionalDate,
    registrationCloseAt: optionalDate,
  })
  .refine(
    (d) => d.minimumSkill == null || d.maximumSkill == null || d.minimumSkill <= d.maximumSkill,
    { message: 'Minimum skill cannot exceed maximum skill', path: ['maximumSkill'] },
  )
  .refine((d) => d.minimumAge == null || d.maximumAge == null || d.minimumAge <= d.maximumAge, {
    message: 'Minimum age cannot exceed maximum age',
    path: ['maximumAge'],
  });
export type DivisionInput = z.infer<typeof divisionSchema>;

export const announcementSchema = z.object({
  title: z.string().trim().min(1, 'Add a title').max(200, 'Title is too long'),
  body: z.string().trim().min(1, 'Add a message').max(4000, 'Message is too long'),
  audience: z.enum(['all', 'confirmed', 'waitlisted', 'pending', 'division']).default('all'),
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;

export const organizerApplicationSchema = z.object({
  motivation: z
    .string()
    .trim()
    .min(10, 'Tell us a bit about your organizing experience')
    .max(2000, 'Too long'),
});
export type OrganizerApplicationInput = z.infer<typeof organizerApplicationSchema>;
