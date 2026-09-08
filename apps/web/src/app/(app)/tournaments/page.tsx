import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import {
  listManagedTournaments,
  listTournaments,
  type TournamentFilters,
} from '@/lib/tournaments/queries';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { TournamentCard } from '@/components/tournaments/tournament-card';
import { LinkSpinner } from '@/components/ui/link-spinner';
import { InstantFilterForm } from '@/components/ui/instant-filter-form';
import {
  ManagedTournamentFilters,
  type ManagedVisibilityStatus,
} from '@/components/tournaments/managed-tournament-filters';

export const metadata: Metadata = {
  title: 'Tournaments',
  description:
    'Find pickleball tournaments on VouchPlay - discover events, divisions, and organizers.',
};

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function parseFilters(sp: SP): TournamentFilters {
  const pageNum = Number(one(sp.page));
  return {
    q: one(sp.q),
    city: one(sp.city),
    page: Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1,
  };
}
const HIDE_PARAM: Record<ManagedVisibilityStatus, string> = {
  draft: 'hideDraft',
  cancelled: 'hideCancelled',
  archived: 'hideArchived',
};

function parseHiddenStatuses(sp: SP): ManagedVisibilityStatus[] {
  const explicit = (Object.entries(HIDE_PARAM) as Array<[ManagedVisibilityStatus, string]>)
    .filter(([, param]) => one(sp[param]) === '1')
    .map(([status]) => status);
  return explicit.length > 0 ? explicit : ['draft', 'cancelled', 'archived'];
}

function preservedManagedParams(hidden: ManagedVisibilityStatus[]): Record<string, string> {
  return Object.fromEntries(hidden.map((status) => [HIDE_PARAM[status], '1']));
}

function qs(f: TournamentFilters, page: number, preserved: Record<string, string>): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.city) p.set('city', f.city);
  if (page > 1) p.set('page', String(page));
  for (const [key, value] of Object.entries(preserved)) p.set(key, value);
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function viewerIsOrganizer(userId: string): Promise<boolean> {
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('status', 'active')
      .in('role', ['organizer', 'admin', 'super_admin']);
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

export default async function TournamentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const hiddenStatuses = parseHiddenStatuses(sp);
  const managedParams = preservedManagedParams(hiddenStatuses);
  const user = await getOptionalUser();
  const [managedTournaments, canCreate] = await Promise.all([
    user ? listManagedTournaments(user.id, filters, hiddenStatuses) : Promise.resolve([]),
    user ? viewerIsOrganizer(user.id) : Promise.resolve(false),
  ]);
  const { tournaments, total, page, pageCount } = await listTournaments(filters);

  return (
    <div className="flex flex-col gap-5">
      <div className="vp-in flex items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-foreground text-3xl font-extrabold tracking-tight">
            <span className="vp-gradient-text">Tournaments</span>
          </h1>
          <p className="text-foreground-muted text-sm">Discover events and divisions near you.</p>
        </div>
        <Link
          href={canCreate ? '/tournaments/new' : '/me?organizer=1'}
          className="vp-gradient vp-glow inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={16} aria-hidden />
          {canCreate ? 'Create tournament' : 'Become an organizer'}
          <LinkSpinner size={16} />
        </Link>
      </div>

      <InstantFilterForm
        basePath="/tournaments"
        initialQ={filters.q ?? ''}
        initialCity={filters.city ?? ''}
        placeholder="Search tournaments"
        preservedParams={managedParams}
      />

      {(canCreate || managedTournaments.length > 0) && (
        <section className="order-3 space-y-3" aria-labelledby="managed-tournaments-heading">
          <details className="group border-border bg-surface rounded-2xl border p-4">
            <summary
              id="managed-tournaments-heading"
              className="text-foreground cursor-pointer list-none text-lg font-semibold tracking-tight"
            >
              Your tournaments
              <span className="text-foreground-muted ml-2 text-xs font-normal">
                View managed events and filters
              </span>
            </summary>
            <div className="mt-4 space-y-3">
              <p className="text-foreground-muted text-xs">
                Events you own or co-organize. Draft, cancelled, and archived events stay hidden by
                default.
              </p>
              <ManagedTournamentFilters
                hiddenStatuses={hiddenStatuses}
                queryString={new URLSearchParams({
                  ...(filters.q ? { q: filters.q } : {}),
                  ...(filters.city ? { city: filters.city } : {}),
                  ...(filters.page && filters.page > 1 ? { page: String(filters.page) } : {}),
                  ...managedParams,
                }).toString()}
              />
              {managedTournaments.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {managedTournaments.map((t) => (
                    <TournamentCard key={`managed-${t.slug}`} tournament={t} />
                  ))}
                </div>
              ) : (
                <div className="border-border bg-surface text-foreground-muted rounded-2xl border p-6 text-center text-sm">
                  No managed tournaments match the current search and display choices.
                </div>
              )}
            </div>
          </details>
        </section>
      )}

      <section className="order-2 space-y-3" aria-labelledby="discover-tournaments-heading">
        <h2
          id="discover-tournaments-heading"
          className="text-foreground text-lg font-semibold tracking-tight"
        >
          Discover tournaments
        </h2>

        <p className="text-foreground-muted text-sm" aria-live="polite">
          {total === 0
            ? 'No public tournaments yet.'
            : `${total} tournament${total === 1 ? '' : 's'}`}
        </p>

        {tournaments.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((t) => (
              <TournamentCard key={t.slug} tournament={t} />
            ))}
          </div>
        ) : (
          <div className="border-border bg-surface text-foreground-muted rounded-2xl border p-8 text-center text-sm">
            No public tournaments match these filters.
          </div>
        )}

        {pageCount > 1 && (
          <nav className="flex items-center justify-between gap-2 pt-2" aria-label="Pagination">
            {page > 1 ? (
              <Link
                href={`/tournaments${qs(filters, page - 1, managedParams)}`}
                className="border-border bg-surface text-foreground hover:bg-surface-muted rounded-xl border px-4 py-2 text-sm font-medium"
              >
                Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="text-foreground-muted text-sm">
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <Link
                href={`/tournaments${qs(filters, page + 1, managedParams)}`}
                className="border-border bg-surface text-foreground hover:bg-surface-muted rounded-xl border px-4 py-2 text-sm font-medium"
              >
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
