'use client';

import { useState } from 'react';
import { Users } from 'lucide-react';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { nameInitials } from '@/lib/storage';
import { Modal } from '@/components/ui/modal';
import type { TournamentDemandDTO } from '@/lib/tournaments/dto';
import { demandLabel, type DemandOption } from '@/lib/tournaments/demand-options';

export function TournamentDemandSummary({
  demand,
  options,
  divisionCounts,
}: {
  demand: TournamentDemandDTO;
  /** Same option list the interest picker uses, so the breakdown can never drift from it. */
  options: DemandOption[];
  /**
   * Counts with old planning-taxonomy interest already folded into the matching division, so the
   * breakdown shows one row per division instead of an old and a new row for the same thing.
   */
  divisionCounts: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const peak = Math.max(1, ...Object.values(divisionCounts));
  // Show every option, plus any stored key whose division has since been removed, so no recorded
  // interest silently disappears from the breakdown.
  const extraKeys = Object.keys(divisionCounts).filter(
    (k) => k !== 'legacy_unspecified' && !options.some((o) => o.key === k),
  );
  const rows = [
    ...options,
    ...extraKeys.map((key) => ({ key, label: demandLabel(key, options), color: null })),
  ];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border bg-surface-muted hover:bg-surface flex w-full items-center gap-3 rounded-xl border p-3 text-left"
      >
        <div className="flex -space-x-2" aria-hidden>
          {demand.avatars.map((avatar) => (
            <PlayerAvatar
              key={avatar.id}
              url={avatar.avatarUrl}
              initials={nameInitials(avatar.name)}
              name=""
              size="sm"
              className="border-surface h-8 w-8 border-2 text-[10px]"
            />
          ))}
          {demand.avatars.length === 0 && (
            <span className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-full">
              <Users size={15} />
            </span>
          )}
        </div>
        <span className="min-w-0 flex-1">
          <span className="text-foreground block text-sm font-semibold">
            {demand.total} interested
          </span>
          <span className="text-foreground-muted block text-xs">View interest by division</span>
        </span>
      </button>
      {open && (
        <Modal title="Tournament interest" onClose={() => setOpen(false)}>
          <div className="space-y-2">
            {rows.map((division) => (
              <div key={division.key} className="border-border rounded-lg border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-foreground">{division.label}</span>
                  <span className="text-foreground font-semibold tabular-nums">
                    {divisionCounts[division.key] ?? 0}
                  </span>
                </div>
                <div className="bg-surface-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round(((divisionCounts[division.key] ?? 0) / peak) * 100)}%`,
                      backgroundColor: division.color ?? 'var(--primary)',
                    }}
                  />
                </div>
              </div>
            ))}
            {(divisionCounts.legacy_unspecified ?? 0) > 0 && (
              <p className="text-foreground-muted pt-1 text-xs">
                {divisionCounts.legacy_unspecified} earlier interest record
                {divisionCounts.legacy_unspecified === 1 ? '' : 's'} had no division selection.
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
