'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { searchInvitablePlayers, type PlayerSearchResult } from '@/lib/actions/registration';
import { Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { formatMonthDay } from '@/lib/format-date';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import type { WizardPartner } from './types';

/**
 * Step 2 (doubles only): name a partner now, or choose one later (master_plan §2AO B). Reuses the
 * debounced search from the old `PartnerInviteForm`, which this wizard replaces - that file is
 * deleted, its search UI lives here now. No "looking for a partner" toggle anywhere in this step
 * (Decision F).
 */
export function PartnerStep({
  divisionId,
  state,
  onContinue,
}: {
  divisionId: string;
  state: ViewerRegistrationState;
  onContinue: (partner: WizardPartner | null, acknowledgedPartner: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [chosen, setChosen] = useState<PlayerSearchResult | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setSearching(false);
      setResults([]);
      return;
    }
    setSearching(true);
    setResults([]);
    timer.current = setTimeout(async () => {
      const res = await searchInvitablePlayers(q, divisionId);
      setResults(res);
      setSearching(false);
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, divisionId]);

  if (chosen) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => {
            setChosen(null);
            setAcknowledged(false);
          }}
          className="text-foreground-muted hover:text-foreground inline-flex min-h-11 items-center gap-1.5 text-sm font-medium"
        >
          <ArrowLeft size={15} aria-hidden />
          Choose someone else
        </button>

        <div>
          <p className="text-foreground-muted text-xs">Playing with</p>
          <p className="text-foreground text-base font-bold">{chosen.name}</p>
        </div>

        <div className="border-warning/40 bg-warning/10 flex gap-2.5 rounded-xl border p-3">
          <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="text-foreground space-y-1.5 text-sm">
            <p className="font-semibold">{chosen.name} has not confirmed yet.</p>
            <p>
              Only do this if you have already agreed to play together. You are about to pay for
              both of you.
            </p>
          </div>
        </div>

        <label className="border-border flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="text-foreground">
            I have already agreed with {chosen.name} that we are playing together.
          </span>
        </label>

        <Button
          type="button"
          disabled={!acknowledged}
          onClick={() => onContinue({ slug: chosen.slug, name: chosen.name }, acknowledged)}
          className="w-full"
        >
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search players by name"
        aria-label="Search for your partner"
      />
      {searching && <p className="text-foreground-muted text-xs">Searching...</p>}
      {results.length > 0 && (
        <ul className="border-border divide-border divide-y overflow-hidden rounded-xl border">
          {results.map((p) => (
            <li key={p.slug} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0 flex-1">
                <span className="text-foreground block truncate text-sm font-medium">{p.name}</span>
                {p.city && (
                  <span className="text-foreground-muted block truncate text-xs">{p.city}</span>
                )}
                {p.blockedReason && (
                  <span className="text-warning mt-0.5 block text-xs">{p.blockedReason}</span>
                )}
              </span>
              {p.blockedReason ? (
                <span className="text-foreground-muted shrink-0 text-xs font-medium">
                  Can&rsquo;t enter
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setChosen(p);
                    setAcknowledged(false);
                  }}
                  className="vp-gradient inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white"
                >
                  Choose
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !searching && results.length === 0 && (
        <p className="text-foreground-muted text-xs">
          No players found. Your partner needs a VouchPlay account before you can enter them.
        </p>
      )}

      {state.partnerChangesOpen && (
        <button
          type="button"
          onClick={() => onContinue(null, false)}
          className="text-foreground-muted hover:text-foreground min-h-11 w-full text-center text-sm font-medium underline underline-offset-2"
        >
          I&rsquo;ll choose a partner later
          {state.partnerLockAt ? ` - before ${formatMonthDay(state.partnerLockAt)}` : ''}
        </button>
      )}
    </div>
  );
}
