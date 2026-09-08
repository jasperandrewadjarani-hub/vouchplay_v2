'use client';

import { useState } from 'react';
import { Users } from 'lucide-react';
import { TOURNAMENT_DEMAND_DIVISIONS } from '@vouchplay/core';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { nameInitials } from '@/lib/storage';
import { Modal } from '@/components/ui/modal';
import type { TournamentDemandDTO } from '@/lib/tournaments/dto';

export function TournamentDemandSummary({ demand }: { demand: TournamentDemandDTO }) {
  const [open, setOpen] = useState(false);
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
          <span className="text-foreground-muted block text-xs">
            View planning demand by division
          </span>
        </span>
      </button>
      {open && (
        <Modal
          title="Tournament interest"
          subtitle="Planning demand only. These counts are not registrations or reserved slots."
          onClose={() => setOpen(false)}
        >
          <div className="space-y-2">
            {TOURNAMENT_DEMAND_DIVISIONS.map((division) => (
              <div
                key={division.key}
                className="border-border flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <span className="text-foreground">{division.label}</span>
                <span className="text-foreground font-semibold tabular-nums">
                  {demand.divisions[division.key] ?? 0}
                </span>
              </div>
            ))}
            {(demand.divisions.legacy_unspecified ?? 0) > 0 && (
              <p className="text-foreground-muted pt-1 text-xs">
                {demand.divisions.legacy_unspecified} earlier interest record
                {demand.divisions.legacy_unspecified === 1 ? '' : 's'} had no division selection.
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
