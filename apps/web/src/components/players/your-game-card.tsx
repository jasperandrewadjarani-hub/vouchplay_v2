import Link from 'next/link';
import type { ViewerGame } from '@/lib/badges/types';
import { TierRingAvatar } from './tier-ring-avatar';
import { RatingsPrivateInline } from './badges';

/**
 * "Your game" card (master_plan §2BK F): the signed-in, onboarded viewer's own tier, STS and
 * players-board rank at a glance, plus a progress bar toward a trusted (Proven-badge) rating - one
 * tap to their own profile. Server component: every number here is already resolved by
 * `getViewerGame` (lane 1), nothing here needs client state.
 */
export function YourGameCard({ game }: { game: ViewerGame }) {
  const pct = game.tier
    ? Math.max(0, Math.min(100, (game.uniqueVouchers / Math.max(1, game.provenTarget)) * 100))
    : null;
  const trusted = game.uniqueVouchers >= game.provenTarget;

  const body = (
    <>
      <TierRingAvatar
        url={game.avatarUrl}
        initials={game.initials}
        name={game.displayName}
        size="sm"
        ringColor={game.tier?.color ?? null}
        pct={pct}
      />
      <div className="min-w-0">
        <p className="text-accent-cyan text-[10px] font-extrabold tracking-[0.14em] uppercase">
          Your game
        </p>
        <p className="text-foreground truncate text-[15px] font-extrabold">
          {game.displayName}
          {game.nickname && (
            <span className="text-foreground-muted ml-1.5 text-xs font-semibold">
              &ldquo;{game.nickname}&rdquo;
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-xs">
          {game.communityRatingPrivate ? (
            <RatingsPrivateInline own />
          ) : game.tier ? (
            <span className="text-foreground-muted inline-flex items-center gap-1.5 font-semibold">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: game.tier.color }}
                aria-hidden
              />
              <span className="text-foreground">{game.tier.label}</span>
              {game.sts != null && <span>· STS {game.sts.toFixed(1)}</span>}
            </span>
          ) : (
            <span className="text-foreground-muted font-semibold">Not rated yet</span>
          )}
        </p>
      </div>
      {game.rank && (
        <div className="shrink-0 text-right">
          <p className="text-foreground text-xl leading-none font-extrabold tabular-nums">
            #{game.rank.position}
          </p>
          {game.rank.delta != null && game.rank.delta !== 0 && (
            <p
              className={`mt-1 text-[11px] font-extrabold ${
                game.rank.delta > 0 ? 'text-accent-lime' : 'text-danger'
              }`}
            >
              {game.rank.delta > 0 ? '▲' : '▼'}
              {Math.abs(game.rank.delta)}
            </p>
          )}
        </div>
      )}
      <div className="col-span-full">
        <div className="text-foreground-muted mb-1.5 flex items-center justify-between text-[11px]">
          <span>Vouches to a trusted rating</span>
          {!trusted && (
            <span className="text-foreground font-bold tabular-nums">
              {game.uniqueVouchers} / {game.provenTarget}
            </span>
          )}
        </div>
        {trusted ? (
          <p className="text-accent-lime text-xs font-extrabold">Trusted rating ✓</p>
        ) : (
          <div className="bg-surface-muted h-[7px] overflow-hidden rounded-full">
            <div
              className="vp-gradient h-full rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, (game.uniqueVouchers / Math.max(1, game.provenTarget)) * 100))}%`,
              }}
            />
          </div>
        )}
      </div>
    </>
  );

  const cardStyle = {
    backgroundImage:
      'radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 55%), ' +
      'radial-gradient(90% 120% at 100% 100%, color-mix(in srgb, var(--accent-cyan) 14%, transparent), transparent 60%)',
    backgroundColor: 'var(--surface)',
    borderColor: 'color-mix(in srgb, var(--primary) 35%, transparent)',
  };
  const cardClass =
    'grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-3 rounded-2xl border p-3';

  return game.slug ? (
    <Link href={`/players/${game.slug}`} className={cardClass} style={cardStyle}>
      {body}
    </Link>
  ) : (
    <div className={cardClass} style={cardStyle}>
      {body}
    </div>
  );
}
