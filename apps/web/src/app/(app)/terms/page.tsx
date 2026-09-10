import type { Metadata } from 'next';
import { TermsContent } from '@/components/legal/terms-content';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <div className="py-4">
      <TermsContent />
    </div>
  );
}
