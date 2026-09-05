import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/page-placeholder';

export const metadata: Metadata = { title: 'Privacy Notice' };

export default function PrivacyPage() {
  return (
    <PagePlaceholder title="Privacy Notice" phase="Phase 14 · Legal">
      The full Privacy Notice (Philippine Data Privacy Act aligned) will be published before public
      beta (handover §46). Placeholder page so links resolve during development.
    </PagePlaceholder>
  );
}
