import type { ReactNode } from 'react';
import { Users, ShieldCheck, Trophy } from 'lucide-react';
import { getOptionalUser } from '@/lib/auth';
import { ButtonLink } from '@/components/ui/button';
import { getLeaderboardSettings } from '@/lib/settings';
import { getLeaderboard, getMyMomentum } from '@/lib/leaderboards/queries';
import {
  LeaderboardPanel,
  MomentumCard,
  RankingsExplanation,
} from '@/components/leaderboards/leaderboard-panel';
import { SignupWall } from '@/components/ui/signup-wall';

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
  const empty = { board: null, error: false } as const;
  // Guest Home (master_plan §2AH): a signed-out visitor sees the Community Champions top 3 and the
  // Clubs top 3, then a signup prompt - the players board, momentum and the product cards are for
  // members. So for a guest we fetch community + clubs at limit 3 and skip the players read (egress).
  const homeBoardLimit = user ? settings.homeLimit : 3;
  const [players, community, clubs, momentum] = settings.enabled
    ? await Promise.all([
        user
          ? safeBoard(getLeaderboard('players', 'global', null, 'all_time', settings.homeLimit))
          : Promise.resolve(empty),
        safeBoard(getLeaderboard('community', 'global', null, 'all_time', homeBoardLimit)),
        safeBoard(getLeaderboard('clubs', 'global', null, 'all_time', homeBoardLimit)),
        user ? getMyMomentum(user.id).catch(() => []) : Promise.resolve([]),
      ])
    : [empty, empty, empty, []];

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
            <div className="vp-glow relative overflow-hidden rounded-2xl">
              <div className="vp-gradient absolute inset-x-0 top-0 z-10 h-1" aria-hidden />
              <LeaderboardPanel
                board={community.board}
                authed={Boolean(user)}
                error={community.error}
                category="community"
                paused={settings.paused.community}
                compact
                viewerId={user?.id ?? null}
                hideSubtitle
              />
            </div>
          </section>

          {/* Guests get the Clubs top 3 too, then a signup prompt (master_plan §2AH); the players
              board, momentum and the explainer are for members. Signed-in visitors keep the full
              "More rankings" section unchanged. */}
          {user ? (
            <section className="space-y-3" aria-labelledby="home-more-rankings-title">
              <h2
                id="home-more-rankings-title"
                className="text-foreground-muted vp-label flex items-center gap-2"
              >
                More rankings
              </h2>
              <LeaderboardPanel
                board={clubs.board}
                authed
                error={clubs.error}
                category="clubs"
                paused={settings.paused.clubs}
                compact
                viewerId={user.id}
                hideSubtitle
              />
              <LeaderboardPanel
                board={players.board}
                authed
                error={players.error}
                category="players"
                paused={settings.paused.players}
                compact
                viewerId={user.id}
                hideSubtitle
              />
              {/* Below the boards, not above them: the middle of Home belongs to the community, and
                  this is where you stand in it (§1T). Collapsed, with the rank still in the summary. */}
              <MomentumCard rows={momentum} />
              <RankingsExplanation />
            </section>
          ) : (
            <section className="space-y-3" aria-label="Top clubs">
              <h2 className="text-foreground-muted vp-label flex items-center gap-2">Top clubs</h2>
              <LeaderboardPanel
                board={clubs.board}
                authed={false}
                error={clubs.error}
                category="clubs"
                paused={settings.paused.clubs}
                compact
                hideSubtitle
              />
            </section>
          )}
        </>
      )}

      {/* Guest signup prompt, right below the two spotlight boards (master_plan §2AH). */}
      {!user && (
        <SignupWall
          title="See everyone, and join in"
          message="Create a free account to see the full rankings, discover players and clubs, and build your own trusted profile."
          next="/home"
        />
      )}

      {/* What you can do, after the proof rather than before it: the cards describe the product, the
          board demonstrates it, and evidence persuades a newcomer more than a description (§1R). For a
          guest, Home ends at the signup prompt above (§2AH), so these member-oriented cards are hidden. */}
      {user && (
        <section
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          aria-label="What you can do here"
        >
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
      )}
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
