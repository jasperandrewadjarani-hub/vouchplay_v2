import { z } from 'zod';

/** Auth boundary schemas (handover §7, §35.2). */

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email address')
  .max(254);

// One-time email verification code (Supabase email OTP).
export const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your email');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be 72 characters or fewer'); // bcrypt limit

export const signInWithPasswordSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const requestOtpSchema = z.object({ email: emailSchema });

export const verifyOtpSchema = z.object({ email: emailSchema, token: otpSchema });

export const setPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

export const resetPasswordRequestSchema = z.object({ email: emailSchema });

// In-app password reset by 6-digit recovery code (master_plan §2BD-A) - reuses the OTP token rule
// (otpSchema) and the same "Passwords do not match" confirm-field refine as setPasswordSchema.
export const resetPasswordWithCodeSchema = z
  .object({
    email: emailSchema,
    token: otpSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

export type SignInWithPasswordInput = z.infer<typeof signInWithPasswordSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ResetPasswordWithCodeInput = z.infer<typeof resetPasswordWithCodeSchema>;
