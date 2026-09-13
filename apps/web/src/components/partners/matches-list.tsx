import Link from 'next/link';
import type { PartnerMatchView } from '@/lib/partners/types';
import { PlayerAvatar } from '@/components/players/player-avatar';

/**
 * The single action a match row (or the match modal) offers, driven entirely by `door.kind` - decided
 * server-side at match time (master_plan §2AV F). Never more than one button.
 */
export function MatchDoorAction({
  match,
  tournamentSlug,
}: {
  match: PartnerMatchView;
  tournamentSlug: string;
}) {
  const { door } = match;
  switch (door.kind) {
    case 'invited':
      return door.byViewer ? (
        <span className="text-foreground-muted shrink-0 text-right text-xs">
          Invitation sent - waiting for {match.partner.displayName}
          <Link
            href={`/tournaments/${tournamentSlug}#my-registrations`}
            className="text-primary block font-medium hover:underline"
          >
            My registrations
          </Link>
        </span>
      ) : (
        <Link
          href={`/tournaments/${tournamentSlug}#partner-invitations`}
          className="vp-gradient shrink-0 rounded-lg px-3 py-2 text-center text-xs font-semibold text-white"
        >
          Accept the invitation
        </Link>
      );
    case 'enter_together':
      return (
        <Link
          href={door.href}
          className="vp-gradient shrink-0 rounded-lg px-3 py-2 text-center text-xs font-semibold text-white"
        >
          Enter together
        </Link>
      );
    case 'entered':
      return (
        <span className="bg-success/15 text-success shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold">
          You&rsquo;re entered together
        </span>
      );
    case 'closed':
      return (
        <span className="text-foreground-muted shrink-0 text-right text-xs">{door.reason}</span>
      );
  }
}

/**
 * Matches sit above the card stack on the deck (master_plan §2AV E/G) - the first thing a returning
 * player sees is what already happened, not another card to swipe.
 */
export function MatchesList({
  matches,
  tournamentSlug,
  onOpenMatch,
}: {
  matches: PartnerMatchView[];
  tournamentSlug: string;
  /** Optional: tapping a row reopens the one-sentence match modal instead of just showing the door
   *  action inline. */
  onOpenMatch?: (match: PartnerMatchView) => void;
}) {
  if (matches.length === 0) return null;
  return (
    <div className="border-primary/30 bg-primary/5 space-y-2.5 rounded-2xl border p-3.5">
      <p className="text-foreground text-sm font-semibold">
        {matches.length === 1 ? 'Your match' : `Your matches (${matches.length})`}
      </p>
      <ul className="space-y-2">
        {matches.map((m) => (
          <li
            key={m.id}
            className="border-border bg-surface flex items-center gap-3 rounded-xl border p-2.5"
          >
            <button
              type="button"
              onClick={() => onOpenMatch?.(m)}
              disabled={!onOpenMatch}
              className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
            >
              <PlayerAvatar
                url={m.partner.avatarUrl}
                initials={m.partner.initials}
                name={m.partner.displayName}
                size="sm"
              />
              <span className="min-w-0 flex-1">
                <span className="text-foreground block truncate text-sm font-medium">
                  {m.partner.displayName}
                </span>
                <span className="text-foreground-muted block truncate text-xs">
                  {m.divisions.map((d) => d.name).join(', ')}
                </span>
              </span>
            </button>
            <MatchDoorAction match={m} tournamentSlug={tournamentSlug} />
          </li>
        ))}
      </ul>
    </div>
  );
}
