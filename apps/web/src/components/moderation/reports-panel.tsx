'use client';

import {
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  type ReportReasonCode,
  type ReportStatus,
} from '@vouchplay/config';
import { resolveReport } from '@/lib/actions/moderation';
import { ResolveForm } from './resolve-form';
import { AccountActionPanel } from './account-action-panel';
import { VouchModerationPanel } from './vouch-moderation-panel';
import { CommentActionPanel } from './comment-action-panel';
import { QueueCard, MiniLink, Evidence, type MiniProfile } from './queue-card';

interface ReportItem {
  row: {
    id: string;
    target_type: string;
    target_id: string;
    reason_code: string;
    details: string | null;
    evidence: Record<string, unknown>;
    status: string;
    resolution: string | null;
    created_at: string;
  };
  reporter: MiniProfile | null;
  targetPlayer: MiniProfile | null;
}

const REPORT_STATUSES = [
  { value: 'reviewing', label: 'Mark reviewing' },
  { value: 'resolved', label: 'Resolve' },
  { value: 'dismissed', label: 'Dismiss' },
];

export function ReportsPanel({ items }: { items: ReportItem[] }) {
  if (items.length === 0) return <Empty label="No open reports." />;
  return (
    <div className="space-y-3">
      {items.map(({ row, reporter, targetPlayer }) => (
        <QueueCard
          key={row.id}
          title={`${REPORT_REASON_LABELS[row.reason_code as ReportReasonCode] ?? row.reason_code}`}
          status={REPORT_STATUS_LABELS[row.status as ReportStatus] ?? row.status}
          createdAt={row.created_at}
        >
          <p className="text-foreground-muted text-xs">
            Reported by <MiniLink p={reporter} /> ·{' '}
            {row.target_type === 'player' ? (
              <>
                target player <MiniLink p={targetPlayer} />
              </>
            ) : (
              <>
                target {row.target_type}{' '}
                <code className="text-[11px]">{row.target_id.slice(0, 8)}</code>
              </>
            )}
          </p>
          {row.details && <p className="text-foreground mt-1 text-sm">{row.details}</p>}
          <Evidence evidence={row.evidence} />

          <ResolveForm
            statuses={REPORT_STATUSES}
            requireReasonFor={['resolved', 'dismissed']}
            onResolve={(status, reason) => resolveReport(row.id, status as ReportStatus, reason)}
          />

          {row.target_type === 'player' && targetPlayer && (
            <>
              <AccountActionPanel userId={row.target_id} userName={targetPlayer.name} />
              <VouchModerationPanel targetId={row.target_id} targetName={targetPlayer.name} />
            </>
          )}
          {row.target_type === 'comment' && <CommentActionPanel commentId={row.target_id} />}
        </QueueCard>
      ))}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-6 text-center text-sm">
      {label}
    </p>
  );
}
