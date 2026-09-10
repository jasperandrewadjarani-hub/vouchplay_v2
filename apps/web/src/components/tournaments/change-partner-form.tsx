'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  changePartner,
  searchInvitablePlayers,
  type PlayerSearchResult,
} from '@/lib/actions/registration';
import { Input } from '@/components/ui/field';

/**
 * Change partner on an entry that is already paid (master_plan §2A, migration 0027).
 *
 * The server refuses a replacement who does not fit the division - same sex classification, inside
 * the same skill band - so a swap can never route around a division's own rules. That refusal comes
 * back as a sentence a player can act on, not a code.
 *
 * The person being removed is always notified. §1D forbids displacing somebody without their
 * knowledge; telling them is what makes this permissible rather than a loophole in that rule.
 */
/**
 * Controlled panel (no trigger of its own): the parent renders the "Change partner" button and mounts
 * this when it is open, so it can sit as one of a matched pair of equal-width actions with its panel
 * full-width below (§2L). `onClose` backs the "Never mind" control and the post-success close.
 */
export function ChangePartnerForm({
  teamId,
  tournamentId,
  divisionId,
  currentPartnerName,
  onClose,
}: {
  teamId: string;
  tournamentId: string;
  divisionId: string;
  currentPartnerName: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setSearching(false);
      setResults([]);
      return;
    }
    // Set before the debounce is armed, so "nobody found" can only follow a completed search (§1Y).
    setSearching(true);
    setResults([]);
    timer.current = setTimeout(async () => {
      setResults(await searchInvitablePlayers(q, divisionId));
      setSearching(false);
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, divisionId]);

  function choose(slug: string, name: string) {
    setMsg(null);
    setIsError(false);
    const fd = new FormData();
    fd.set('teamId', teamId);
    fd.set('divisionId', divisionId);
    fd.set('inviteeSlug', slug);
    start(async () => {
      const res = await changePartner(tournamentId, {}, fd);
      if (res.ok) {
        setMsg(`${name} has been asked to confirm. Your slot and payment are unchanged.`);
        setIsError(false);
        setQ('');
        setResults([]);
        router.refresh();
        onClose();
      } else {
        setMsg(res.error ?? 'Could not change partner.');
        setIsError(true);
      }
    });
  }

  return (
    <div className="border-border mt-2 space-y-2 rounded-xl border p-3">
      <p className="text-foreground text-sm font-semibold">
        {currentPartnerName ? `Replace ${currentPartnerName}` : 'Choose a new partner'}
      </p>
      <p className="text-foreground-muted text-sm">
        The new player must fit this division: the same skill level and the same gender it is for.
        {currentPartnerName
          ? ` ${currentPartnerName} will be told they are no longer on your team.`
          : ''}
      </p>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search players by name"
        aria-label="Search for a new partner"
      />
      {searching && <p className="text-foreground-muted text-xs">Searching...</p>}
      {results.length > 0 && (
        <ul className="border-border divide-border bg-surface divide-y rounded-lg border">
          {results.map((p) => (
            <li key={p.slug} className="flex items-start justify-between gap-2 p-2">
              <span className="min-w-0 flex-1">
                <span className="text-foreground block text-sm">
                  {p.name}
                  {p.city && <span className="text-foreground-muted text-xs"> · {p.city}</span>}
                </span>
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
                  disabled={pending}
                  onClick={() => choose(p.slug, p.name)}
                  className="vp-gradient min-h-[44px] shrink-0 self-center rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : 'Choose'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !searching && results.length === 0 && (
        <p className="text-foreground-muted text-xs">
          No players found. Your partner needs a VouchPlay account.
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          onClose();
        }}
        className="text-foreground-muted hover:text-foreground min-h-[44px] text-sm font-medium"
      >
        Never mind
      </button>
      {msg && (
        <p className={`text-sm ${isError ? 'text-danger' : 'text-foreground-muted'}`} role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
