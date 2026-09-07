import 'server-only';
import type { AnalyticsEvent } from '@vouchplay/analytics';

/**
 * Privacy-minimal product analytics adapter. Vercel captures this structured event and a later
 * provider can replace the sink without changing domain actions. Never pass evidence, names,
 * voucher identities, free-text reasons, email addresses, or raw scoring/fraud facts.
 */
export function emitAnalyticsEvent(
  event: AnalyticsEvent,
  properties: Readonly<Record<string, string | number | boolean | null>> = {},
): void {
  console.info('[vouchplay-analytics]', JSON.stringify({ event, properties }));
}
