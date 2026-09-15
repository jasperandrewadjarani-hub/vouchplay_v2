'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { BADGES, BADGE_FAMILIES, isRoleBadgeKey } from '@vouchplay/config';
import { BadgeSymbol } from '@/components/badges/badge-symbol';
import { BottomSheet } from '@/components/tournaments/manage-sheets';

const MAX_BADGES = 10;

/**
 * "Badges to tag" picker sheet (master_plan §2BL E): the full catalog grouped by family, 4 columns,
 * multi-select up to the batch action's own cap (10). Selection is local until "Done" commits it back
 * to the tray - Cancel (the sheet's own ✕/backdrop/Back) discards changes, matching every other
 * BottomSheet in the app.
 */
export function BadgeGridSheet({
  selectedKeys,
  onDone,
  onClose,
}: {
  selectedKeys: string[];
  onDone: (keys: string[]) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<string[]>(selectedKeys);
  const atCap = local.length >= MAX_BADGES;

  function toggle(key: string) {
    setLocal((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= MAX_BADGES) return prev;
      return [...prev, key];
    });
  }

  return (
    <BottomSheet
      title="Badges to tag"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={() => {
            onDone(local);
            onClose();
          }}
          className="vp-gradient min-h-[44px] w-full rounded-xl text-sm font-semibold text-white transition-all"
        >
          Done{local.length > 0 ? ` (${local.length})` : ''}
        </button>
      }
    >
      <div className="space-y-4 pb-2">
        {atCap && (
          <p className="text-foreground-muted text-xs">Up to {MAX_BADGES} badges per batch.</p>
        )}
        {Object.entries(BADGE_FAMILIES).map(([famKey, fam]) => {
          // Coach / Organizer badges follow the role (§2BR) - not taggable here.
          const famBadges = BADGES.filter((b) => b.family === famKey && !isRoleBadgeKey(b.key));
          if (famBadges.length === 0) {
            return famKey === 'roles' ? (
              <p key={famKey} className="text-foreground-muted text-xs">
                Coach and Organizer badges come with the role - grant or remove the role in Admin →
                Users.
              </p>
            ) : null;
          }
          return (
            <div key={famKey}>
              <h3 className="text-foreground-muted mb-2 text-xs font-semibold tracking-wide uppercase">
                {fam.name}
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {famBadges.map((b) => {
                  const selected = local.includes(b.key);
                  const disabled = !selected && atCap;
                  return (
                    <button
                      key={b.key}
                      type="button"
                      aria-pressed={selected}
                      disabled={disabled}
                      onClick={() => toggle(b.key)}
                      className={`relative flex min-h-[92px] flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors disabled:opacity-40 ${
                        selected
                          ? 'border-amber-400 bg-amber-400/10 dark:bg-amber-400/15'
                          : 'border-border bg-background'
                      }`}
                    >
                      {selected && (
                        <span
                          aria-hidden
                          className="absolute top-1 right-1 inline-flex size-4 items-center justify-center rounded-full bg-amber-400 text-amber-950"
                        >
                          <Check size={10} strokeWidth={3} />
                        </span>
                      )}
                      <BadgeSymbol badgeKey={b.key} size={40} />
                      <span className="text-foreground text-[11px] leading-tight font-semibold">
                        {b.name}
                      </span>
                      <span className="text-foreground-muted text-[10px] leading-tight">
                        {b.normally === 'auto' ? 'Usually automatic' : 'Admin badge'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}
