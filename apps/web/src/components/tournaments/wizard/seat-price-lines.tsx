'use client';

import { formatFee, priceBasisLabel } from '@vouchplay/core';
import type { EntryQuoteSeat } from '@/lib/actions/entry-quote';

/** The small "2nd entry" / "Early bird" tag a priced seat carries (master_plan §2BQ). */
export function PriceBasisTag({ basis }: { basis: string | null | undefined }) {
  const label = priceBasisLabel(basis);
  if (!label) return null;
  return (
    <span className="bg-success/10 text-success inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap">
      {label}
    </span>
  );
}

/**
 * One line per player - who, which entry, what they pay - then the total (master_plan §2BQ E). Shown
 * wherever a team is priced seat by seat, so "You · 2nd entry PHP 1,000 + Ana PHP 1,500 = PHP 2,500"
 * reads the same on the Pay step and the receipt.
 */
export function SeatPriceLines({
  seats,
  currency,
  total,
  saved,
  showTotal = true,
}: {
  seats: EntryQuoteSeat[];
  currency: string;
  total: number;
  saved: number;
  showTotal?: boolean;
}) {
  return (
    <div className="text-left">
      <ul className="divide-border divide-y">
        {seats.map((s, i) => {
          const discounted = s.perPlayer < s.standardPerPlayer;
          return (
            <li key={s.playerId ?? `open-${i}`} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="text-foreground block truncate text-sm font-semibold">
                  {s.label}
                </span>
                <span className="mt-0.5 flex">
                  {s.basis === 'standard' ? (
                    <span className="text-foreground-muted text-[11px] font-medium">
                      {s.playerId ? '1st entry' : 'Full price'}
                    </span>
                  ) : (
                    <PriceBasisTag basis={s.basis} />
                  )}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                {discounted && (
                  <s className="text-foreground-muted block text-[11px]">
                    {formatFee(currency, s.standardPerPlayer)}
                  </s>
                )}
                <span className="text-foreground block text-sm font-bold">
                  {formatFee(currency, s.perPlayer)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {showTotal && (
        <div className="border-border mt-1 flex items-baseline justify-between border-t border-dashed pt-2">
          <span className="text-foreground-muted text-xs font-semibold">Total</span>
          <span className="text-right">
            <span className="text-foreground block text-base font-bold tabular-nums">
              {formatFee(currency, total)}
            </span>
            {saved > 0 && (
              <span className="text-success block text-[11px] font-bold">
                You save {formatFee(currency, saved)}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
