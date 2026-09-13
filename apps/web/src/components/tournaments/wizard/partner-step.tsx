'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import {
  searchInvitablePlayers,
  getPlayerBySlugForInvite,
  type PlayerSearchResult,
} from '@/lib/actions/registration';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { formatMonthDay } from '@/lib/format-date';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import type { WizardPartner } from './types';

/** `mergeNote` (master_plan §2AT Decision A) - a one-liner explaining that choosing this player
 *  merges their own solo entry into the new team. Declared here as a forward-compat extension of
 *  `PlayerSearchResult` rather than a required field, so this file still typechecks the moment the
 *  server contract lands it (see registration.ts `PlayerSearchResult`). */
type SearchResult = PlayerSearchResult & { mergeNote?: string | null };

/**
 * Step 2 (doubles only): name a partner now, or choose one later (master_plan §2AO B). Reuses the
 * debounced search from the old `PartnerInviteForm`, which this wizard replaces - that file is
 * deleted, its search UI lives here now. No "looking for a partner" toggle anywhere in this step
 * (Decision F).
 */
export function PartnerStep({
  divisionId,
  state,
  prefillSlug = null,
  onContinue,
}: {
  divisionId: string;
  state: ViewerRegistrationState;
  /** `?partner=<slug>` (master_plan §2AV F) - resolved once on mount via a minimal exact-slug lookup
   *  and dropped straight onto the acknowledgement screen, skipping the search box. */
  prefillSlug?: string | null;
  onContinue: (partner: WizardPartner | null, acknowledgedPartner: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [chosen, setChosen] = useState<SearchResult | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [searching, setSearching] = useState(false);
  const [prefillPending, setPrefillPending] = useState(Boolean(prefillSlug));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!prefillSlug) {
      setPrefillPending(false);
      return;
    }
    let cancelled = false;
    setPrefillPending(true);
    void getPlayerBySlugForInvite(prefillSlug).then((found) => {
      if (cancelled) return;
      if (found) {
        setChosen({ slug: found.slug, name: found.name, city: null, blockedReason: null });
      }
      setPrefillPending(false);
    });
    return () => {
      cancelled = true;
    };
    // Runs once per mount for a given prefill target - the step remounts fresh each time the wizard
    // returns to it (Back to Division and forward again), which is the natural place to re-apply it.
  }, [prefillSlug]);

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

  if (prefillPending) {
    return <p className="text-foreground-muted text-sm">Loading your partner…</p>;
  }

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
          <p className="text-foreground text-sm">
            Only continue if you&rsquo;ve already agreed to play together.
          </p>
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
                {!p.blockedReason && p.mergeNote && (
                  <span className="text-foreground-muted mt-0.5 block text-xs">{p.mergeNote}</span>
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

/**
 * Partner step, guest variant (master_plan §2AU Decision D, item 4): no search - a guest has no
 * account yet to search from, and inviting a third party by email is phase 2 (Deferred). Just a name,
 * kept as a plain note on the registration until the guest verifies and can send a real invitation.
 */
export function GuestPartnerStep({
  onContinue,
}: {
  /** `partnerNote` is the trimmed name, or null when left blank / deferred entirely. */
  onContinue: (partnerNote: string | null) => void;
}) {
  const [name, setName] = useState('');

  return (
    <div className="space-y-3">
      <Field label="Your partner's name" htmlFor="guest-partner-note" hint="Optional">
        <Input
          id="guest-partner-note"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Maria Santos"
        />
      </Field>
      <p className="text-foreground-muted text-xs">
        You&rsquo;ll invite them after you verify your email.
      </p>
      <Button type="button" onClick={() => onContinue(name.trim() || null)} className="w-full">
        Continue
      </Button>
      <button
        type="button"
        onClick={() => onContinue(null)}
        className="text-foreground-muted hover:text-foreground min-h-11 w-full text-center text-sm font-medium underline underline-offset-2"
      >
        I&rsquo;ll choose a partner later
      </button>
    </div>
  );
}
