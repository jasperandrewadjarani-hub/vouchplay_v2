'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Loader2, UserPlus } from 'lucide-react';
import {
  replacePendingPartner,
  searchInvitablePlayers,
  type PlayerSearchResult,
} from '@/lib/actions/registration';
import { Input } from '@/components/ui/field';

/**
 * What a player can actually do about their partner right now.
 *
 * This used to be a single "Leave team and change partner" button that called a server rule
 * requiring the team to have NO active registration. Under the pay-first flow (§1U) a team always
 * has one from the moment it is created, so the button could only ever fail, and it failed with a
 * message that told the player nothing they could act on. It is replaced with the three real states:
 *
 *  - the seat is empty because the partner declined  -> name a replacement (slot and payment kept)
 *  - the partner has not answered yet               -> say so, and say declining is theirs to do
 *  - nothing to do                                  -> render nothing
 *
 * Never a dead end, and never a control that cannot succeed.
 */
export function PartnerChangeActions({
  teamId,
  tournamentId,
  divisionId,
  pendingPartnerName,
  seatVacantAfterDecline,
}: {
  teamId: string;
  tournamentId: string;
  divisionId: string;
  pendingPartnerName: string | null;
  seatVacantAfterDecline: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      setResults(await searchInvitablePlayers(q));
      setSearching(false);
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  function choose(slug: string, name: string) {
    setMsg(null);
    setIsError(false);
    const fd = new FormData();
    fd.set('teamId', teamId);
    fd.set('divisionId', divisionId);
    fd.set('inviteeSlug', slug);
    start(async () => {
      const res = await replacePendingPartner(tournamentId, {}, fd);
      if (res.ok) {
        setMsg(`${name} has been asked to confirm. Your slot and payment are unchanged.`);
        setIsError(false);
        setQ('');
        setResults([]);
        setOpen(false);
        router.refresh();
      } else {
        setMsg(res.error ?? 'Could not name that partner.');
        setIsError(true);
      }
    });
  }

  if (seatVacantAfterDecline) {
    return (
      <div className="border-warning/40 bg-warning/10 mt-2 space-y-2 rounded-xl border p-3">
        <p className="text-foreground text-sm font-semibold">Your partner cannot play.</p>
        <p className="text-foreground-muted text-sm">
          Your slot and your payment are still yours. Name someone else and they will be asked to
          confirm.
        </p>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="vp-gradient inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white"
          >
            <UserPlus size={16} aria-hidden />
            Name a new partner
          </button>
        ) : (
          <div className="space-y-2">
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
                  <li key={p.slug} className="flex items-center justify-between gap-2 p-2">
                    <span className="text-foreground text-sm">
                      {p.name}
                      {p.city && <span className="text-foreground-muted text-xs"> · {p.city}</span>}
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => choose(p.slug, p.name)}
                      className="vp-gradient min-h-[44px] shrink-0 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {pending ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                      ) : (
                        'Choose'
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {q.trim().length >= 2 && !searching && results.length === 0 && (
              <p className="text-foreground-muted text-xs">
                No players found. Your partner needs a VouchPlay account.
              </p>
            )}
          </div>
        )}
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

  if (pendingPartnerName) {
    return (
      <p className="text-foreground-muted mt-2 flex items-start gap-2 text-sm">
        <Clock size={15} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Waiting for <span className="text-foreground font-semibold">{pendingPartnerName}</span> to
          confirm. They can accept or decline from their own notifications. If they decline, you
          keep your slot and payment and can name someone else.
        </span>
      </p>
    );
  }

  return null;
}
