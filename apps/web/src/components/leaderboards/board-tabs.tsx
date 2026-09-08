import Link from 'next/link';
import { Trophy, HeartHandshake, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { LeaderboardCategory } from '@vouchplay/core';
import { BOARDS, boardHref } from '@/lib/leaderboards/board-meta';
import { LinkSpinner } from '@/components/ui/link-spinner';

/**
 * Board selection, as three links styled as tabs.
 *
 * Links rather than a JavaScript tablist, deliberately: each board keeps its own URL so it is
 * shareable and bookmarkable, the page works before hydration, the Back button behaves, and Next's
 * prefetch plus `useLinkStatus` supply the pending feedback used elsewhere in the app (§1N).
 *
 * 44px minimum height is written as a pixel value because the app sets a 14px root font, which makes
 * every rem-based Tailwind size 0.875x (§1I).
 */

const ICONS: Record<LeaderboardCategory, LucideIcon> = {
  players: Trophy,
  community: HeartHandshake,
  clubs: Shield,
};

export function BoardTabs({ active }: { active: LeaderboardCategory }) {
  return (
    <nav aria-label="Leaderboard categories">
      <ul className="border-border bg-surface grid grid-cols-3 gap-1 rounded-2xl border p-1">
        {BOARDS.map((board) => {
          const Icon = ICONS[board.category];
          const current = board.category === active;
          return (
            <li key={board.category}>
              <Link
                href={boardHref(board.category)}
                aria-current={current ? 'page' : undefined}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-center text-xs font-semibold transition-colors sm:flex-row sm:gap-2 sm:text-sm ${
                  current
                    ? 'vp-gradient vp-glow text-white'
                    : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground'
                }`}
              >
                <Icon size={16} aria-hidden />
                <span className="leading-tight">{board.tabLabel}</span>
                <LinkSpinner />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
