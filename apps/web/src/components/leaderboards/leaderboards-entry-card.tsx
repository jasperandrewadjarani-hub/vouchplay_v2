import Link from 'next/link';
import { ChevronRight, Crown, Trophy } from 'lucide-react';
import type { LeaderboardDTO } from '@/lib/leaderboards/types';
import { avatarUrl, nameInitials } from '@/lib/storage';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { LinkSpinner } from '@/components/ui/link-spinner';

/**
 * The way in to the leaderboards from the Players tab.
 *
 * Primary navigation is locked to five tabs (§5.1), so the boards need an entry point inside a tab
 * rather than a sixth one. The whole card is one tap target: a small text link is the wrong
 * affordance for a section-level jump, and a card gives a thumb something to hit.
 *
 * Deliberately small. The Players tab exists to browse players, so this is a doorway, not a display:
 * it keeps only what earns the tap (the leader's name, the top-three faces, an explicit "View
 * leaderboards") and drops the paragraph that just repeated the tab labels on the next screen.
 *
 * Following §1H the call to action is a styled span, not a button, because the card is already a
 * link and an interactive control inside a link means one tap does two things.
 */
export function LeaderboardsEntryCard({ board }: { board: LeaderboardDTO | null }) {
  const leaders = board?.entries.slice(0, 3) ?? [];
  const leader = leaders[0];
  return (
    <Link
      href="/leaderboards"
      className="vp-card border-border bg-surface flex items-center gap-3 rounded-2xl border p-3"
      aria-label="View the community leaderboards"
    >
      <span className="vp-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white">
        <Trophy size={18} aria-hidden />
      </span>
      {/* Two lines, not three: a doorway to the boards should not stack a category label, a headline
          and a leader line before the player list even begins (§2N). */}
      <span className="min-w-0 flex-1">
        <span className="text-foreground block truncate text-sm leading-tight font-bold">
          Community leaderboards
        </span>
        <span className="text-foreground-muted mt-0.5 flex items-center gap-1 truncate text-xs">
          {leader ? (
            <>
              <Crown size={12} className="shrink-0 text-amber-500" aria-hidden />
              <span className="truncate">
                <span className="text-foreground font-semibold">{leader.displayName}</span> is
                leading
              </span>
            </>
          ) : (
            'Be the first on the board'
          )}
        </span>
      </span>
      {leaders.length > 0 && (
        <span className="hidden -space-x-3 sm:flex" aria-hidden>
          {leaders.map((entry) => (
            <PlayerAvatar
              key={entry.subjectId}
              url={avatarUrl(entry.imagePath)}
              initials={nameInitials(entry.displayName)}
              name={entry.displayName}
              size="sm"
              className="ring-surface ring-2"
            />
          ))}
        </span>
      )}
      <span className="text-primary flex shrink-0 items-center gap-0.5 text-sm font-semibold">
        <span className="hidden sm:inline">View</span>
        <ChevronRight size={16} aria-hidden />
        <LinkSpinner />
      </span>
    </Link>
  );
}
