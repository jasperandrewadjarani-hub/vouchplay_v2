'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setClubRepresentations } from '@/lib/actions/registration';

interface Club {
  clubId: string;
  name: string;
}

/**
 * Club representation multi-select (handover §22.6). Selection is capped server-side at the
 * tournament's max_clubs_per_player; only clubs the player actively belongs to are eligible.
 */
export function ClubRepSelector({
  tournamentId,
  eligibleClubs,
  selected,
  max,
}: {
  tournamentId: string;
  eligibleClubs: Club[];
  selected: string[];
  max: number;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(selected);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (eligibleClubs.length === 0) {
    return (
      <p className="text-foreground-muted text-sm">
        Join a club to represent it here. Only clubs you actively belong to can be selected.
      </p>
    );
  }

  function toggle(id: string) {
    setChosen((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= max) return prev;
      return [...prev, id];
    });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const res = await setClubRepresentations(tournamentId, chosen);
      setMsg(res.error ?? res.message ?? null);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-foreground-muted text-xs">
        {chosen.length} of {max} selected · order follows the order you pick.
      </p>
      <ul className="space-y-1.5">
        {eligibleClubs.map((c) => {
          const idx = chosen.indexOf(c.clubId);
          const on = idx >= 0;
          return (
            <li key={c.clubId}>
              <label className="border-border flex items-center gap-2 rounded-lg border p-2 text-sm">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(c.clubId)}
                  disabled={!on && chosen.length >= max}
                />
                <span className="text-foreground">{c.name}</span>
                {on && (
                  <span className="text-primary ml-auto text-xs font-semibold">#{idx + 1}</span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="border-border text-foreground hover:bg-surface-muted rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save clubs'}
      </button>
      {msg && <p className="text-foreground-muted text-xs">{msg}</p>}
    </div>
  );
}
