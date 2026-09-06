'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  invitePartner,
  searchInvitablePlayers,
  type PlayerSearchResult,
} from '@/lib/actions/registration';
import { Input } from '@/components/ui/field';

/**
 * Invite a partner to a doubles division (handover §20.1-§20.2). Type to search active players by
 * name; pick one to send the invite. Debounced query; no need to know their exact handle.
 */
export function PartnerInviteForm({
  tournamentId,
  divisionId,
}: {
  tournamentId: string;
  divisionId: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
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
      const res = await searchInvitablePlayers(q);
      setResults(res);
      setSearching(false);
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  function invite(slug: string, name: string) {
    setMsg(null);
    const fd = new FormData();
    fd.set('divisionId', divisionId);
    fd.set('inviteeSlug', slug);
    start(async () => {
      const res = await invitePartner(tournamentId, {}, fd);
      if (res.ok) {
        setMsg(`Invite sent to ${name}.`);
        setQ('');
        setResults([]);
        router.refresh();
      } else {
        setMsg(res.error ?? 'Could not send the invite.');
      }
    });
  }

  return (
    <div className="space-y-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search players by name"
        aria-label="Search players to invite"
      />
      {searching && <p className="text-foreground-muted text-xs">Searching...</p>}
      {results.length > 0 && (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {results.map((p) => (
            <li key={p.slug} className="flex items-center justify-between gap-2 p-2">
              <span className="text-foreground text-sm">
                {p.name}
                {p.city && <span className="text-foreground-muted text-xs"> · {p.city}</span>}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => invite(p.slug, p.name)}
                className="vp-gradient shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
              >
                Invite
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !searching && results.length === 0 && (
        <p className="text-foreground-muted text-xs">No players found.</p>
      )}
      {msg && <p className="text-foreground-muted text-xs">{msg}</p>}
    </div>
  );
}
