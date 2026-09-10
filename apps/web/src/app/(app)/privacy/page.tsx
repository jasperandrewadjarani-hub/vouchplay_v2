import type { Metadata } from 'next';
import { PrivacyContent } from '@/components/legal/privacy-content';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <div className="py-4">
      <PrivacyContent />
    </div>
  );
}
