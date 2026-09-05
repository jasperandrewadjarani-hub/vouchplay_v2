import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffPage } from '@/lib/moderation/staff';
import {
  listReports,
  listSkillReviews,
  listFraudFlags,
  listSupportTickets,
  getModerationCounts,
} from '@/lib/moderation/queries';
import { ReportsPanel } from '@/components/moderation/reports-panel';
import { SkillReviewsPanel } from '@/components/moderation/skill-reviews-panel';
import { FraudFlagsPanel } from '@/components/moderation/fraud-flags-panel';
import { SupportPanel } from '@/components/moderation/support-panel';

export const metadata: Metadata = { title: 'Moderation queue' };

type Tab = 'reports' | 'skill-reviews' | 'fraud' | 'support';
const TABS: { key: Tab; label: string }[] = [
  { key: 'reports', label: 'Reports' },
  { key: 'skill-reviews', label: 'Skill reviews' },
  { key: 'fraud', label: 'Fraud flags' },
  { key: 'support', label: 'Support' },
];

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function ModerationQueue({ searchParams }: Props) {
  await requireStaffPage('/staff/moderation');
  const { tab: rawTab } = await searchParams;
  const tab: Tab = (TABS.find((t) => t.key === rawTab)?.key ?? 'reports') as Tab;
  const counts = await getModerationCounts();
  const countFor: Record<Tab, number> = {
    reports: counts.reports,
    'skill-reviews': counts.skillReviews,
    fraud: counts.fraudFlags,
    support: counts.supportTickets,
  };

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/staff" className="text-foreground-muted hover:text-foreground text-sm">
          ← Staff
        </Link>
        <h1 className="text-foreground mt-2 text-xl font-semibold tracking-tight">
          Moderation queue
        </h1>
      </div>

      <nav className="border-border flex gap-1 overflow-x-auto border-b" aria-label="Queue tabs">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/staff/moderation?tab=${t.key}`}
              aria-current={active ? 'page' : undefined}
              className={`relative px-3 py-2 text-sm font-medium whitespace-nowrap ${
                active ? 'text-primary' : 'text-foreground-muted hover:text-foreground'
              }`}
            >
              {t.label}
              <span className="text-foreground-muted ml-1 text-xs">({countFor[t.key]})</span>
              {active && (
                <span
                  className="vp-gradient absolute inset-x-2 bottom-0 h-0.5 rounded-full"
                  aria-hidden
                />
              )}
            </Link>
          );
        })}
      </nav>

      {tab === 'reports' && <ReportsPanel items={await listReports()} />}
      {tab === 'skill-reviews' && <SkillReviewsPanel items={await listSkillReviews()} />}
      {tab === 'fraud' && <FraudFlagsPanel items={await listFraudFlags()} />}
      {tab === 'support' && <SupportPanel items={await listSupportTickets()} />}
    </section>
  );
}
