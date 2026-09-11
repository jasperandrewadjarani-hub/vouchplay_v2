import { z } from 'zod';
import { isValidPhCity, normalizeCity } from '@vouchplay/config';

/**
 * Profile onboarding (handover §7.3). Required: first/last name, nickname, sex, self-rated skill.
 * City is required for the V1 launch region (Admin can relax later). self_rated_skill is a canonical
 * skill-band ordinal 0..6 (§3.1 - order is LOCKED; mirrored in @vouchplay/config SKILL_BANDS).
 *
 * City (master_plan §2AI - strict validation): the field is required, `normalizeCity` runs in the
 * transform so every NEW save stores the canonical PH spelling, and a `.refine` then enforces exact
 * membership of the Philippine cities/municipalities list via `isValidPhCity`. Garbage ("Za"), bare
 * provinces ("Bulacan"), and empty input are rejected with a clear, non-technical message; a real
 * resident's place always passes. This schema powers BOTH `completeOnboarding` and `updateProfile`,
 * so the server is the backstop for both onboarding and profile edit regardless of the client picker.
 */

export const SEX_VALUES = ['male', 'female'] as const;

export const onboardingSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  nickname: z.string().trim().min(1, 'Nickname / IGN is required').max(40),
  sex: z.enum(SEX_VALUES, { message: 'Select a sex' }),
  selfRatedSkill: z.coerce
    .number()
    .int()
    .min(0, 'Select your skill level')
    .max(6, 'Invalid skill level'),
  city: z
    .string()
    .trim()
    .min(1, 'City is required')
    .max(80)
    .transform((city) => normalizeCity(city))
    .refine((city) => isValidPhCity(city), { message: 'Please choose your city from the list.' }),
  facebookUrl: z.string().trim().url('Enter a valid URL').max(300).optional().or(z.literal('')),
  bio: z.string().trim().max(300).optional().or(z.literal('')),
  // Player availability flags (§2L). Set by the player; read by the directory badge and filter.
  lookingForPartner: z.boolean().optional().default(false),
  openForSponsorship: z.boolean().optional().default(false),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
