import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { SUPPORT_TICKET_CATEGORY_LABELS, type SupportTicketCategory } from '@vouchplay/config';
import { SupportForm } from '@/components/safety/support-form';

export const metadata: Metadata = { title: 'Support & appeals' };

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  pending_user: 'Awaiting your reply',
  pending_staff: 'With our team',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default async function SupportPage() {
  const user = await requireUser('/me/support');

  // Own tickets are RLS-readable via the user session.
  const supabase = await createClient();
  const { data } = await supabase
    .from('support_tickets')
    .select('id, category, subject, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  const tickets = (data ?? []) as Array<{
    id: string;
    category: string;
    subject: string;
    status: string;
    created_at: string;
  }>;

  void user;

  return (
    <section className="mx-auto max-w-md space-y-6">
      <div>
        <Link href="/me" className="text-foreground-muted hover:text-foreground text-sm">
          ← Me
        </Link>
        <h1 className="text-foreground mt-2 text-xl font-semibold tracking-tight">
          Support &amp; appeals
        </h1>
        <p className="text-foreground-muted mt-1 text-sm">
          Contact our team or appeal a moderation action. We&apos;ll follow up by email.
        </p>
      </div>

      <div className="border-border bg-surface rounded-2xl border p-5">
        <SupportForm />
      </div>

      <div>
        <h2 className="text-foreground mb-2 text-base font-semibold">Your requests</h2>
        {tickets.length === 0 ? (
          <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-5 text-sm">
            You haven&apos;t submitted any requests yet.
          </p>
        ) : (
          <ul className="border-border bg-surface divide-border divide-y rounded-2xl border">
            {tickets.map((t) => (
              <li key={t.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground text-sm font-medium">{t.subject}</span>
                  <span className="bg-surface-muted text-foreground-muted rounded-full px-2 py-0.5 text-xs">
                    {STATUS_LABELS[t.status] ?? t.status}
                  </span>
                </div>
                <p className="text-foreground-muted mt-0.5 text-xs">
                  {SUPPORT_TICKET_CATEGORY_LABELS[t.category as SupportTicketCategory] ??
                    t.category}{' '}
                  ·{' '}
                  {new Date(t.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
