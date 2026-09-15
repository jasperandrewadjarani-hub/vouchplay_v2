'use client';

import { useEffect, useState } from 'react';
import { getEntryQuote, type EntryQuote } from '@/lib/actions/entry-quote';
import type { DivisionDTO } from '@/lib/tournaments/dto';

/** True when a division's price can depend on who is playing (master_plan §2BQ). */
export function hasNextEntryPrice(
  d: Pick<DivisionDTO, 'feeAmount' | 'nextEntryFeeAmount'> | null | undefined,
): boolean {
  return Boolean(d && d.feeAmount > 0 && d.nextEntryFeeAmount != null);
}

/**
 * The server's per-seat price for this entry (master_plan §2BQ) - only fetched for a division that
 * has a next-entry price, so every other division keeps pricing locally with no round trip.
 * `loading` is true until the answer for the CURRENT inputs arrives; `quote` is null on failure.
 */
export function useEntryQuote(
  division: DivisionDTO | null,
  opts: { registrationId?: string | null; partnerSlug?: string | null },
): { quote: EntryQuote | null; loading: boolean; applies: boolean } {
  const applies = hasNextEntryPrice(division);
  const divisionId = division?.id ?? null;
  const registrationId = opts.registrationId ?? null;
  const partnerSlug = opts.partnerSlug ?? null;
  const key = applies ? `${divisionId}|${registrationId ?? ''}|${partnerSlug ?? ''}` : null;
  const [result, setResult] = useState<{ key: string; quote: EntryQuote | null } | null>(null);

  useEffect(() => {
    if (!key || !divisionId) return;
    let live = true;
    getEntryQuote({ divisionId, registrationId, partnerSlug })
      .then((quote) => {
        if (live) setResult({ key, quote });
      })
      .catch(() => {
        if (live) setResult({ key, quote: null });
      });
    return () => {
      live = false;
    };
  }, [key, divisionId, registrationId, partnerSlug]);

  if (!key) return { quote: null, loading: false, applies: false };
  const current = result?.key === key ? result : null;
  return { quote: current?.quote ?? null, loading: !current, applies: true };
}
