'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { publishOffer, closeOffer, cancelOffer, decideResponse } from '@/lib/actions/offer';
import type { OfferDTO, OfferResponseDTO } from '@/lib/offers/queries';

/** Club-side offers list with publish/close/cancel and per-response accept/decline (Phase 14A). */
export function ClubOffersManager({
  offers,
  responsesByOffer,
}: {
  offers: OfferDTO[];
  responsesByOffer: Record<string, OfferResponseDTO[]>;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      setMsg(res.error ?? res.message ?? null);
      if (res.ok) router.refresh();
    });
  }

  if (offers.length === 0) {
    return (
      <p className="text-foreground-muted text-sm">No offers yet. Create your first draft above.</p>
    );
  }

  return (
    <div className="space-y-3">
      {msg && (
        <p className="text-foreground-muted text-xs" aria-live="polite">
          {msg}
        </p>
      )}
      <ul className="space-y-3">
        {offers.map((o) => {
          const responses = (responsesByOffer[o.id] ?? []).filter((r) => r.status !== 'withdrawn');
          const pendingResponses = responses.filter((r) => r.status === 'submitted');
          return (
            <li key={o.id} className="border-border bg-surface rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="text-foreground text-sm font-semibold">{o.title}</span>
                  <span className="text-foreground-muted ml-2 text-xs capitalize">{o.type}</span>
                </span>
                <span className="text-foreground-muted text-xs capitalize">{o.status}</span>
              </div>
              {o.description && (
                <p className="text-foreground-muted mt-1 line-clamp-2 text-xs">{o.description}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {o.status === 'draft' && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => publishOffer(o.id))}
                    className="vp-gradient rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Publish
                  </button>
                )}
                {o.status === 'open' && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => closeOffer(o.id))}
                    className="border-border text-foreground rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    Close
                  </button>
                )}
                {(o.status === 'draft' || o.status === 'open') && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirm('Cancel this offer? It will no longer be visible to players.'))
                        run(() => cancelOffer(o.id));
                    }}
                    className="text-danger border-border rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <div className="border-border mt-3 border-t pt-2">
                <p className="text-foreground-muted text-xs font-semibold">
                  Responses ({responses.length}
                  {pendingResponses.length > 0 ? `, ${pendingResponses.length} new` : ''})
                </p>
                {responses.length === 0 ? (
                  <p className="text-foreground-muted mt-1 text-xs">No responses yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {responses.map((r) => (
                      <li
                        key={r.id}
                        className="border-border bg-surface-muted flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2"
                      >
                        <span className="min-w-0">
                          {r.playerSlug ? (
                            <Link
                              href={`/players/${r.playerSlug}`}
                              className="text-primary text-sm font-medium"
                            >
                              {r.playerName}
                            </Link>
                          ) : (
                            <span className="text-foreground text-sm font-medium">
                              {r.playerName}
                            </span>
                          )}
                          {r.message && (
                            <span className="text-foreground-muted block text-xs">{r.message}</span>
                          )}
                        </span>
                        {r.status === 'submitted' ? (
                          <span className="flex gap-1.5">
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => decideResponse(r.id, true))}
                              aria-label={`Accept ${r.playerName}`}
                              className="text-success border-border inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                            >
                              <Check size={13} aria-hidden />
                              Accept
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => decideResponse(r.id, false))}
                              aria-label={`Decline ${r.playerName}`}
                              className="text-foreground-muted border-border inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                            >
                              <X size={13} aria-hidden />
                              Decline
                            </button>
                          </span>
                        ) : (
                          <span className="text-foreground-muted text-xs capitalize">
                            {r.status}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
