'use client';

import { useState } from 'react';
import { ChevronDown, Coins, ShieldCheck, Users } from 'lucide-react';
import type { DivisionDTO } from '@/lib/tournaments/dto';

function moneyPerPlayer(division: DivisionDTO): string {
  if (division.feeAmount <= 0) return 'Free';
  const amount = division.feeAmount / Math.max(1, division.teamSize);
  return `${division.currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} / player`;
}

/** Public division facts and capacity, progressively disclosed to keep a long tournament readable. */
export function DivisionList({ divisions }: { divisions: DivisionDTO[] }) {
  const visible = divisions.filter((d) => d.status !== 'draft' && d.status !== 'cancelled');
  const [open, setOpen] = useState<string | null>(null);
  if (visible.length === 0)
    return <p className="text-foreground-muted text-sm">No divisions published yet.</p>;
  return (
    <ul className="space-y-2">
      {visible.map((d) => {
        const capacity = Math.max(0, d.capacityTeams);
        const percent =
          capacity > 0 ? Math.min(100, Math.round((d.registeredTeams / capacity) * 100)) : 0;
        const expanded = open === d.id;
        return (
          <li key={d.id} className="border-border rounded-xl border">
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : d.id)}
              className="flex w-full items-center justify-between gap-2 p-3 text-left"
            >
              <span>
                <span className="text-foreground block text-sm font-semibold">{d.name}</span>
                <span className="text-foreground-muted block text-xs capitalize">
                  {d.format} · {moneyPerPlayer(d)}
                </span>
              </span>
              <ChevronDown
                size={18}
                aria-hidden
                className={`text-foreground-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
            </button>
            {expanded && (
              <div className="border-border space-y-2 border-t px-3 pb-3">
                <div className="text-foreground-muted flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs">
                  {capacity > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users size={12} aria-hidden />
                      {d.registeredTeams} / {capacity} teams
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Coins size={12} aria-hidden />
                    {moneyPerPlayer(d)}
                  </span>
                  {d.skillVerifiedRequired && (
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck size={12} aria-hidden />
                      Skill-verified only
                    </span>
                  )}
                  {d.minimumSts != null && <span>Min STS {d.minimumSts.toFixed(1)}</span>}
                </div>
                {capacity > 0 && (
                  <div
                    aria-label={`${d.registeredTeams} of ${capacity} teams registered`}
                    className="bg-surface-muted h-2 overflow-hidden rounded-full"
                  >
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
