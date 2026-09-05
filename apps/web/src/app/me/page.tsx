import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/page-placeholder';

export const metadata: Metadata = { title: 'Me' };

export default function MePage() {
  return (
    <PagePlaceholder title="Me" phase="Phase 1–2 · Account">
      Profile, vouch history &amp; requests, my clubs &amp; tournaments, partner and sponsorship
      offers, coach/organizer applications, settings, privacy, notification preferences, help, and
      account deletion (handover §5.3).
    </PagePlaceholder>
  );
}
