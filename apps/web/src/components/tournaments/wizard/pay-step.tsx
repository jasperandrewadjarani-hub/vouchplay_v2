'use client';

import { useState } from 'react';
import { Clock, ShieldCheck, Users } from 'lucide-react';
import { formatFee } from '@vouchplay/core';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { Button } from '@/components/ui/button';
import { formatMonthDay } from '@/lib/format-date';
import { quoteFor, viewerHasOtherPaidEntry } from './shared';
import { useEntryQuote } from './use-entry-quote';
import { PriceBasisTag, SeatPriceLines } from './seat-price-lines';
import type { WizardPayFor, WizardTournament } from './types';

/**
 * Step 3: choose what to pay for (master_plan §2AO A5/B, §2AP A). Two shapes:
 *  - a division was chosen -> "Pay for my slot" / "Pay for the whole team" (doubles only);
 *  - "I'll choose a division later" was chosen -> a single "Reserve my slot" card.
 * Free divisions never reach this step (the caller skips straight to creating the entry and Done).
 */
export function PayStep({
  tournament,
  division,
  state,
  registrationId = null,
  partnerSlug = null,
  pending = false,
  onChoose,
  onPayLater,
}: {
  tournament: WizardTournament;
  /** The chosen division, or null when this is a bare-slot reservation (no division yet). */
  division: DivisionDTO | null;
  state: ViewerRegistrationState;
  /** The entry, when it already exists (Back from Receipt) - priced by the server seat by seat. */
  registrationId?: string | null;
  /** The partner named on the Partner step, so their own 1st/2nd entry can be priced (§2BQ). */
  partnerSlug?: string | null;
  /** True while `startEntry` is in flight - disables the option cards to prevent a double entry. */
  pending?: boolean;
  onChoose: (payFor: WizardPayFor) => void;
  onPayLater: () => void;
}) {
  const [payLaterOpen, setPayLaterOpen] = useState(false);
  const isReservation = !division;
  // §2BQ: before the entry exists the viewer's own seat is exact locally; the server answers for the
  // whole team (the partner's own entries decide their seat) and for an entry that already exists.
  const viewerNext =
    !registrationId && viewerHasOtherPaidEntry(state, tournament.divisions, division?.id ?? null);
  const quote = division ? quoteFor(division, tournament.earlyBird, undefined, viewerNext) : null;
  const entryQuote = useEntryQuote(division, { registrationId, partnerSlug });
  const serverMySeat = entryQuote.quote?.seats.find((s) => s.isViewer) ?? null;
  const mySeatPrice =
    serverMySeat?.perPlayer ??
    (registrationId && entryQuote.applies ? null : (quote?.perPlayer ?? null));
  const mySeatBasis = serverMySeat?.basis ?? quote?.basis ?? 'standard';
  const teamQuote = entryQuote.quote;
  const slotPrice = state.slotPrice;
  const isDoubles = Boolean(division && division.teamSize > 1);

  const earlyBirdNote = (endsAt: string | null | undefined) =>
    endsAt ? (
      <span className="text-success inline-flex items-center gap-1 text-xs font-medium">
        <Clock size={11} aria-hidden />
        Early bird until {formatMonthDay(endsAt)}
      </span>
    ) : null;

  return (
    <div className="space-y-3">
      {isReservation && slotPrice ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onChoose('reservation')}
          className="border-border bg-surface hover:border-primary/50 min-h-11 w-full rounded-xl border p-4 text-left disabled:opacity-60"
        >
          <p className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck size={16} className="text-primary" aria-hidden />
            Reserve my slot
          </p>
          <p className="text-foreground mt-1 text-lg font-bold">
            {formatFee(tournament.divisions[0]?.currency ?? 'PHP', slotPrice.perPlayer)}
          </p>
          {slotPrice.earlyBirdApplied && earlyBirdNote(slotPrice.earlyBirdEndsAt)}
          <p className="text-foreground-muted mt-1.5 text-xs">
            Holds a place in the tournament, not in a division. Pick your division any time before
            registration closes.
          </p>
        </button>
      ) : (
        division &&
        quote && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => onChoose('seat')}
              className="border-border bg-surface hover:border-primary/50 min-h-11 w-full rounded-xl border p-4 text-left disabled:opacity-60"
            >
              <p className="text-foreground text-sm font-semibold">Pay for my slot</p>
              <p className="text-foreground mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-lg font-bold">
                {mySeatPrice == null ? (
                  <span className="text-foreground-muted text-sm font-medium">
                    Working out your price…
                  </span>
                ) : (
                  <>
                    {formatFee(division.currency, mySeatPrice)}
                    {mySeatBasis === 'next_entry' && (
                      <>
                        <s className="text-foreground-muted text-xs font-medium">
                          {formatFee(division.currency, quote.standardPerPlayer)}
                        </s>
                        <PriceBasisTag basis="next_entry" />
                      </>
                    )}
                  </>
                )}
              </p>
              {mySeatBasis === 'early_bird' && earlyBirdNote(quote.earlyBirdEndsAt)}
              {isDoubles && (
                <p className="text-foreground-muted mt-1 text-xs">
                  Your partner pays their own slot.
                </p>
              )}
            </button>

            {isDoubles && (
              <button
                type="button"
                disabled={pending}
                onClick={() => onChoose('team')}
                className="border-border bg-surface hover:border-primary/50 min-h-11 w-full rounded-xl border p-4 text-left disabled:opacity-60"
              >
                <p className="text-foreground flex items-center gap-2 text-sm font-semibold">
                  <Users size={15} aria-hidden />
                  Pay for the whole team
                </p>
                {entryQuote.applies ? (
                  entryQuote.loading || !teamQuote ? (
                    <p className="text-foreground-muted mt-1 text-sm">
                      {entryQuote.loading
                        ? 'Working out the team price…'
                        : 'Price shown on the next step'}
                    </p>
                  ) : (
                    <>
                      <p className="text-foreground mt-1 text-lg font-bold">
                        {formatFee(teamQuote.currency, teamQuote.total)}
                      </p>
                      <div className="mt-1">
                        <SeatPriceLines
                          seats={teamQuote.seats}
                          currency={teamQuote.currency}
                          total={teamQuote.total}
                          saved={teamQuote.saved}
                          showTotal={false}
                        />
                      </div>
                      {teamQuote.saved > 0 && (
                        <p className="text-success text-xs font-bold">
                          You save {formatFee(teamQuote.currency, teamQuote.saved)}
                        </p>
                      )}
                    </>
                  )
                ) : (
                  <>
                    <p className="text-foreground mt-1 text-lg font-bold">
                      {formatFee(division.currency, quote.teamTotal)}
                    </p>
                    <p className="text-foreground-muted mt-1 text-xs">
                      {formatFee(division.currency, quote.perPlayer)} per player x{' '}
                      {division.teamSize} players
                    </p>
                  </>
                )}
                {quote.earlyBirdApplied && earlyBirdNote(quote.earlyBirdEndsAt)}
              </button>
            )}
          </>
        )
      )}

      <div className="border-border border-t pt-3">
        {payLaterOpen ? (
          <div className="border-warning/40 bg-warning/10 space-y-2 rounded-lg border p-3">
            {isReservation ? (
              <>
                <p className="text-foreground flex items-start gap-1.5 text-sm font-semibold">
                  <Clock size={14} className="text-warning mt-0.5 shrink-0" aria-hidden />
                  Nothing is reserved until you pay
                </p>
                <p className="text-foreground-muted text-xs leading-relaxed">
                  Closing this now creates nothing. Come back any time to reserve your slot.
                </p>
              </>
            ) : (
              <>
                <p className="text-foreground flex items-start gap-1.5 text-sm font-semibold">
                  <Clock size={14} className="text-warning mt-0.5 shrink-0" aria-hidden />
                  Your slot is not confirmed until you pay
                </p>
                <p className="text-foreground-muted text-xs leading-relaxed">
                  This entry holds your place for about {tournament.slotHoldMinutes} minutes. After
                  that the slot can go to someone else, and it is only locked in once you pay and
                  the organizer verifies it. You can come back and pay any time from My
                  registrations.
                </p>
              </>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" disabled={pending} onClick={() => setPayLaterOpen(false)}>
                Keep paying
              </Button>
              <button
                type="button"
                disabled={pending}
                onClick={onPayLater}
                className="border-border text-foreground-muted hover:text-foreground inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-medium disabled:opacity-60"
              >
                Yes, I&rsquo;ll pay later
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPayLaterOpen(true)}
            className="border-border text-foreground-muted hover:text-foreground hover:bg-surface-muted inline-flex min-h-11 w-full items-center justify-center rounded-xl border text-sm font-medium transition-colors"
          >
            I&rsquo;ll pay later
          </button>
        )}
      </div>
    </div>
  );
}
