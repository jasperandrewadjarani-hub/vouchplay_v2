'use client';

import Link from 'next/link';
import { verifyClub, setClubModerationStatus } from '@/lib/actions/moderation';
import { ResolveForm } from './resolve-form';
import { QueueCard } from './queue-card';

interface ClubItem {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  verificationStatus: string;
  activityStatus: string;
  createdAt: string;
  ownerName: string | null;
}

const VERIFY_STATUSES = [
  { value: 'verified', label: 'Verify' },
  { value: 'unverified', label: 'Mark unverified' },
  { value: 'rejected', label: 'Reject' },
];

export function ClubsPanel({ items }: { items: ClubItem[] }) {
  if (items.length === 0)
    return (
      <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-6 text-center text-sm">
        No clubs awaiting review.
      </p>
    );
  return (
    <div className="space-y-3">
      {items.map((c) => (
        <QueueCard
          key={c.id}
          title={c.name}
          status={`${c.verificationStatus}${c.activityStatus === 'suspended' ? ' · suspended' : ''}`}
          createdAt={c.createdAt}
        >
          <p className="text-foreground-muted text-xs">
            {c.city ? `${c.city} · ` : ''}owner {c.ownerName ?? 'unknown'} ·{' '}
            <Link href={`/clubs/${c.slug}`} className="text-primary">
              view club
            </Link>
          </p>

          <ResolveForm
            statuses={VERIFY_STATUSES}
            requireReasonFor={['rejected']}
            onResolve={(status, reason) =>
              verifyClub(c.id, status as 'verified' | 'unverified' | 'rejected', reason)
            }
          />

          <ResolveForm
            statuses={
              c.activityStatus === 'suspended'
                ? [{ value: 'active', label: 'Reinstate club' }]
                : [{ value: 'suspended', label: 'Suspend club' }]
            }
            requireReasonFor={['suspended']}
            onResolve={(status, reason) =>
              setClubModerationStatus(c.id, status as 'active' | 'suspended', reason)
            }
          />
        </QueueCard>
      ))}
    </div>
  );
}
