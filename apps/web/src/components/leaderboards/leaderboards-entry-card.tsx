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
 * rather than a sixth one. This is a single tap target across the whole card: a small text link is
 * the wrong affordance for a section-level jump, and a card gives a thumb something to hit.
 *
 * It names the current leader instead of describing the concept. "Community leaderboards" is an
 * abstraction; a real person with a crown is a reason to tap.
 *
 * Following §1H, the call to action is a styled span rather than a button - the card is already a
 * link, and an interactive control inside a link means one tap does two things.
 */
export function LeaderboardsEntryCard({ board }: { board: LeaderboardDTO | null }) {
  const leaders = board?.entries.slice(0, 3) ?? [];
  const leader = leaders[0];
  return (
    <Link
      href="/leaderboards"
      className="vp-card vp-hero border-border bg-surface block rounded-2xl border p-4 sm:p-5"
      aria-label="View the community leaderboards"
    >
      {/* The leader strip takes its own full-width row below `sm`. Sharing one row at 375px squeezed
          the text into a six-line column and pushed the player search below the fold - the same
          failure mode as the truncated names in §1H. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="vp-gradient vp-glow flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white">
          <Trophy size={22} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="vp-label text-primary">Community leaderboards</p>
          <p className="text-foreground mt-1 text-lg leading-tight font-extrabold">
            {leader ? 'See who is on top' : 'Be the first on the board'}
          </p>
        </div>
        {leaders.length > 0 && (
          <div className="order-3 flex w-full items-center gap-3 sm:order-none sm:w-auto">
            <span className="flex -space-x-3" aria-hidden>
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
            <span className="min-w-0">
              <span className="text-foreground-muted flex items-center gap-1 text-xs">
                <Crown size={12} className="text-amber-500" aria-hidden />
                Leading now
              </span>
              <span className="text-foreground block max-w-[10rem] truncate text-sm font-bold">
                {leader?.displayName}
              </span>
            </span>
          </div>
        )}
      </div>
      <p className="text-foreground-muted mt-3 text-sm">
        {leader
          ? 'Top players, top contributors and top clubs. Updated every day.'
          : 'Rankings publish every day. Vouch for players you know and you could lead the first board.'}
      </p>
      <span className="text-primary mt-1 flex min-h-[44px] items-center gap-1 text-sm font-semibold">
        View leaderboards
        <ChevronRight size={16} aria-hidden />
        <LinkSpinner />
      </span>
    </Link>
  );
}
