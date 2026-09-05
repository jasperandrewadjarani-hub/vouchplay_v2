import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listClubs, type ClubFilters } from '@/lib/clubs/queries';
import { getOptionalUser } from '@/lib/auth';
import { ClubCard } from '@/components/clubs/club-card';

export const metadata: Metadata = {
  title: 'Clubs',
  description: 'Discover pickleball clubs on VouchPlay — find your community, join, and represent.',
};

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function parseFilters(sp: SP): ClubFilters {
  const pageNum = Number(one(sp.page));
  return {
    q: one(sp.q),
    city: one(sp.city),
    verifiedOnly: one(sp.verified) === '1',
    page: Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1,
  };
}

function qs(f: ClubFilters, page: number): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.city) p.set('city', f.city);
  if (f.verifiedOnly) p.set('verified', '1');
  if (page > 1) p.set('page', String(page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export default async function ClubsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const [{ clubs, total, page, pageCount }, user] = await Promise.all([
    listClubs(filters),
    getOptionalUser(),
  ]);

  const inputCls =
    'rounded-xl border border-border bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <div className="space-y-5">
      <div className="vp-in flex items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-foreground text-3xl font-extrabold tracking-tight">
            <span className="vp-gradient-text">Clubs</span>
          </h1>
          <p className="text-foreground-muted text-sm">Find your community and represent it.</p>
        </div>
        <Link
          href={user ? '/clubs/new' : '/signup?next=/clubs/new'}
          className="vp-gradient vp-glow inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={16} aria-hidden />
          Create club
        </Link>
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={filters.q ?? ''}
          placeholder="Search clubs…"
          className={`${inputCls} min-w-40 flex-1`}
        />
        <input
          name="city"
          defaultValue={filters.city ?? ''}
          placeholder="City"
          className={`${inputCls} w-32`}
        />
        <label className="border-border bg-surface text-foreground flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
          <input type="checkbox" name="verified" value="1" defaultChecked={filters.verifiedOnly} />
          Verified only
        </label>
        <button
          type="submit"
          className="border-border bg-surface text-foreground hover:bg-surface-muted rounded-xl border px-4 py-2 text-sm font-medium"
        >
          Search
        </button>
      </form>

      <p className="text-foreground-muted text-sm" aria-live="polite">
        {total === 0 ? 'No clubs yet.' : `${total} club${total === 1 ? '' : 's'}`}
      </p>

      {clubs.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((club) => (
            <ClubCard key={club.slug} club={club} />
          ))}
        </div>
      ) : (
        <div className="border-border bg-surface text-foreground-muted rounded-2xl border p-8 text-center text-sm">
          Be the first to create a club in your area.
        </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-between gap-2 pt-2" aria-label="Pagination">
          {page > 1 ? (
            <Link
              href={`/clubs${qs(filters, page - 1)}`}
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
              href={`/clubs${qs(filters, page + 1)}`}
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
