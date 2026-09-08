'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { skillByOrdinal } from '@vouchplay/config';
import { respondToOffer, type OfferActionState } from '@/lib/actions/offer';
import type { OfferDTO } from '@/lib/offers/queries';
import { SubmitButton } from '@/components/ui/button';

const empty: OfferActionState = {};

function levelLabel(min: number | null, max: number | null): string | null {
  const lo = min != null ? skillByOrdinal(min)?.label : null;
  const hi = max != null ? skillByOrdinal(max)?.label : null;
  if (lo && hi) return lo === hi ? lo : `${lo} to ${hi}`;
  if (lo) return `${lo}+`;
  if (hi) return `Up to ${hi}`;
  return null;
}

/** One open offer with an inline respond form (Phase 14A). Respond needs opt-in and a signed-in player. */
export function OpportunityCard({
  offer,
  relevanceLabel,
  canRespond,
  alreadyResponded,
}: {
  offer: OfferDTO;
  relevanceLabel: string;
  canRespond: boolean;
  alreadyResponded: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(respondToOffer.bind(null, offer.id), empty);
  const level = levelLabel(offer.minSkill, offer.maxSkill);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <li className="border-border bg-surface rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="text-foreground block text-sm font-semibold">{offer.title}</span>
          <span className="text-foreground-muted text-xs">
            {offer.clubSlug ? (
              <Link href={`/clubs/${offer.clubSlug}`} className="text-primary font-medium">
                {offer.clubName}
              </Link>
            ) : (
              offer.clubName
            )}
            <span className="ml-1 capitalize">· {offer.type}</span>
          </span>
        </span>
        <span className="border-border text-foreground-muted shrink-0 rounded-full border px-2 py-0.5 text-[11px]">
          {relevanceLabel}
        </span>
      </div>
      {offer.description && (
        <p className="text-foreground mt-2 text-sm whitespace-pre-wrap">{offer.description}</p>
      )}
      <div className="text-foreground-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {offer.city && (
          <span className="inline-flex items-center gap-1">
            <MapPin size={12} aria-hidden />
            {offer.city}
          </span>
        )}
        {level && <span>Level: {level}</span>}
      </div>

      <div className="mt-3">
        {alreadyResponded ? (
          <p className="text-success text-xs font-medium">You have responded to this offer.</p>
        ) : !canRespond ? (
          <p className="text-foreground-muted text-xs">
            Turn on &ldquo;open to opportunities&rdquo; above to respond.
          </p>
        ) : open ? (
          <form action={formAction} className="space-y-2">
            <textarea
              name="message"
              rows={2}
              maxLength={500}
              placeholder="Add a short message (optional)"
              className="border-border bg-background text-foreground w-full rounded-xl border px-3 py-2 text-sm"
            />
            {state.error && <p className="text-danger text-xs">{state.error}</p>}
            <div className="flex gap-2">
              <SubmitButton pendingLabel="Sending…">Send response</SubmitButton>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border-border text-foreground rounded-xl border px-3 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="vp-gradient rounded-xl px-4 py-2 text-sm font-semibold text-white"
          >
            I&apos;m interested
          </button>
        )}
      </div>
    </li>
  );
}
