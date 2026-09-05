import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert, Flag, ClipboardCheck, Search, LifeBuoy, Shield } from 'lucide-react';
import { requireStaffPage } from '@/lib/moderation/staff';
import { getModerationCounts } from '@/lib/moderation/queries';

export const metadata: Metadata = { title: 'Staff' };

export default async function StaffHome() {
  const actor = await requireStaffPage('/staff');
  const counts = await getModerationCounts();

  const tiles = [
    { href: '/staff/moderation?tab=reports', label: 'Reports', icon: Flag, n: counts.reports },
    {
      href: '/staff/moderation?tab=skill-reviews',
      label: 'Skill reviews',
      icon: ClipboardCheck,
      n: counts.skillReviews,
    },
    {
      href: '/staff/moderation?tab=fraud',
      label: 'Fraud flags',
      icon: Search,
      n: counts.fraudFlags,
    },
    {
      href: '/staff/moderation?tab=support',
      label: 'Support',
      icon: LifeBuoy,
      n: counts.supportTickets,
    },
    { href: '/staff/moderation?tab=clubs', label: 'Clubs', icon: Shield, n: counts.clubs },
  ];

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <header className="border-border bg-surface vp-hero relative overflow-hidden rounded-2xl border p-5">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-primary" size={22} aria-hidden />
          <h1 className="text-foreground text-xl font-semibold tracking-tight">Staff moderation</h1>
        </div>
        <p className="text-foreground-muted mt-1 text-sm">
          Signed in as{' '}
          <span className="font-medium capitalize">{actor.role.replace('_', ' ')}</span> with a
          verified two-factor session. Every action you take here is written to the immutable audit
          log.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className="border-border bg-surface vp-card flex flex-col gap-2 rounded-2xl border p-4"
            >
              <Icon className="text-primary" size={20} aria-hidden />
              <span className="text-foreground text-2xl font-semibold">{t.n}</span>
              <span className="text-foreground-muted text-xs">{t.label} open</span>
            </Link>
          );
        })}
      </div>

      <Link href="/staff/moderation" className="text-primary text-sm font-medium">
        Open the moderation queue →
      </Link>
    </section>
  );
}
