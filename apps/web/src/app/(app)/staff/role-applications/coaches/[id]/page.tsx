import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/moderation/staff';
import { getCoachReviewDetail } from '@/lib/coach/queries';
import { CoachReviewPanel } from '@/components/roles/coach-review-panel';
import { LinkSpinner } from '@/components/ui/link-spinner';

export const metadata: Metadata = { title: 'Review Coach application' };

export default async function CoachReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage('/staff/role-applications/coaches');
  const { id } = await params;
  const detail = await getCoachReviewDetail(id);
  if (!detail) notFound();
  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/staff/role-applications/coaches"
        className="text-foreground-muted hover:text-foreground text-sm"
      >
        ← Coach applications <LinkSpinner size={14} />
      </Link>
      <CoachReviewPanel detail={detail} />
    </section>
  );
}
