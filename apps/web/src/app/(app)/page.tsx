import type { ReactNode } from 'react';
import Link from 'next/link';
import { Users, ShieldCheck, Trophy } from 'lucide-react';
import { BRAND } from '@vouchplay/config';
import { getOptionalUser } from '@/lib/auth';
import { ButtonLink } from '@/components/ui/button';
import { getLeaderboardSettings } from '@/lib/settings';
import { getLeaderboard, getMyMomentum } from '@/lib/leaderboards/queries';
import {
  LeaderboardPanel,
  MomentumCard,
  RankingsExplanation,
} from '@/components/leaderboards/leaderboard-panel';

export default async function HomePage() {
  const user = await getOptionalUser();
  const settings = await getLeaderboardSettings();
  const safeBoard = async (request: ReturnType<typeof getLeaderboard>) => {
    try {
      return { board: await request, error: false };
    } catch {
      return { board: null, error: true };
    }
  };
  const [players, community, clubs, momentum] = settings.enabled
    ? await Promise.all([
        safeBoard(getLeaderboard('players', 'global', null, 'all_time', settings.homeLimit)),
        safeBoard(getLeaderboard('community', 'global', null, 'all_time', settings.homeLimit)),
        safeBoard(getLeaderboard('clubs', 'global', null, 'all_time', settings.homeLimit)),
        user ? getMyMomentum(user.id).catch(() => []) : Promise.resolve([]),
      ])
    : [
        { board: null, error: false },
        { board: null, error: false },
        { board: null, error: false },
        [],
      ];

  return (
    <div className="space-y-6">
      {/* Hero. Condensed to padding and one type step only: cutting whitespace is reversible,
          cutting the sentence that explains the product to a first-time visitor is not (§1R). */}
      <section className="border-border bg-surface vp-hero vp-in relative overflow-hidden rounded-3xl border p-5 sm:p-7">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        <p className="vp-label text-primary mb-2">Community-verified skill</p>
        <h1 className="text-foreground max-w-2xl text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl">
          Your game, <span className="vp-gradient-text">vouched for</span> by the players you play
          with.
        </h1>
        <p className="text-foreground-muted mt-2 max-w-xl text-sm">
          Find players, build a trusted profile, climb the leaderboards, and play more.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink href="/players">Browse players</ButtonLink>
          {user ? (
            <ButtonLink href="/me" variant="secondary">
              My profile
            </ButtonLink>
          ) : (
            <ButtonLink href="/signup" variant="secondary">
              Create your profile
            </ButtonLink>
          )}
        </div>
      </section>

      {settings.enabled && (
        <>
          {/* The highlight. Community Champions is the only board with real earned separation today
              (§1Q), so it is the only one that can honestly carry the middle of the page. It gets the
              hero's gradient edge and glow so it reads as the centrepiece, not another list. */}
          <section className="space-y-3" aria-labelledby="home-spotlight-title">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="vp-label text-primary">Community spotlight</p>
                <h2
                  id="home-spotlight-title"
                  className="text-foreground flex items-center gap-2 text-xl font-extrabold"
                >
                  <Trophy className="text-primary" size={20} aria-hidden />
                  Who is leading right now
                </h2>
              </div>
              <ButtonLink href="/leaderboards" variant="secondary">
                All rankings
              </ButtonLink>
            </div>
            {/* A signed-in player sees their own position immediately before seeing whose position
                they are chasing. */}
            {user && <MomentumCard rows={momentum} />}
            <div className="vp-glow relative overflow-hidden rounded-2xl">
              <div className="vp-gradient absolute inset-x-0 top-0 z-10 h-1" aria-hidden />
              <LeaderboardPanel
                board={community.board}
                error={community.error}
                category="community"
                paused={settings.paused.community}
                compact
                viewerId={user?.id ?? null}
              />
            </div>
          </section>

          {/* Everything else, clearly secondary. */}
          <section className="space-y-3" aria-labelledby="home-more-rankings-title">
            <h2
              id="home-more-rankings-title"
              className="text-foreground-muted vp-label flex items-center gap-2"
            >
              More rankings
            </h2>
            <LeaderboardPanel
              board={clubs.board}
              error={clubs.error}
              category="clubs"
              paused={settings.paused.clubs}
              compact
              viewerId={user?.id ?? null}
            />
            <LeaderboardPanel
              board={players.board}
              error={players.error}
              category="players"
              paused={settings.paused.players}
              compact
              viewerId={user?.id ?? null}
            />
            <RankingsExplanation />
          </section>
        </>
      )}

      {/* What you can do, after the proof rather than before it: the cards describe the product, the
          board demonstrates it, and evidence persuades a newcomer more than a description (§1R). */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="What you can do here">
        <FeatureCard
          icon={<Users size={18} aria-hidden />}
          title="Discover players"
          body="Find people to play with by skill, city, and role."
        />
        <FeatureCard
          icon={<ShieldCheck size={18} aria-hidden />}
          title="Build trust"
          body="Share real vouches from players and coaches who know your game."
        />
        <FeatureCard
          icon={<Trophy size={18} aria-hidden />}
          title="Play more"
          body="Join clubs and register for tournaments when they open."
        />
      </section>

      <footer className="border-border mt-2 border-t pt-5 text-center">
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
          <Link href="/about" className="text-foreground-muted hover:text-foreground">
            About
          </Link>
          <Link href="/faq" className="text-foreground-muted hover:text-foreground">
            FAQ
          </Link>
          <Link href="/terms" className="text-foreground-muted hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="text-foreground-muted hover:text-foreground">
            Privacy
          </Link>
        </nav>
        <a
          href={BRAND.jtFacebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground-muted hover:text-foreground mt-2 inline-block text-[11px]"
        >
          Developed by {BRAND.developer}
        </a>
      </footer>
    </div>
  );
}

/**
 * Compact by design: the icon sits beside the title rather than above it, so three cards cost about
 * half the height on a phone without dropping a word of the explanation (§1R).
 */
function FeatureCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="border-border bg-surface vp-card flex gap-3 rounded-2xl border p-4">
      <span className="vp-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="text-foreground block text-sm font-semibold">{title}</span>
        <span className="text-foreground-muted mt-0.5 block text-xs leading-relaxed">{body}</span>
      </span>
    </div>
  );
}
