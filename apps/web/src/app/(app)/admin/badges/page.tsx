import type { Metadata } from 'next';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { requireAdminPage } from '@/lib/moderation/staff';
import { searchUsers, getUserAdminDetail } from '@/lib/admin/user-queries';
import { nameInitials } from '@/lib/storage';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { LinkSpinner } from '@/components/ui/link-spinner';
import { BADGE_KEYS } from '@vouchplay/config';
import {
  getPlayerBadgesForAdmin,
  getBadgeHolders,
  listCommemorativeTournaments,
  countBadgeHolders,
} from '@/lib/badges/queries';
import { RecomputeButton } from '@/components/admin/badges/recompute-button';
import { AdminBadgePlayerSearch } from '@/components/admin/badges/player-search';
import { TagPlayerPanel } from '@/components/admin/badges/tag-player-panel';
import { HoldersTab } from '@/components/admin/badges/holders-tab';
import { EventBadgesTab } from '@/components/admin/badges/event-badges-tab';

export const metadata: Metadata = { title: 'Badges' };

type Tab = 'tag' | 'holders' | 'events';

interface Props {
  searchParams: Promise<{ tab?: string; player?: string; badge?: string; q?: string }>;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'tag', label: 'Tag a player' },
  { key: 'holders', label: 'Holders' },
  { key: 'events', label: 'Event badges' },
];

function tabHref(tab: Tab): string {
  return `/admin/badges?tab=${tab}`;
}

/**
 * Admin → Badges (master_plan §2BK B - Jasper's hard requirement: admins can manually tag and untag
 * ANY badge on any player). Same guard as every other Admin Control Center page (admin/super_admin,
 * MFA step-up). Tab/player/badge selection live in the URL so refresh and Back both work.
 */
export default async function AdminBadgesPage({ searchParams }: Props) {
  await requireAdminPage('/admin/badges');
  const sp = await searchParams;
  const tab: Tab = sp.tab === 'holders' ? 'holders' : sp.tab === 'events' ? 'events' : 'tag';

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/admin" className="text-foreground-muted hover:text-foreground text-sm">
          ← Admin
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-foreground text-xl font-semibold tracking-tight">Badges</h1>
            <Link
              href="/admin/settings#badges"
              className="text-primary mt-1 inline-flex items-center gap-1 text-xs font-medium"
            >
              <Settings size={12} aria-hidden /> Badge settings <LinkSpinner size={12} />
            </Link>
          </div>
          <RecomputeButton />
        </div>
      </div>

      <nav aria-label="Badge sections">
        <ul className="border-border bg-surface grid grid-cols-3 gap-1 rounded-2xl border p-1">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={tabHref(t.key)}
                aria-current={tab === t.key ? 'page' : undefined}
                className={`flex min-h-[44px] items-center justify-center rounded-xl px-2 py-2 text-center text-xs font-semibold transition-colors sm:text-sm ${
                  tab === t.key
                    ? 'vp-gradient vp-glow text-white'
                    : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground'
                }`}
              >
                {t.label}
                <LinkSpinner />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === 'tag' && <TagSection playerId={sp.player} q={sp.q} />}
      {tab === 'holders' && <HoldersSection badgeKey={sp.badge} />}
      {tab === 'events' && <EventsSection />}
    </section>
  );
}

async function TagSection({ playerId, q }: { playerId?: string; q?: string }) {
  if (playerId) {
    const [player, badges] = await Promise.all([
      getUserAdminDetail(playerId),
      getPlayerBadgesForAdmin(playerId),
    ]);
    if (!player) {
      return (
        <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-6 text-center text-sm">
          Player not found.{' '}
          <Link href="/admin/badges?tab=tag" className="text-primary underline">
            Search again
          </Link>
          .
        </p>
      );
    }
    return (
      <div className="space-y-4">
        <Link
          href="/admin/badges?tab=tag"
          className="text-foreground-muted hover:text-foreground text-xs"
        >
          ← Change player
        </Link>
        <TagPlayerPanel
          player={{
            id: player.id,
            name: player.name,
            avatarUrl: player.avatarUrl,
            csl: player.skill.csl,
            sts: player.skill.sts,
          }}
          badges={badges}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AdminBadgePlayerSearch initialQ={q ?? ''} />
      {q && <SearchResults q={q} />}
    </div>
  );
}

async function SearchResults({ q }: { q: string }) {
  const users = await searchUsers(q);
  if (users.length === 0) {
    return (
      <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-6 text-center text-sm">
        No players match that search.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {users.map((u) => (
        <li key={u.id}>
          <Link
            href={`/admin/badges?tab=tag&player=${u.id}`}
            className="border-border bg-surface vp-card relative flex items-center gap-3 rounded-2xl border p-3"
          >
            <PlayerAvatar
              url={u.avatarUrl}
              initials={nameInitials(u.name)}
              name={u.name}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <span className="text-foreground truncate text-sm font-semibold">{u.name}</span>
              <div className="text-foreground-muted flex flex-wrap items-center gap-x-2 text-xs">
                {u.slug && <span>@{u.slug}</span>}
                {u.city && <span>· {u.city}</span>}
              </div>
            </div>
            <LinkSpinner />
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function HoldersSection({ badgeKey }: { badgeKey?: string }) {
  const [counts, holders] = await Promise.all([
    countBadgeHolders(BADGE_KEYS as string[]),
    badgeKey ? getBadgeHolders(badgeKey) : Promise.resolve(null),
  ]);
  return <HoldersTab counts={counts} selectedKey={badgeKey ?? null} holders={holders} />;
}

async function EventsSection() {
  const tournaments = await listCommemorativeTournaments();
  return <EventBadgesTab tournaments={tournaments} />;
}
