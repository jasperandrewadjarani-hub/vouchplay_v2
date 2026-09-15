'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import {
  searchAssignablePlayers,
  assignPartner,
  type PlayerSearchResult,
} from '@/lib/actions/registration';

/**
 * Organizer "Assign partner" (master_plan §2AQ Decision A3) - fills an open seat immediately, no
 * invitation round-trip. Search is the same fit-checked player search doubles invites already use
 * (`searchInvitablePlayers`), so a player who cannot fit the division is shown greyed with the reason
 * instead of offered and refused on submit. A reason is required - `organizer_assign_partner` writes
 * it to the audit log.
 */
export function AssignPartnerForm({
  teamId,
  tournamentId,
  divisionId,
  onClose,
}: {
  teamId: string;
  tournamentId: string;
  divisionId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<PlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<PlayerSearchResult | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (chosen || query.trim().length < 2) {
      setMatches([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      // master_plan §2AW: this form only ever renders on the organizer's Manage screen (see
      // organizer-registrations.tsx), so a fit-mismatch reason may name the candidate's real rating.
      // §2BS: organizer override search - rule misses come back as warnings, solo entries as merges.
      setMatches(await searchAssignablePlayers(query, divisionId, teamId));
      setSearching(false);
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, chosen, divisionId, teamId]);

  const canSubmit = !!chosen && !chosen.blockedReason && reason.trim().length >= 3 && !pending;

  async function submit() {
    if (!chosen) return;
    setPending(true);
    setMsg(null);
    const res = await assignPartner(teamId, tournamentId, chosen.slug, reason.trim());
    setPending(false);
    if (res.error) {
      setMsg(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="border-border mt-2 space-y-2 rounded-lg border border-dashed p-2.5">
      <p className="text-foreground text-xs font-semibold">Assign a partner</p>

      {chosen ? (
        <span className="border-border bg-surface-muted inline-flex min-h-9 items-center gap-2 rounded-full border py-1 pr-2 pl-2.5 text-xs">
          {chosen.name}
          <button
            type="button"
            onClick={() => setChosen(null)}
            aria-label="Clear selected player"
            className="text-foreground-muted hover:text-foreground"
          >
            <X size={12} aria-hidden />
          </button>
        </span>
      ) : (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a player by name"
          aria-label="Search a player to assign"
          className="border-border bg-background min-h-11 w-full rounded-lg border px-2.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      )}

      {!chosen && searching && <p className="text-foreground-muted text-xs">Searching…</p>}
      {!chosen && matches.length > 0 && (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {matches.map((m) => (
            <li key={m.slug}>
              <button
                type="button"
                disabled={!!m.blockedReason}
                onClick={() => {
                  setChosen(m);
                  setMatches([]);
                }}
                className="hover:bg-surface-muted flex min-h-11 w-full flex-col items-start justify-center px-2.5 py-1.5 text-left disabled:opacity-50"
              >
                <span className="text-foreground text-xs font-medium">{m.name}</span>
                {m.blockedReason ? (
                  <span className="text-danger text-[11px]">{m.blockedReason}</span>
                ) : (
                  <>
                    {m.mergeNote && (
                      <span className="text-primary text-[11px] font-medium">{m.mergeNote}</span>
                    )}
                    {m.warning && (
                      <span className="text-warning text-[11px]">
                        Organizer override: {m.warning}
                      </span>
                    )}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {chosen && (chosen.mergeNote || chosen.warning) && (
        <div className="space-y-0.5 text-[11px]">
          {chosen.mergeNote && <p className="text-primary font-medium">{chosen.mergeNote}</p>}
          {chosen.warning && (
            <p className="text-warning">
              {chosen.warning} You can still assign them - division rules only limit players.
            </p>
          )}
        </div>
      )}

      {chosen && (
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you assigning this player? (required)"
          className="border-border bg-background min-h-11 w-full rounded-lg border px-2.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="vp-gradient min-h-10 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          {pending ? 'Assigning…' : 'Assign'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-foreground-muted hover:text-foreground min-h-10 text-xs font-medium"
        >
          Cancel
        </button>
      </div>

      {msg && <p className="text-danger text-xs">{msg}</p>}
    </div>
  );
}
