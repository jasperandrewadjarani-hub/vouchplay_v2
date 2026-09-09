import Link from 'next/link';
import { ChevronDown, Crown, Medal, Users } from 'lucide-react';
import type { LeaderboardDTO, MomentumDTO } from '@/lib/leaderboards/types';
import { avatarUrl, clubLogoUrl, nameInitials } from '@/lib/storage';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { ButtonLink } from '@/components/ui/button';
import { LinkSpinner } from '@/components/ui/link-spinner';
import { formatDate } from '@/lib/format-date';
import { boardMeta, hasCompetitiveEvidence, podiumStyle } from '@/lib/leaderboards/board-meta';

function subjectHref(entry: LeaderboardDTO['entries'][number]): string {
  return `/${entry.subjectType === 'club' ? 'clubs' : 'players'}/${entry.slug}`;
}

function subjectImage(entry: LeaderboardDTO['entries'][number]): string | null {
  return entry.subjectType === 'club' ? clubLogoUrl(entry.imagePath) : avatarUrl(entry.imagePath);
}

export function LeaderboardPanel({
  board,
  compact = false,
  category,
  error = false,
  paused = false,
  viewerId = null,
}: {
  board: LeaderboardDTO | null;
  compact?: boolean;
  category?: LeaderboardDTO['category'];
  error?: boolean;
  paused?: boolean;
  /** The signed-in viewer, so their own row can be highlighted. Never used to reveal anyone else. */
  viewerId?: string | null;
}) {
  const meta = boardMeta(board?.category ?? category ?? 'players');
  if (error) {
    return (
      <section className="border-danger/40 bg-danger/5 rounded-2xl border p-5" role="alert">
        <h2 className="text-foreground font-semibold">{meta.title}</h2>
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
          {meta.title}
        </h2>
        <p className="text-foreground-muted mt-1 text-sm">{meta.subtitle}</p>
        <p className="text-foreground-muted mt-2 text-sm">
          No rankings published yet. This board appears after the next snapshot.
        </p>
      </section>
    );
  }
  // Withheld rather than empty: the board has rows, but none of them mean what the heading claims.
  const awaitingResults = !hasCompetitiveEvidence(board.category, board.entries);
  const podium = board.entries.slice(0, 3);
  const rest = board.entries.slice(3, compact ? 10 : board.entries.length);
  return (
    <section
      className="border-border bg-surface overflow-hidden rounded-2xl border"
      aria-labelledby={`board-${board.category}`}
    >
      <header className="border-border vp-hero flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div>
          <p className="vp-label text-primary">
            {board.scopeType === 'global' ? 'Global' : `${board.scopeType}: ${board.scopeValue}`}
          </p>
          <h2 id={`board-${board.category}`} className="text-foreground text-xl font-bold">
            {meta.title}
          </h2>
          <p className="text-foreground-muted mt-1 text-sm">{meta.subtitle}</p>
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
      {awaitingResults ? (
        <div className="p-5" role="status">
          <p className="text-foreground text-sm font-semibold">
            This board opens when tournament results start coming in.
          </p>
          <p className="text-foreground-muted mt-1 text-sm">
            Nobody has a verified tournament placement yet, so every player would be tied. Rather
            than show a ranking that does not mean anything, we are holding this board until
            organizers start awarding results. It fills in on its own from the next update after
            that.
          </p>
          <ButtonLink href="/tournaments" variant="secondary" className="mt-4">
            See upcoming tournaments
          </ButtonLink>
        </div>
      ) : board.entries.length === 0 ? (
        <div className="p-5">
          <p className="text-foreground-muted text-sm">
            {board.category === 'community'
              ? 'Nobody is ranked in this snapshot yet. Vouch for players you have genuinely played with, and you will appear here after the next snapshot.'
              : 'Nobody is ranked in this snapshot yet. Check back after the next snapshot.'}
          </p>
        </div>
      ) : (
        <>
          {/* Classic podium silhouette from `sm` up: second, first, third, with first raised. The DOM
              order stays 1, 2, 3, so reading and focus order still follow rank. Below `sm` the
              visual order matches too, because three cards across at 375px crushes the names. */}
          <ol
            className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:items-end"
            aria-label={`${meta.title} top three`}
          >
            {podium.map((entry) => (
              <Podium
                key={entry.subjectId}
                entry={entry}
                isViewer={viewerId != null && entry.subjectId === viewerId}
              />
            ))}
          </ol>
          {rest.length > 0 && (
            <ol
              className="divide-border border-border divide-y border-t"
              start={4}
              aria-label={`${meta.title} ranks four onward`}
            >
              {rest.map((entry) => {
                const isViewer = viewerId != null && entry.subjectId === viewerId;
                return (
                  <li key={entry.subjectId}>
                    <Link
                      href={subjectHref(entry)}
                      className={`flex min-h-14 items-center gap-3 px-4 py-3 ${
                        isViewer
                          ? 'bg-primary/10 ring-primary/40 hover:bg-primary/15 ring-1 ring-inset'
                          : 'hover:bg-surface-muted'
                      }`}
                    >
                      <span
                        className="text-foreground w-8 text-center text-sm font-extrabold"
                        aria-label={`Rank ${entry.rank}`}
                      >
                        #{entry.rank}
                      </span>
                      <PlayerAvatar
                        url={subjectImage(entry)}
                        initials={nameInitials(entry.displayName)}
                        name={entry.displayName}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-foreground flex items-center gap-2 truncate text-sm font-semibold">
                          {entry.displayName}
                          {isViewer && (
                            <span className="bg-primary shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white">
                              You
                            </span>
                          )}
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
                );
              })}
            </ol>
          )}
        </>
      )}
      {/* No footer while the board is withheld: a publish date and a second link to the same
          tournaments page only muddle a panel whose whole message is "not yet". */}
      {!awaitingResults && (
        <footer className="border-border bg-surface-muted flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs">
          <span className="text-foreground-muted">Published {formatDate(board.publishedAt)}</span>
          <span className="flex flex-wrap items-center gap-3">
            <Link
              href={meta.cta.href}
              className="text-foreground inline-flex items-center gap-1 font-semibold"
            >
              {meta.cta.label}
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
      )}
    </section>
  );
}

