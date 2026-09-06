import type { Metadata } from 'next';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { requireAdminPage } from '@/lib/moderation/staff';
import { getAnalyticsSummary } from '@/lib/admin/analytics';

export const metadata: Metadata = { title: 'Analytics' };

const pct = (r: number) => `${Math.round(r * 100)}%`;
const num = (n: number) => n.toLocaleString();
const peso = (cents: number) =>
  `₱${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/** Admin analytics dashboard (handover §31). Read-only aggregates + the North Star. */
export default async function AdminAnalyticsPage() {
  await requireAdminPage('/admin/analytics');
  const s = await getAnalyticsSummary();

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/admin" className="text-foreground-muted hover:text-foreground text-sm">
          ← Admin
        </Link>
        <h1 className="text-foreground mt-2 text-xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-foreground-muted mt-1 text-sm">Live platform metrics (§31).</p>
      </div>

      {/* North Star */}
      <div className="border-primary/40 bg-primary/5 vp-hero relative overflow-hidden rounded-2xl border p-5">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        <div className="flex items-center gap-2">
          <Star className="text-primary" size={18} aria-hidden />
          <span className="vp-label text-foreground-muted">North Star</span>
        </div>
        <div className="text-foreground mt-1 text-3xl font-bold">{num(s.northStar)}</div>
        <p className="text-foreground-muted text-xs">
          Skill-Verified active player profiles · Secondary: {num(s.secondary)} confirmed teams
        </p>
      </div>

      <Group title="Growth">
        <Tile label="Total users" value={num(s.growth.totalUsers)} />
        <Tile
          label="Onboarded"
          value={num(s.growth.onboardedUsers)}
          sub={pct(s.growth.onboardedRate)}
        />
        <Tile label="New · 7d" value={num(s.growth.newUsers7d)} />
        <Tile label="New · 30d" value={num(s.growth.newUsers30d)} />
        <Tile label="Identity-Verified" value={num(s.growth.identityVerifiedUsers)} />
        <Tile label="Skill-Verified" value={num(s.growth.skillVerifiedProfiles)} />
      </Group>

      <Group title="Vouching">
        <Tile label="Active vouches" value={num(s.vouching.activeVouches)} />
        <Tile label="Unique vouchers" value={num(s.vouching.uniqueVouchers)} />
        <Tile label="Avg / rated player" value={s.vouching.avgVouchesPerRatedPlayer.toFixed(1)} />
        <Tile label="Requests" value={num(s.vouching.vouchRequests)} />
        <Tile label="Coach vouches" value={num(s.vouching.coachVouches)} />
        <Tile label="Vouches · 30d" value={num(s.vouching.vouches30d)} />
      </Group>

      <Group title="Tournaments">
        <Tile label="Created" value={num(s.tournaments.tournamentsCreated)} />
        <Tile
          label="Published"
          value={num(s.tournaments.tournamentsPublished)}
          sub={pct(s.tournaments.publishRate)}
        />
        <Tile label="Interest → reg" value={pct(s.tournaments.interestToRegistration)} />
        <Tile label="Confirmed teams" value={num(s.tournaments.confirmedTeams)} />
        <Tile label="Waitlisted" value={num(s.tournaments.waitlisted)} />
        <Tile label="Withdrawn" value={num(s.tournaments.withdrawn)} />
        <Tile label="Eligibility review" value={num(s.tournaments.eligibilityReview)} />
        <Tile
          label="Skill mismatch"
          value={num(s.tournaments.eligibilityMismatch)}
          sub={pct(s.tournaments.mismatchRate)}
        />
        <Tile label="Revenue collected" value={peso(s.tournaments.revenueCents)} />
      </Group>

      <Group title="Clubs">
        <Tile label="Active clubs" value={num(s.clubs.activeClubs)} />
        <Tile label="Verified" value={num(s.clubs.verifiedClubs)} sub={pct(s.clubs.verifiedRate)} />
        <Tile label="Avg members / club" value={s.clubs.avgMembersPerClub.toFixed(1)} />
      </Group>

      <Group title="Safety">
        <Tile label="Open reports" value={num(s.safety.openReports)} />
        <Tile label="Open skill reviews" value={num(s.safety.openSkillReviews)} />
        <Tile label="Open fraud flags" value={num(s.safety.openFraudFlags)} />
        <Tile label="Account actions" value={num(s.safety.accountActions)} />
      </Group>
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-foreground mb-2 text-sm font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-border bg-surface rounded-2xl border p-3">
      <div className="text-foreground text-xl font-semibold">
        {value}
        {sub && <span className="text-foreground-muted ml-1 text-xs font-normal">{sub}</span>}
      </div>
      <div className="text-foreground-muted text-xs">{label}</div>
    </div>
  );
}
