import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/page-placeholder';

export const metadata: Metadata = { title: 'Players' };

export default function PlayersPage() {
  return (
    <PagePlaceholder title="Players" phase="Phase 2 · Directory">
      Public player directory with search &amp; filters and concise player cards (avatar, name,
      community skill, Skill Verified, STS, clubs, status badges). Non-users can browse; protected
      actions gate to signup (handover §8).
    </PagePlaceholder>
  );
}