function Podium({
  entry,
  isViewer,
}: {
  entry: LeaderboardDTO['entries'][number];
  isViewer: boolean;
}) {
  const style = podiumStyle(entry.rank);
  const first = entry.rank === 1;
  // Rank is carried by size, medal name, icon and numeral together, never by colour alone.
  const order = first ? 'sm:order-2' : entry.rank === 2 ? 'sm:order-1' : 'sm:order-3';
  return (
    <li
      className={`border-border bg-surface-muted relative rounded-2xl border text-center ${order} ${
        first ? 'vp-glow border-amber-400/50 p-5 sm:pb-7' : 'p-4'
      } ${isViewer ? 'ring-primary ring-2' : ''}`}
      aria-label={`Rank ${entry.rank}${style ? `, ${style.medal}` : ''}: ${entry.displayName}`}
    >
      <span className="bg-foreground text-background absolute top-3 left-3 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-extrabold">
        {entry.rank}
      </span>
      {isViewer && (
        <span className="bg-primary absolute top-3 right-3 rounded-full px-2 py-0.5 text-[10px] font-bold text-white">
          You
        </span>
      )}
      {first ? (
        <Crown className={`mx-auto mb-2 ${style?.text ?? ''}`} size={30} aria-hidden />
      ) : (
        <Medal className={`mx-auto mb-2 ${style?.text ?? ''}`} size={22} aria-hidden />
      )}
      <div className="flex justify-center">
        <PlayerAvatar
          url={subjectImage(entry)}
          initials={nameInitials(entry.displayName)}
          name={entry.displayName}
          size={first ? 'lg' : 'md'}
          className={style ? `ring-2 ring-offset-2 ring-offset-transparent ${style.ring}` : ''}
        />
      </div>
      <Link
        href={subjectHref(entry)}
        className={`text-foreground mt-2 inline-flex items-center gap-1 font-bold hover:underline ${
          first ? 'text-lg' : ''
        }`}
      >
        {entry.displayName}
        <LinkSpinner />
      </Link>
      <p className={`mt-1 text-xs font-semibold ${style?.text ?? 'text-foreground-muted'}`}>
        {style?.medal} · {entry.score.toFixed(1)} points
      </p>
      {/* One line on a phone: the leading clause carries the person-specific fact, and three
          full explanations stacked pushed rank four off the bottom of a 375px screen. */}
      <p className="text-foreground-muted mt-2 line-clamp-1 text-[11px] sm:line-clamp-2">
        {entry.explanation}
      </p>
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

/**
 * The viewer's own standing, as a collapsed row.
 *
 * It used to sit above the Community Champions highlight as a full card, spending a card's height on
 * one number and opening a page about the community with a paragraph about the viewer (§1T). It now
 * sits below the boards: you see where the community stands, then where you stand in it.
 *
 * The closed summary states the rank, so the number is never hidden - only the explanation, the
 * points and the next action are behind the disclosure.
 */
export function MomentumCard({ rows }: { rows: MomentumDTO[] }) {
  if (!rows.length) return null;
  const row = rows.find((item) => item.category === 'players') ?? rows[0]!;
  const delta = row.previousRank && row.privateRank ? row.previousRank - row.privateRank : 0;
  const cta = CTA[row.ctaKey ?? ''] ?? CTA.complete_profile!;
  const position = row.privateRank ? `#${row.privateRank}` : 'Building';
  const movement = delta > 0 ? ` · up ${delta}` : '';
  return (
    <details className="border-border bg-surface group rounded-2xl border">
      <summary className="text-foreground flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm">
        <Users size={15} className="text-primary shrink-0" aria-hidden />
        <span className="font-semibold">Your momentum</span>
        <span className="text-foreground-muted truncate text-xs">
          {position}
          {movement}
        </span>
        <ChevronDown
          size={16}
          className="text-foreground-muted ml-auto shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-border border-t p-4">
        <p className="text-foreground text-2xl font-extrabold">{position}</p>
        <p className="text-foreground-muted mt-1 text-sm">
          Private all-time position · {row.score.toFixed(1)} points
          {movement}
        </p>
        {!row.eligiblePublic && (
          <p className="text-foreground-muted mt-2 text-xs">
            You are not in the public snapshot (
            {row.exclusionCode?.replaceAll('_', ' ') ?? 'privacy or eligibility'}). This private
            view remains visible only to you.
          </p>
        )}
        <ButtonLink href={cta.href} variant="secondary" className="mt-4">
          {cta.label}
        </ButtonLink>
      </div>
    </details>
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
