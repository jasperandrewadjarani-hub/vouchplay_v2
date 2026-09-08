import Link from 'next/link';
import { CalendarClock, Sparkles, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatDateTime } from '@/lib/format-date';
import { LinkSpinner } from '@/components/ui/link-spinner';

/**
 * Three headline tiles above the boards, in the style of a scoreboard: where you stand, how many are
 * ranked, and when the next rankings land.
 *
 * The third tile exists because a daily publish cadence is only motivating if people know when the
 * drop is (§1O). The time is computed by the same pure helper the Admin nightly-rebuild panel uses,
 * so the public promise and the operator view cannot disagree.
 *
 * A signed-out visitor sees an invitation in the first tile rather than a blank, which turns the
 * boards into a way in rather than a dead end.
 *
 * Layout: two columns on a phone with the personal tile spanning both, three across from `sm`.
 * Stacking all three full-width filled the entire first screen and pushed the tabs and the board
 * itself below the fold, which inverted the point of the page.
 */

const CARD = 'border-border bg-surface flex flex-col rounded-2xl border p-3 sm:p-4';
const VALUE = 'text-foreground mt-1.5 text-xl leading-tight font-extrabold sm:mt-2 sm:text-2xl';
const NOTE = 'text-foreground-muted mt-1 text-xs';

function Label({
  icon: Icon,
  children,
  tone,
}: {
  icon: LucideIcon;
  children: string;
  tone: string;
}) {
  return (
    <span className="text-foreground-muted flex items-center gap-1.5">
      <Icon size={14} className={tone} aria-hidden />
      <span className="vp-label">{children}</span>
    </span>
  );
}

export function BoardStats({
  myRank,
  signedIn,
  rankedCount,
  unit,
  nextPublishAt,
  hook,
}: {
  /** The viewer's own position on this board's category, or null when they are not ranked. */
  myRank: number | null;
  signedIn: boolean;
  rankedCount: number;
  unit: string;
  nextPublishAt: string | null;
  hook: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {signedIn ? (
        <div className={`${CARD} col-span-2 sm:col-span-1`}>
          <Label icon={Sparkles} tone="text-primary">
            Your position
          </Label>
          <span className={VALUE}>{myRank ? `#${myRank}` : 'Not ranked yet'}</span>
          <span className={NOTE}>{myRank ? 'Your private position on this board.' : hook}</span>
        </div>
      ) : (
        <Link
          href="/signup"
          className="border-primary/40 bg-primary/5 hover:border-primary vp-card col-span-2 flex flex-col rounded-2xl border p-3 sm:col-span-1 sm:p-4"
        >
          <Label icon={Sparkles} tone="text-primary">
            Your position
          </Label>
          <span className={`${VALUE} flex items-center gap-2`}>
            Join to be ranked
            <LinkSpinner />
          </span>
          <span className={NOTE}>{hook}</span>
        </Link>
      )}
      <div className={CARD}>
        <Label icon={Users} tone="text-accent-cyan">
          Ranked here
        </Label>
        <span className={VALUE}>
          {rankedCount === 0 ? 'Nobody yet' : rankedCount.toLocaleString('en-US')}
        </span>
        <span className={NOTE}>
          {rankedCount === 0 ? 'This board fills after the next update.' : unit}
        </span>
      </div>
      <div className={CARD}>
        <Label icon={CalendarClock} tone="text-accent-lime">
          Next update
        </Label>
        <span className={VALUE}>{nextPublishAt ? formatDateTime(nextPublishAt) : 'Paused'}</span>
        <span className={NOTE}>
          {nextPublishAt ? 'Rankings refresh once a day.' : 'Publishing is on hold.'}
        </span>
      </div>
    </div>
  );
}
