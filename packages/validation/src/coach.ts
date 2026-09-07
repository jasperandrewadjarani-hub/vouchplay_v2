import { z } from 'zod';

const httpUrl = z
  .string()
  .trim()
  .url('Enter a complete public reference URL.')
  .refine((value) => /^https?:\/\//i.test(value), 'Reference links must use http or https.');

export const coachApplicationSchema = z.object({
  experience: z
    .string()
    .trim()
    .min(20, 'Describe at least a little of your coaching experience.')
    .max(3000),
  yearsExperience: z.coerce.number().int().min(0).max(80),
  organizations: z.string().trim().max(1500).default(''),
  locations: z.string().trim().min(2, 'Add at least one coaching location.').max(1000),
  specialties: z.array(z.string().trim().min(2).max(80)).min(1).max(12),
  certifications: z.string().trim().max(2000).default(''),
  references: z.array(httpUrl).min(1, 'Add at least one public reference link.').max(10),
  note: z.string().trim().max(2000).default(''),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Confirm that VouchPlay may check your claims.' }),
  }),
});

export type CoachApplicationInput = z.infer<typeof coachApplicationSchema>;

export const coachDecisionSchema = z
  .object({
    decision: z.enum(['request_information', 'approve', 'reject']),
    applicantReason: z.string().trim().max(2000).default(''),
    internalNote: z.string().trim().max(2000).default(''),
  })
  .superRefine((value, ctx) => {
    if (
      (value.decision === 'request_information' || value.decision === 'reject') &&
      value.applicantReason.length < 10
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['applicantReason'],
        message: 'Give the applicant a useful reason of at least 10 characters.',
      });
    }
    if (value.decision === 'approve' && value.internalNote.length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['internalNote'],
        message: 'Add an internal confirmation note of at least 10 characters.',
      });
    }
  });
