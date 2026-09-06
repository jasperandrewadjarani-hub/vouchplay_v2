'use client';

import { FRAUD_FLAG_STATUS_LABELS, type FraudFlagStatus } from '@vouchplay/config';
import { reviewFraudFlag } from '@/lib/actions/moderation';
import { ResolveForm } from './resolve-form';
import { AccountActionPanel } from './account-action-panel';
import { VouchModerationPanel } from './vouch-moderation-panel';
import { QueueCard, MiniLink, Evidence, type MiniProfile } from './queue-card';

interface FraudFlagItem {
  row: {
    id: string;
    subject_type: string;
    subject_id: string;
    flag_type: string;
    severity: string | null;
    evidence: Record<string, unknown>;
    status: string;
    created_at: string;
  };
  subject: MiniProfile | null;
}

const STATUSES = [
  { value: 'reviewing', label: 'Mark reviewing' },
  { value: 'cleared', label: 'Clear (no action)' },
  { value: 'action_taken', label: 'Action taken' },
];

export function FraudFlagsPanel({ items }: { items: FraudFlagItem[] }) {
  if (items.length === 0)
    return (
      <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-6 text-center text-sm">
        No open fraud flags. Detectors run later - staff can raise a flag manually from a profile.
      </p>
    );
  return (
    <div className="space-y-3">
      {items.map(({ row, subject }) => (
        <QueueCard
          key={row.id}
          title={`${row.flag_type}${row.severity ? ` · ${row.severity}` : ''}`}
          status={FRAUD_FLAG_STATUS_LABELS[row.status as FraudFlagStatus] ?? row.status}
          createdAt={row.created_at}
        >
          <p className="text-foreground-muted text-xs">
            Subject: {row.subject_type} ·{' '}
            {subject ? (
              <MiniLink p={subject} />
            ) : (
              <code className="text-[11px]">{row.subject_id.slice(0, 8)}</code>
            )}
          </p>
          <Evidence evidence={row.evidence} />

          <ResolveForm
            statuses={STATUSES}
            requireReasonFor={['cleared', 'action_taken']}
            onResolve={(status, reason) =>
              reviewFraudFlag(row.id, status as FraudFlagStatus, reason)
            }
          />

          {(row.subject_type === 'user' || row.subject_type === 'coach') && subject && (
            <>
              <AccountActionPanel userId={subject.id} userName={subject.name} />
              <VouchModerationPanel targetId={subject.id} targetName={subject.name} />
            </>
          )}
        </QueueCard>
      ))}
    </div>
  );
}
