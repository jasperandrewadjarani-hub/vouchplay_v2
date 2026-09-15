import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { requireAdminPage } from '@/lib/moderation/staff';
import { listPlayersForBadgeTagging } from '@/lib/admin/user-queries';
import { getDirectoryCityOptions } from '@/lib/players/queries';
import { LinkSpinner } from '@/components/ui/link-spinner';
import { BADGE_KEYS } from '@vouchplay/config';
import {
  getBadgeHolders,
  listCommemorativeTournaments,
  countBadgeHolders,
} from '@/lib/badges/queries';
import { RecomputeButton } from '@/components/admin/badges/recompute-button';
import { TagScreen } from '@/components/admin/badges/tag-screen';
import { HoldersTab } from '@/components/admin/badges/holders-tab';
import { EventBadgesTab } from '@/components/admin/badges/event-badges-tab';

export const metadata: Metadata = { title: 'Badges' };

type Tab = 'tag' | 'holders' | 'events';

interface Props {
  searchParams: Promise<{ tab?: string; badge?: string; q?: string }>;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'tag', label: 'Tag' },
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

      {tab === 'tag' && (
        // TagScreen calls useSearchParams (to mirror the debounced search into the URL) - Next
        // requires a Suspense boundary around any subtree that does, even on an already-dynamic page.
        <Suspense fallback={null}>
          <TagSection q={sp.q} />
        </Suspense>
      )}
      {tab === 'holders' && <HoldersSection badgeKey={sp.badge} />}
      {tab === 'events' && <EventsSection />}
    </section>
  );
}

/**
 * Admin → Badges "Tag" tab (master_plan §2BL E): the one-screen batch tagging flow. The server only
 * renders the first page (filter-less, or matching a shared `?q=`) - every subsequent search/filter/
 * page/selection change happens client-side in `TagScreen` via the `adminListPlayersForBadgeTagging`
 * action, since selection has to persist across all of those and that only works as client state.
 */
async function TagSection({ q }: { q?: string }) {
  const [{ players, total }, cityOptions] = await Promise.all([
    listPlayersForBadgeTagging({ q: q?.trim() || undefined, page: 1, pageSize: 30 }),
    getDirectoryCityOptions(),
  ]);
  return (
    <TagScreen
      initialPlayers={players}
      initialTotal={total}
      cityOptions={cityOptions}
      initialQ={q?.trim() ?? ''}
    />
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
