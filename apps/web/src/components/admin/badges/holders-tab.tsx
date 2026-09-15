import Link from 'next/link';
import { BADGES, badgeDef } from '@vouchplay/config';
import { BadgeSymbol } from '@/components/badges/badge-symbol';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { nameInitials } from '@/lib/storage';
import { formatDate } from '@/lib/format-date';
import { LinkSpinner } from '@/components/ui/link-spinner';
import { UntagControl } from './untag-control';
import type { BadgeHolder } from '@/lib/badges/types';

/**
 * Admin → Badges "Holders" tab (master_plan §2BK B): a horizontal-scroll badge picker with live
 * holder counts, then the earned-vs-tagged list for whichever badge is selected via `?badge=`.
 */
export function HoldersTab({
  counts,
  selectedKey,
  holders,
}: {
  counts: Record<string, number>;
  selectedKey: string | null;
  holders: BadgeHolder[] | null;
}) {
  const selectedDef = selectedKey ? badgeDef(selectedKey) : null;

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {BADGES.map((b) => {
          const current = selectedKey === b.key;
          return (
            <Link
              key={b.key}
              href={`/admin/badges?tab=holders&badge=${b.key}`}
              aria-current={current ? 'page' : undefined}
              className={`flex min-h-[44px] shrink-0 flex-col items-center gap-1 rounded-xl border px-3 py-2 text-center text-[11px] font-semibold transition-colors ${
                current
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-surface hover:border-primary'
              }`}
            >
              <BadgeSymbol badgeKey={b.key} size={28} />
              <span className="text-foreground leading-tight whitespace-nowrap">{b.name}</span>
              <span className="text-foreground-muted font-normal">{counts[b.key] ?? 0}</span>
              <LinkSpinner size={12} />
            </Link>
          );
        })}
      </div>

      {!selectedKey && (
        <p className="text-foreground-muted text-sm">Pick a badge to see its holders.</p>
      )}

      {selectedKey &&
        holders &&
        (holders.length === 0 ? (
          <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-6 text-center text-sm">
            No one holds this badge yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {holders.map((h) => (
              <li key={h.playerBadgeId} className="border-border bg-surface rounded-xl border p-3">
                <div className="flex items-start gap-3">
                  <PlayerAvatar
                    url={h.avatarUrl}
                    initials={nameInitials(h.playerName)}
                    name={h.playerName}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={h.playerSlug ? `/players/${h.playerSlug}` : '#'}
                      className="text-foreground text-sm font-semibold hover:underline"
                    >
                      {h.playerName}
                    </Link>
                    <p className="text-foreground-muted text-xs">
                      {h.source === 'auto' ? 'Earned' : 'Tagged'} · {formatDate(h.awardedAt)}
                      {h.expiresAt ? ` · expires ${formatDate(h.expiresAt)}` : ''}
                    </p>
                    {holderCaption(h) && (
                      <p className="text-foreground-muted text-xs">{holderCaption(h)}</p>
                    )}
                  </div>
                </div>
                <div className="mt-2">
                  <UntagControl
                    playerBadgeId={h.playerBadgeId}
                    badgeName={selectedDef?.name ?? 'badge'}
                  />
                </div>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

function holderCaption(h: BadgeHolder): string | null {
  // master_plan §2BL B: Pioneer's number is never shown anywhere.
  const parts: string[] = [];
  if (h.tally > 1) parts.push(`×${h.tally}`);
  if (h.meta.event) parts.push(h.meta.event);
  if (h.meta.division) parts.push(h.meta.division);
  if (h.meta.medal) parts.push(h.meta.medal);
  return parts.length ? parts.join(' · ') : null;
}
