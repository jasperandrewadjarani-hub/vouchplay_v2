'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import {
  enterWithPendingPartner,
  searchInvitablePlayers,
  type PlayerSearchResult,
} from '@/lib/actions/registration';
import { Input } from '@/components/ui/field';
import { LookingForPartnerToggle } from '@/components/players/looking-for-partner-toggle';

/**
 * Enter a doubles division with a partner, in one sitting (handover §20.1-§20.2, master_plan §1U).
 *
 * The old form sent an invite and stopped: no team existed until the partner accepted, so there was
 * nothing to register and nothing to pay for, and the player had to come back later. Now naming a
 * partner creates the team and the registration immediately, and the player goes straight to
 * payment. The partner confirms afterwards.
 *
 * Because that means paying on somebody else's behalf, step two is a deliberate stop: it names the
 * partner, says plainly that they have not confirmed, says what happens if they decline, and asks
 * for an explicit tick. A warning nobody has to touch is a warning nobody reads.
 */
export function PartnerInviteForm({
  tournamentId,
  divisionId,
  viewerLookingForPartner = false,
}: {
  tournamentId: string;
  divisionId: string;
  /** The viewer's own looking-for-partner flag, for the inline call-to-action toggle (§2M). */
  viewerLookingForPartner?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [chosen, setChosen] = useState<PlayerSearchResult | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [pending, start] = useTransition();
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setSearching(false);
      setResults([]);
      return;
    }
    // Set BEFORE the debounce is armed. Setting it inside the timer left a 300ms window where the
    // component was not searching, had no results, and had a long enough query - the exact
    // combination that renders "No players found", so every search flashed a failure first (§1Y).
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

  function updateQuery(value: string) {
    setQ(value);
    if (value.trim().length < 2) {
      if (timer.current) clearTimeout(timer.current);
      setSearching(false);
      setResults([]);
    }
  }

  function submit() {
    if (!chosen) return;
    setMsg(null);
    setIsError(false);
    const fd = new FormData();
    fd.set('divisionId', divisionId);
    fd.set('inviteeSlug', chosen.slug);
    fd.set('acknowledged', acknowledged ? 'on' : '');
    start(async () => {
      const res = await enterWithPendingPartner(tournamentId, {}, fd);
      if (res.ok) {
        // Deliberately do NOT reset the form here. Resetting swapped the "Proceeding to payment…"
        // card back to the empty search box before navigation finished, so the form looked like it
        // had failed and dumped the player back on the division list (§2K). Instead the button stays
        // pending through the refresh, and My registrations opens the payment modal on the new
        // entry (PayNowCell autoOpen). The refresh unmounts this form once the division reads as
        // registered, so there is nothing to reset.
        if (res.registrationId) {
          router.push(`?entered=${res.registrationId}#my-registrations`, { scroll: false });
        }
        router.refresh();
      } else {
        setMsg(res.error ?? 'Could not enter. Please try again.');
        setIsError(true);
      }
    });
  }

  if (chosen) {
    return (
      <div className="border-border bg-surface space-y-3 rounded-xl border p-3">
        <button
          type="button"
          onClick={() => {
            setChosen(null);
            setAcknowledged(false);
          }}
          className="text-foreground-muted hover:text-foreground inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium"
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
            <p className="text-foreground-muted">
              If they say no, your slot and your payment stay yours and you can name someone else.
            </p>
          </div>
        </div>

        <label className="border-border flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm">
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

        <button
          type="button"
          disabled={pending || !acknowledged}
          onClick={submit}
          className="vp-gradient inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {/* Not "Reserving your slot" - the slot is not secured until payment is verified (§2J).
              This says what is actually happening: we are taking them to the payment step. */}
          {pending ? 'Proceeding to payment…' : 'Enter and pay'}
        </button>

        {msg && (
          <p
            className={`text-sm ${isError ? 'text-danger' : 'text-foreground-muted'}`}
            role="status"
          >
            {msg}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* The exact moment a player is hunting for a partner - so offer the one-tap "I'm looking too"
          call to action right here (§2M). It writes the same flag the directory filter reads. */}
      <LookingForPartnerToggle initial={viewerLookingForPartner} variant="inline" />
      <Input
        value={q}
        onChange={(e) => updateQuery(e.target.value)}
        placeholder="Search players by name"
        aria-label="Search for your partner"
      />
      {searching && <p className="text-foreground-muted text-xs">Searching...</p>}
      {results.length > 0 && (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {results.map((p) => (
            <li key={p.slug} className="flex items-start justify-between gap-2 p-2">
              <span className="min-w-0 flex-1">
                <span className="text-foreground block text-sm">
                  {p.name}
                  {p.city && <span className="text-foreground-muted text-xs"> · {p.city}</span>}
                </span>
                {/* The reason sits with the person it is about. A player told only "unavailable"
                    tries the same name again; a player told why picks someone else (§2D). */}
                {p.blockedReason && (
                  <span className="text-warning mt-0.5 block text-xs">{p.blockedReason}</span>
                )}
              </span>
              {p.blockedReason ? (
                <span className="text-foreground-muted shrink-0 self-center text-xs font-medium">
                  Can&rsquo;t enter
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setChosen(p);
                    setMsg(null);
                    setIsError(false);
                  }}
                  className="vp-gradient min-h-[44px] shrink-0 self-center rounded-lg px-3 text-xs font-semibold text-white"
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
      {msg && (
        <p className={`text-xs ${isError ? 'text-danger' : 'text-foreground-muted'}`} role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
