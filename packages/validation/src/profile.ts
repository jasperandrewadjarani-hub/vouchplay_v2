import { z } from 'zod';

/**
 * Profile onboarding (handover §7.3). Required: first/last name, nickname, sex, self-rated skill.
 * City is required for the V1 launch region (Admin can relax later). self_rated_skill is a canonical
 * skill-band ordinal 0..6 (§3.1 — order is LOCKED; mirrored in @vouchplay/config SKILL_BANDS).
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
  city: z.string().trim().min(1, 'City is required').max(80),
  facebookUrl: z.string().trim().url('Enter a valid URL').max(300).optional().or(z.literal('')),
  bio: z.string().trim().max(300).optional().or(z.literal('')),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
