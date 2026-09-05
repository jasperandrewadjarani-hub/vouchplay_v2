import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/page-placeholder';

export const metadata: Metadata = { title: 'Tournaments' };

export default function TournamentsPage() {
  return (
    <PagePlaceholder title="Tournaments" phase="Phase 6–10 · Tournaments">
      Discover tournaments, express interest, find partners, form teams, register, and (for
      organizers) run the dashboard with eligibility review, payments, waitlist, and exports
      (handover §17–§26).
    </PagePlaceholder>
  );
}
