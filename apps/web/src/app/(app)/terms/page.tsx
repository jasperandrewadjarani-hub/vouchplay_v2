import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/page-placeholder';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <PagePlaceholder title="Terms of Service" phase="Phase 14 · Legal">
      The full Terms of Service will be published before public beta (handover §46). Placeholder
      page so links resolve during development.
    </PagePlaceholder>
  );
}
