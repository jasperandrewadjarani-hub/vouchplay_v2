'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { overrideClubRepresentations } from '@/lib/actions/registration';
import type { ClubOverrideParticipant } from '@/lib/tournaments/registration-queries';

/**
 * Organizer/Admin post-lock club representation override (handover Phase 13.5). Players edit their own
 * clubs until the tournament-wide lock; after it, only an organizer/Admin may correct a player's
 * clubs, with a required reason and an immutable audit record. It never changes team, division, fee,
 * payment, or eligibility.
 */
export function ClubOverrideControl({
  tournamentId,
  participants,
  maxClubs,
}: {
  tournamentId: string;
  participants: ClubOverrideParticipant[];
  maxClubs: number;
}) {
  const router = useRouter();
  const [playerId, setPlayerId] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selected = useMemo(
    () => participants.find((p) => p.playerId === playerId) ?? null,
    [participants, playerId],
  );

  function pick(id: string) {
    setPlayerId(id);
    const p = participants.find((x) => x.playerId === id);
    setChosen(p ? p.currentClubIds : []);
    setMsg(null);
  }

  function toggle(clubId: string) {
    setChosen((prev) => {
      if (prev.includes(clubId)) return prev.filter((x) => x !== clubId);
      if (prev.length >= maxClubs) return prev;
      return [...prev, clubId];
    });
  }

  function submit() {
    if (!selected) return;
    setMsg(null);
    start(async () => {
      const res = await overrideClubRepresentations(
        tournamentId,
        selected.playerId,
        chosen,
        reason,
      );
      setMsg(res.error ?? res.message ?? null);
      if (res.ok) {
        setReason('');
        router.refresh();
      }
    });
  }

  if (participants.length === 0) {
    return (
      <p className="text-foreground-muted text-sm">
        No registered players yet. Overrides appear once players register.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-foreground-muted text-xs">
        Use this only to correct a player&apos;s clubs after the lock. The change is recorded with
        your reason and does not affect their team, division, fee, or payment.
      </p>
      <label className="text-foreground-muted flex flex-col gap-1 text-xs">
        Player
        <select
          value={playerId}
          onChange={(e) => pick(e.target.value)}
          className="border-border bg-surface text-foreground rounded-lg border px-2.5 py-1.5 text-sm"
        >
          <option value="">Choose a player</option>
          {participants.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {selected && (
        <>
          {selected.selectableClubs.length === 0 ? (
            <p className="text-foreground-muted text-xs">
              This player has no clubs to assign. They must be an active club member first.
            </p>
          ) : (
            <fieldset className="space-y-1.5">
              <legend className="text-foreground-muted text-xs">
                Clubs ({chosen.length} of {maxClubs})
              </legend>
              {selected.selectableClubs.map((c) => {
                const on = chosen.includes(c.clubId);
                return (
                  <label
                    key={c.clubId}
                    className="border-border flex items-center gap-2 rounded-lg border p-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(c.clubId)}
                      disabled={!on && chosen.length >= maxClubs}
                    />
                    <span className="text-foreground">{c.name}</span>
                  </label>
                );
              })}
            </fieldset>
          )}
          <label className="text-foreground-muted flex flex-col gap-1 text-xs">
            Reason (required)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder="e.g. Player asked to fix club after the lock"
              className="border-border bg-surface text-foreground rounded-lg border px-2.5 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={pending || reason.trim().length < 4}
            onClick={submit}
            className="border-border text-foreground hover:bg-surface-muted rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save override'}
          </button>
        </>
      )}
      {msg && <p className="text-foreground-muted text-xs">{msg}</p>}
    </div>
  );
}
