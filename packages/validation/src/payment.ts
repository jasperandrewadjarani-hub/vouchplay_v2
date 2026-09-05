import { z } from 'zod';

/**
 * Payment proof submission (handover §24.2). V1 is manual proof: the payer records who paid, an
 * optional reference, and uploads a proof file (handled separately, not in this schema).
 */
export const paymentSubmitSchema = z.object({
  method: z.string().trim().min(1, 'Select or enter a method').max(80),
  payerName: z.string().trim().max(120).optional().or(z.literal('')),
  transactionReference: z.string().trim().max(120).optional().or(z.literal('')),
  amountSubmitted: z.coerce.number().min(0).max(10000000).optional(),
});
export type PaymentSubmitInput = z.infer<typeof paymentSubmitSchema>;
