import type { ReactNode } from 'react';
import Link from 'next/link';
import { Users, ShieldCheck, Trophy, Medal } from 'lucide-react';
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
    <div className="space-y-8">
      {/* Hero */}
      <section className="border-border bg-surface vp-hero vp-in relative overflow-hidden rounded-3xl border p-7 sm:p-10">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        <p className="vp-label text-primary mb-3">Community-verified skill</p>
        <h1 className="text-foreground max-w-2xl text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
          Your game, <span className="vp-gradient-text">vouched for</span> by the players you
          actually play with.
        </h1>
        <p className="text-foreground-muted mt-3 max-w-xl text-sm sm:text-base">
          Find players, build trusted profiles, and play more.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/players" className="px-5 py-3">
            Browse players
          </ButtonLink>
          {user ? (
            <ButtonLink href="/me" variant="secondary" className="px-5 py-3">
              My profile
            </ButtonLink>
          ) : (
            <ButtonLink href="/signup" variant="secondary" className="px-5 py-3">
              Create your profile
            </ButtonLink>
          )}
        </div>
      </section>

      {/* What you can do — lead with action, then show proof and momentum. */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FeatureCard
          icon={<Users size={20} aria-hidden />}
          title="Discover players"
          body="Find people to play with by skill, city, and role."
        />
        <FeatureCard
          icon={<ShieldCheck size={20} aria-hidden />}
          title="Build trust"
          body="Share real vouches from players and coaches who know your game."
        />
        <FeatureCard
          icon={<Trophy size={20} aria-hidden />}
          title="Play more"
          body="Join clubs and register for tournaments when they open."
        />
      </section>

      {settings.enabled && (
        <section className="space-y-5" aria-labelledby="home-rankings-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="vp-label text-primary">Verified momentum</p>
              <h2
                id="home-rankings-title"
                className="text-foreground flex items-center gap-2 text-2xl font-extrabold"
              >
                <Trophy className="text-primary" size={22} aria-hidden />
                Community leaderboards
              </h2>
              <p className="text-foreground-muted mt-1 max-w-2xl text-sm">
                Participation and genuine support—not raw STS, ratings, or volume.
              </p>
            </div>
            <ButtonLink href="/leaderboards" variant="secondary">
              Explore all rankings
            </ButtonLink>
          </div>
          {user && <MomentumCard rows={momentum} />}
          <div className="space-y-5">
            <div className="relative">
              <Medal className="text-primary absolute top-4 right-4 z-10" size={20} aria-hidden />
              <LeaderboardPanel
                board={players.board}
                error={players.error}
                category="players"
                paused={settings.paused.players}
                compact
              />
            </div>
            <div className="relative">
              <Medal className="text-primary absolute top-4 right-4 z-10" size={20} aria-hidden />
              <LeaderboardPanel
                board={community.board}
                error={community.error}
                category="community"
                paused={settings.paused.community}
                compact
              />
            </div>
            <div className="relative">
              <Trophy className="text-primary absolute top-4 right-4 z-10" size={20} aria-hidden />
              <LeaderboardPanel
                board={clubs.board}
                error={clubs.error}
                category="clubs"
                paused={settings.paused.clubs}
                compact
              />
            </div>
          </div>
          <RankingsExplanation />
        </section>
      )}

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
          Powered by {BRAND.developer}
        </a>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="border-border bg-surface vp-card rounded-2xl border p-5">
      <span className="vp-gradient inline-flex h-10 w-10 items-center justify-center rounded-xl text-white">
        {icon}
      </span>
      <h2 className="text-foreground mt-3 font-semibold">{title}</h2>
      <p className="text-foreground-muted mt-1 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
