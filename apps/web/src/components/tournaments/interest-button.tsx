'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { TOURNAMENT_DEMAND_DIVISIONS } from '@vouchplay/core';
import { submitTournamentDemandInterest } from '@/lib/actions/tournament';
import { Modal } from '@/components/ui/modal';

const btn =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2';

/** Demand is collected before it is counted and never creates a registration or a slot. */
export function InterestButton({
  tournamentId,
  slug,
  authed,
  interested,
}: {
  tournamentId: string;
  slug: string;
  authed: boolean;
  interested: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [division, setDivision] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    if (!division) return setMessage('Choose the division you would be most interested in.');
    start(async () => {
      const result = await submitTournamentDemandInterest(tournamentId, slug, division);
      if (result.error) return setMessage(result.error);
      setMessage(result.message ?? 'Your interest has been counted.');
      router.refresh();
    });
  };
  const complete = message?.startsWith('Your interest');
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMessage(null);
          setOpen(true);
        }}
        className={`${btn} border ${interested ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:bg-surface-muted'}`}
      >
        <Star size={16} aria-hidden className={interested ? 'fill-current' : ''} />
        {interested ? 'Update interest' : "I'm interested"}
      </button>
      {open && (
        <Modal
          title={complete ? 'Interest recorded' : 'Tell us what you would play'}
          subtitle={
            complete
              ? 'Your interest has been counted. This is not registration or a reserved slot.'
              : undefined
          }
          onClose={() => setOpen(false)}
        >
          {complete ? (
            <div className="space-y-4">
              {!authed && (
                <div className="border-primary/30 bg-primary/5 space-y-3 rounded-xl border p-3">
                  <p className="text-foreground text-sm font-medium">
                    Be ready when registration opens
                  </p>
                  <p className="text-foreground-muted text-xs">
                    Create a profile now to register when it opens.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/signup?next=${encodeURIComponent(`/tournaments/${slug}`)}`}
                      className="vp-gradient rounded-lg px-3 py-2 text-xs font-semibold text-white"
                    >
                      Create profile
                    </Link>
                    <Link
                      href={`/signup?next=${encodeURIComponent('/clubs/new')}`}
                      className="border-border text-foreground rounded-lg border px-3 py-2 text-xs font-semibold"
                    >
                      Create a club
                    </Link>
                    <Link
                      href="/players?lookingForPartner=1"
                      className="border-border text-foreground rounded-lg border px-3 py-2 text-xs font-semibold"
                    >
                      Find a partner
                    </Link>
                  </div>
                </div>
              )}
              {authed && (
                <Link
                  href="/players?lookingForPartner=1"
                  className="border-border text-foreground block w-full rounded-xl border px-4 py-2.5 text-center text-sm font-semibold"
                >
                  Find a partner
                </Link>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border-border text-foreground w-full rounded-xl border px-4 py-2.5 text-sm font-semibold"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="text-foreground text-sm font-medium">
                  Most interested division
                </span>
                <select
                  value={division}
                  onChange={(event) => setDivision(event.target.value)}
                  disabled={pending}
                  className="border-border bg-surface text-foreground mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm"
                >
                  <option value="">Select a division</option>
                  {TOURNAMENT_DEMAND_DIVISIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-foreground-muted text-xs">
                No account needed. Choose the division you would most like to play.
              </p>
              {message && (
                <p role="alert" className="text-danger text-sm">
                  {message}
                </p>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="vp-gradient w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? 'Saving interest…' : 'Count my interest'}
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
