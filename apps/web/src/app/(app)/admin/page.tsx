import type { Metadata } from 'next';
import Link from 'next/link';
import { Sliders, ScrollText, Users, BarChart3, ShieldAlert, ShieldCheck } from 'lucide-react';
import { requireAdminPage } from '@/lib/moderation/staff';
import { LinkSpinner } from '@/components/ui/link-spinner';

export const metadata: Metadata = { title: 'Admin Control Center' };

/** Admin Control Center home (handover §30). Admin + stepped-up (aal2) session only. */
export default async function AdminHome() {
  const actor = await requireAdminPage('/admin');

  const tiles = [
    {
      href: '/admin/settings',
      label: 'System settings',
      desc: 'Tune every operational value and platform flag.',
      icon: Sliders,
    },
    {
      href: '/admin/users',
      label: 'Users & roles',
      desc: 'Search, inspect, grant roles, account actions.',
      icon: Users,
    },
    {
      href: '/admin/analytics',
      label: 'Analytics',
      desc: 'Growth, vouching, tournaments, clubs, safety.',
      icon: BarChart3,
    },
    {
      href: '/admin/audit',
      label: 'Audit log',
      desc: 'Every sensitive action, immutable and searchable.',
      icon: ScrollText,
    },
  ];

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <header className="border-border bg-surface vp-hero relative overflow-hidden rounded-2xl border p-5">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-primary" size={22} aria-hidden />
          <h1 className="text-foreground text-xl font-semibold tracking-tight">
            Admin Control Center
          </h1>
        </div>
        <p className="text-foreground-muted mt-1 text-sm">
          Signed in as{' '}
          <span className="font-medium capitalize">{actor.role.replace('_', ' ')}</span> with a
          verified two-factor session. Every change here is written to the immutable audit log.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className="border-border bg-surface vp-card flex flex-col gap-2 rounded-2xl border p-4"
            >
              <div className="flex items-center gap-2">
                <Icon className="text-primary" size={20} aria-hidden />
                <LinkSpinner size={16} />
              </div>
              <span className="text-foreground text-base font-semibold">{t.label}</span>
              <span className="text-foreground-muted text-xs">{t.desc}</span>
            </Link>
          );
        })}
      </div>

      <Link
        href="/staff"
        className="border-border bg-surface hover:border-primary flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors"
      >
        <ShieldAlert className="text-primary" size={18} aria-hidden />
        Open the moderation queue
        <LinkSpinner size={16} />
      </Link>
    </section>
  );
}
