import Link from 'next/link';
import { Medal, Trophy, Users } from 'lucide-react';
import type { LeaderboardDTO, MomentumDTO } from '@/lib/leaderboards/types';
import { avatarUrl, clubLogoUrl, nameInitials } from '@/lib/storage';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { ButtonLink } from '@/components/ui/button';
import { LinkSpinner } from '@/components/ui/link-spinner';
import { formatDate } from '@/lib/format-date';

const TITLES = { players: 'Players', community: 'Community Champions', clubs: 'Clubs' } as const;
const BOARD_CTA = {
  players: { href: '/tournaments', label: 'Find a tournament' },
  community: { href: '/players', label: 'Find someone you genuinely know' },
  clubs: { href: '/clubs', label: 'Find a club' },
} as const;

export function LeaderboardPanel({
  board,
  compact = false,
  category,
  error = false,
  paused = false,
}: {
  board: LeaderboardDTO | null;
  compact?: boolean;
  category?: LeaderboardDTO['category'];
  error?: boolean;
  paused?: boolean;
}) {
  const title = TITLES[board?.category ?? category ?? 'players'];
  if (error) {
    return (
      <section className="border-danger/40 bg-danger/5 rounded-2xl border p-5" role="alert">
        <h2 className="text-foreground font-semibold">{title}</h2>
        <p className="text-foreground-muted mt-2 text-sm">
          This ranking could not be loaded. No replacement snapshot was published; try again
          shortly.
        </p>
      </section>
    );
  }
  if (!board) {
    const emptyId = `leaderboard-empty-${category ?? 'players'}`;
    return (
      <section
        className="border-border bg-surface rounded-2xl border p-5"
        aria-labelledby={emptyId}
      >
        <h2 id={emptyId} className="text-foreground font-semibold">
          {title}
        </h2>
        <p className="text-foreground-muted mt-2 text-sm">No rankings yet.</p>
      </section>
    );
  }
  const podium = board.entries.slice(0, 3);
  const rest = board.entries.slice(3, compact ? 10 : board.entries.length);
  return (
    <section
      className="border-border bg-surface overflow-hidden rounded-2xl border"
      aria-labelledby={`board-${board.category}`}
    >
      <header className="border-border flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div>
          <p className="vp-label text-primary">
            {board.scopeType === 'global' ? 'Global' : `${board.scopeType}: ${board.scopeValue}`}
          </p>
          <h2 id={`board-${board.category}`} className="text-foreground text-xl font-bold">
            {title}
          </h2>
          <p className="text-foreground-muted mt-1 text-xs capitalize">
            {board.period.replace('_', ' ')}
          </p>
        </div>
        <span className="flex flex-wrap gap-2">
          {paused && (
            <span
              className="border-warning/40 bg-warning/10 text-warning rounded-full border px-3 py-1 text-xs font-semibold"
              role="status"
            >
              Publication paused
            </span>
          )}
          {board.stale && (
            <span
              className="border-warning/40 bg-warning/10 text-warning rounded-full border px-3 py-1 text-xs font-semibold"
              role="status"
            >
              Snapshot is stale
            </span>
          )}
        </span>
      </header>
      {board.entries.length === 0 ? (
        <div className="p-5">
          <p className="text-foreground-muted text-sm">No rankings yet.</p>
        </div>
      ) : (
        <>
          <ol
            className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3"
            aria-label={`${title} top three`}
          >
            {podium.map((entry) => (
              <Podium key={entry.subjectId} entry={entry} category={board.category} />
            ))}
          </ol>
          {rest.length > 0 && (
            <ol
              className="divide-border border-border divide-y border-t"
              start={4}
              aria-label={`${title} ranks four onward`}
            >
              {rest.map((entry) => (
                <li key={entry.subjectId}>
                  <Link
                    href={`/${entry.subjectType === 'club' ? 'clubs' : 'players'}/${entry.slug}`}
                    className="hover:bg-surface-muted flex min-h-14 items-center gap-3 px-4 py-3"
                  >
                    <span
                      className="text-foreground w-8 text-center text-sm font-extrabold"
                      aria-label={`Rank ${entry.rank}`}
                    >
                      #{entry.rank}
                    </span>
                    <PlayerAvatar
                      url={
                        entry.subjectType === 'club'
                          ? clubLogoUrl(entry.imagePath)
                          : avatarUrl(entry.imagePath)
                      }
                      initials={nameInitials(entry.displayName)}
                      name={entry.displayName}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground block truncate text-sm font-semibold">
                        {entry.displayName}
                      </span>
                      <span className="text-foreground-muted block truncate text-xs">
                        {entry.city ?? 'Location not shown'}
                      </span>
                    </span>
                    <span className="text-foreground-muted text-xs tabular-nums">
                      {entry.score.toFixed(1)} pts
                    </span>
                    <LinkSpinner />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      <footer className="border-border bg-surface-muted flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs">
        <span className="text-foreground-muted">Published {formatDate(board.publishedAt)}</span>
        <span className="flex flex-wrap items-center gap-3">
          <Link
            href={BOARD_CTA[board.category].href}
            className="text-foreground inline-flex items-center gap-1 font-semibold"
          >
            {BOARD_CTA[board.category].label}
            <LinkSpinner />
          </Link>
          {compact && (
            <Link
              href={`/leaderboards?category=${board.category}`}
              className="text-primary inline-flex items-center gap-1 font-semibold"
            >
              View full leaderboard <LinkSpinner />
            </Link>
          )}
        </span>
      </footer>
    </section>
  );
}

function Podium({
  entry,
  category,
}: {
  entry: LeaderboardDTO['entries'][number];
  category: LeaderboardDTO['category'];
}) {
  const Icon = entry.rank === 1 ? Trophy : Medal;
  return (
    <li
      className="border-border bg-surface-muted relative rounded-2xl border p-4 text-center"
      aria-label={`Rank ${entry.rank}: ${entry.displayName}`}
    >
      <span className="bg-foreground text-background absolute top-3 left-3 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-extrabold">
        {entry.rank}
      </span>
      <Icon className="text-primary mx-auto mb-2" size={entry.rank === 1 ? 28 : 23} aria-hidden />
      <div className="flex justify-center">
        <PlayerAvatar
          url={
            entry.subjectType === 'club' ? clubLogoUrl(entry.imagePath) : avatarUrl(entry.imagePath)
          }
          initials={nameInitials(entry.displayName)}
          name={entry.displayName}
          size="md"
        />
      </div>
      <Link
        href={`/${entry.subjectType === 'club' ? 'clubs' : 'players'}/${entry.slug}`}
        className="text-foreground mt-2 inline-flex items-center gap-1 font-bold hover:underline"
      >
        {entry.displayName}
        <LinkSpinner />
      </Link>
      <p className="text-foreground-muted mt-1 text-xs">{entry.score.toFixed(1)} points</p>
      <p className="text-foreground-muted mt-2 line-clamp-2 text-[11px]">{entry.explanation}</p>
      <span className="sr-only">
        {TITLES[category]} podium place {entry.rank}
      </span>
    </li>
  );
}

const CTA: Record<string, { href: string; label: string }> = {
  register_tournament: { href: '/tournaments', label: 'Register for a tournament' },
  complete_profile: { href: '/me/edit', label: 'Complete your profile' },
  request_vouch: { href: '/players', label: 'Request a vouch from someone you know' },
  vouch_known_player: { href: '/players', label: 'Vouch for a player you genuinely know' },
  join_club: { href: '/clubs', label: 'Join a club' },
};

export function MomentumCard({ rows }: { rows: MomentumDTO[] }) {
  if (!rows.length) return null;
  const row = rows.find((item) => item.category === 'players') ?? rows[0]!;
  const delta = row.previousRank && row.privateRank ? row.previousRank - row.privateRank : 0;
  const cta = CTA[row.ctaKey ?? ''] ?? CTA.complete_profile!;
  return (
    <aside
      className="border-primary/40 bg-primary/5 rounded-2xl border p-5"
      aria-labelledby="momentum-title"
    >
      <div className="flex items-center gap-2">
        <Users className="text-primary" size={20} aria-hidden />
        <h2 id="momentum-title" className="text-foreground font-bold">
          Your momentum
        </h2>
      </div>
      <p className="text-foreground mt-3 text-2xl font-extrabold">
        {row.privateRank ? `#${row.privateRank}` : 'Building'}
      </p>
      <p className="text-foreground-muted mt-1 text-sm">
        Private all-time position · {row.score.toFixed(1)} points{delta > 0 ? ` · up ${delta}` : ''}
      </p>
      {!row.eligiblePublic && (
        <p className="text-foreground-muted mt-2 text-xs">
          You are not in the public snapshot (
          {row.exclusionCode?.replaceAll('_', ' ') ?? 'privacy or eligibility'}). This private view
          remains visible only to you.
        </p>
      )}
      <ButtonLink href={cta.href} variant="secondary" className="mt-4">
        {cta.label}
      </ButtonLink>
    </aside>
  );
}

export function RankingsExplanation() {
  return (
    <details className="border-border bg-surface rounded-2xl border p-5">
      <summary className="text-foreground cursor-pointer font-semibold">How rankings work</summary>
      <div className="text-foreground-muted mt-3 space-y-2 text-sm leading-relaxed">
        <p>
          Players use verified tournament participation, official placements, capped profile
          completion, and Skill Verified only as a supporting signal. Raw STS is never ranked.
        </p>
        <p>
          Community Champions reward distinct players genuinely helped, with newcomer support,
          repeat suppression, diminishing returns, decay, and reciprocity/ring dampening. Rating
          favourability and raw vouch volume do not earn points.
        </p>
        <p>
          Clubs use verified participation, represented attendance, active members, official
          placements, and dampened member contribution. Eligibility and privacy checks run before
          publication.
        </p>
      </div>
    </details>
  );
}
