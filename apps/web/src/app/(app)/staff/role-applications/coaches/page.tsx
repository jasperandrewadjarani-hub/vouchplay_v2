import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/moderation/staff';
import { listCoachApplications } from '@/lib/coach/queries';
import { loadSettingNumber } from '@/lib/settings';
import { LinkSpinner } from '@/components/ui/link-spinner';

export const metadata: Metadata = { title: 'Coach applications' };

export default async function CoachApplicationsPage() {
  await requireAdminPage('/staff/role-applications/coaches');
  const slaDays = await loadSettingNumber('coach_application_review_sla_days', 7);
  const items = await listCoachApplications(slaDays);
  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <Link href="/staff" className="text-foreground-muted hover:text-foreground text-sm">
        ← Staff <LinkSpinner size={14} />
      </Link>
      <header className="border-border bg-surface vp-hero relative overflow-hidden rounded-2xl border p-5">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        <p className="text-primary text-xs font-semibold tracking-widest uppercase">
          Role applications
        </p>
        <h1 className="text-foreground mt-1 text-xl font-semibold">Coaches</h1>
        <p className="text-foreground-muted mt-1 text-sm">
          Admin and Super Admin only. Private evidence opens through short-lived links after AAL2
          authorization.
        </p>
      </header>
      {items.length === 0 ? (
        <p className="border-border bg-surface text-foreground-muted rounded-2xl border p-6 text-center text-sm">
          No open Coach applications.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/staff/role-applications/coaches/${item.id}`}
              className="border-border bg-surface vp-card flex items-center gap-3 rounded-2xl border p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-foreground font-semibold">{item.applicantName}</h2>
                  <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs capitalize">
                    {item.status.replaceAll('_', ' ')}
                  </span>
                  {item.overdue && (
                    <span className="bg-warning/15 text-warning rounded-full px-2 py-0.5 text-xs">
                      Past {slaDays}-day SLA
                    </span>
                  )}
                </div>
                <p className="text-foreground-muted mt-1 text-xs">
                  {item.city ?? 'City not supplied'} · {item.evidenceCount} evidence file(s) ·
                  submitted {new Date(item.submittedAt).toLocaleDateString()}
                </p>
              </div>
              <span className="text-primary flex items-center gap-2 text-sm font-semibold">
                <LinkSpinner />
                Review
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
