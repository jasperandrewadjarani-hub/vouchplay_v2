import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/page-placeholder';

export const metadata: Metadata = { title: 'Clubs' };

export default function ClubsPage() {
  return (
    <PagePlaceholder title="Clubs" phase="Phase 5 · Clubs">
      Create and discover clubs, request to join, manage membership and ownership, recruitment and
      sponsorship offers, and admin verification (handover §15–§16).
    </PagePlaceholder>
  );
}
