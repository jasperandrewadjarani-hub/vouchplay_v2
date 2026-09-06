import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listTournaments, type TournamentFilters } from '@/lib/tournaments/queries';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { TournamentCard } from '@/components/tournaments/tournament-card';
import { LinkSpinner } from '@/components/ui/link-spinner';
import { InstantFilterForm } from '@/components/ui/instant-filter-form';

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
function qs(f: TournamentFilters, page: number): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.city) p.set('city', f.city);
  if (page > 1) p.set('page', String(page));
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
  const [{ tournaments, total, page, pageCount }, user] = await Promise.all([
    listTournaments(filters),
    getOptionalUser(),
  ]);
  const canCreate = user ? await viewerIsOrganizer(user.id) : false;

  return (
    <div className="space-y-5">
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
      />

      <p className="text-foreground-muted text-sm" aria-live="polite">
        {total === 0 ? 'No tournaments yet.' : `${total} tournament${total === 1 ? '' : 's'}`}
      </p>

      {tournaments.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((t) => (
            <TournamentCard key={t.slug} tournament={t} />
          ))}
        </div>
      ) : (
        <div className="border-border bg-surface text-foreground-muted rounded-2xl border p-8 text-center text-sm">
          No tournaments to show yet. Organizers can create one from here.
        </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-between gap-2 pt-2" aria-label="Pagination">
          {page > 1 ? (
            <Link
              href={`/tournaments${qs(filters, page - 1)}`}
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
              href={`/tournaments${qs(filters, page + 1)}`}
              className="border-border bg-surface text-foreground hover:bg-surface-muted rounded-xl border px-4 py-2 text-sm font-medium"
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
