import Link from 'next/link';
import { ChevronDown, Sparkles, Users } from 'lucide-react';
import { LinkSpinner } from '@/components/ui/link-spinner';

/**
 * Where you stand and how many are ranked, in one thin row that is closed by default.
 *
 * Three separate tiles used to sit above the tabs, and two of them showed the same number: the
 * momentum card and the position tile both read `#26`. Together they filled the first screen and
 * pushed the tab strip, which is the only decision most people come here to make, below the fold.
 *
 * The closed summary still states both numbers, so nobody has to open anything to learn where they
 * stand. Opening adds the points, the private-snapshot caveat and the next action. That is
 * progressive disclosure, not hiding.
 */

const CTA: Record<string, { href: string; label: string }> = {
  register_tournament: { href: '/tournaments', label: 'Register for a tournament' },
  complete_profile: { href: '/me/edit', label: 'Complete your profile' },
  request_vouch: { href: '/players', label: 'Request a vouch from someone you know' },
  vouch_known_player: { href: '/players', label: 'Vouch for a player you genuinely know' },
  join_club: { href: '/clubs', label: 'Join a club' },
};

export interface BoardStatsProps {
  /** The viewer's own position on this board's category, or null when they are not ranked. */
  myRank: number | null;
  myScore: number | null;
  /** False when the viewer is ranked privately but excluded from the public snapshot. */
  eligiblePublic: boolean;
  exclusionCode: string | null;
  ctaKey: string | null;
  signedIn: boolean;
  rankedCount: number;
  /** Plural noun for what is ranked, e.g. "contributors". */
  unit: string;
  /** Why someone would want to be on this board, shown when they are not. */
  hook: string;
}

export function BoardStats({
  myRank,
  myScore,
  eligiblePublic,
  exclusionCode,
  ctaKey,
  signedIn,
  rankedCount,
  unit,
  hook,
}: BoardStatsProps) {
  const position = !signedIn ? 'Join to be ranked' : myRank ? `#${myRank}` : 'Not ranked yet';
  const counted =
    rankedCount === 0 ? `No ${unit} ranked yet` : `${rankedCount.toLocaleString('en-US')} ${unit}`;
  const cta = CTA[ctaKey ?? ''] ?? CTA.complete_profile!;

  return (
    <details className="border-border bg-surface group rounded-2xl border">
      <summary className="text-foreground flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm">
        <Sparkles size={15} className="text-primary shrink-0" aria-hidden />
        <span className="font-semibold">{position}</span>
        <span className="text-foreground-muted truncate text-xs">· {counted}</span>
        <ChevronDown
          size={16}
          className="text-foreground-muted ml-auto shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-border grid grid-cols-1 gap-3 border-t p-4 sm:grid-cols-2">
        <div className="border-border bg-surface-muted rounded-xl border p-3">
          <span className="text-foreground-muted flex items-center gap-1.5">
            <Sparkles size={13} className="text-primary" aria-hidden />
            <span className="vp-label">Your position</span>
          </span>
          <span className="text-foreground mt-1 block text-xl leading-tight font-extrabold">
            {position}
          </span>
          {signedIn && myRank ? (
            <>
              <span className="text-foreground-muted mt-1 block text-xs">
                Private all-time position
                {myScore != null ? ` · ${myScore.toFixed(1)} points` : ''}
              </span>
              {!eligiblePublic && (
                <span className="text-foreground-muted mt-1 block text-xs">
                  You are not in the public snapshot (
                  {exclusionCode?.replaceAll('_', ' ') ?? 'privacy or eligibility'}). Only you can
                  see this.
                </span>
              )}
            </>
          ) : (
            <span className="text-foreground-muted mt-1 block text-xs">{hook}</span>
          )}
          <Link
            href={signedIn ? cta.href : '/signup'}
            className="text-primary mt-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold"
          >
            {signedIn ? cta.label : 'Create a free account'}
            <LinkSpinner />
          </Link>
        </div>
        <div className="border-border bg-surface-muted rounded-xl border p-3">
          <span className="text-foreground-muted flex items-center gap-1.5">
            <Users size={13} className="text-accent-cyan" aria-hidden />
            <span className="vp-label">Ranked here</span>
          </span>
          <span className="text-foreground mt-1 block text-xl leading-tight font-extrabold">
            {rankedCount === 0 ? 'Nobody yet' : rankedCount.toLocaleString('en-US')}
          </span>
          <span className="text-foreground-muted mt-1 block text-xs">
            {rankedCount === 0
              ? 'This board fills after the next update.'
              : `${unit} in the current rankings`}
          </span>
        </div>
      </div>
    </details>
  );
}
