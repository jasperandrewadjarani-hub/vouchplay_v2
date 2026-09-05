/**
 * Payment provider abstraction (handover §24.5). V1 ships the MANUAL provider — the organizer
 * verifies proof by hand and there is no gateway call. The interface exists so a real gateway
 * (PayMongo, Stripe, GCash API, …) can be added later without touching registration domain logic.
 */

export type PaymentProviderKind = 'manual' | 'gateway';

export interface PaymentIntentRequest {
  registrationId: string;
  amountDue: number;
  currency: string;
}

export interface PaymentIntentResult {
  /** Whether the payer must complete an out-of-band step (manual proof) vs a redirect (gateway). */
  requiresManualProof: boolean;
  /** For a future gateway: a hosted-checkout / intent reference. Null for manual. */
  gatewayReference: string | null;
}

export interface PaymentProvider {
  readonly kind: PaymentProviderKind;
  createIntent(req: PaymentIntentRequest): Promise<PaymentIntentResult>;
}

/** The V1 default: manual proof submission, no gateway. */
export class ManualPaymentProvider implements PaymentProvider {
  readonly kind = 'manual' as const;
  async createIntent(_req: PaymentIntentRequest): Promise<PaymentIntentResult> {
    return { requiresManualProof: true, gatewayReference: null };
  }
}

export const defaultPaymentProvider: PaymentProvider = new ManualPaymentProvider();
