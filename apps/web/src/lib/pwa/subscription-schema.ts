import { z } from 'zod';

/**
 * Shape of a browser `PushSubscription` as it reaches the server (master_plan §2AY D). Deliberately a
 * PLAIN module - no `server-only`, no 'use server' - because both the server action
 * (`lib/actions/push.ts`) and the `pushsubscriptionchange` route (`app/api/push/subscribe`) validate
 * with it, and the client passes a value typed by it.
 *
 * Endpoints must be https (every real push service is), and every field is length-bounded so a
 * hostile or buggy caller cannot write unbounded text into `push_subscriptions`.
 */
export const pushSubscriptionInputSchema = z.object({
  endpoint: z.string().url().max(2048).startsWith('https://', 'Endpoint must be https.'),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
  userAgent: z.string().trim().max(512).optional(),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;
