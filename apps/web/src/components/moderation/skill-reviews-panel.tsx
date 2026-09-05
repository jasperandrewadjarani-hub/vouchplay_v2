'use client';

import { SKILL_REVIEW_STATUS_LABELS, type SkillReviewStatus } from '@vouchplay/config';
import { resolveSkillReview } from '@/lib/actions/moderation';
import { ResolveForm } from './resolve-form';
import { AccountActionPanel } from './account-action-panel';
import { VouchModerationPanel } from './vouch-moderation-panel';
import { QueueCard, MiniLink, Evidence, type MiniProfile } from './queue-card';

interface SkillReviewItem {
  row: {
    id: string;
    tournament_id: string | null;
    reason: string;
    evidence: Record<string, unknown>;
    status: string;
    created_at: string;
  };
  requester: MiniProfile | null;
  target: MiniProfile | null;
}

const STATUSES = [
  { value: 'under_review', label: 'Mark under review' },
  { value: 'resolved_no_change', label: 'Resolve — no change' },
  { value: 'resolved_admin_note', label: 'Resolve — admin note' },
  { value: 'resolved_vouch_action', label: 'Resolve — vouch action' },
  { value: 'closed', label: 'Close' },
];
const CLOSING = ['resolved_no_change', 'resolved_admin_note', 'resolved_vouch_action', 'closed'];

export function SkillReviewsPanel({ items }: { items: SkillReviewItem[] }) {
  if (items.length === 0)
    return (
      <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-6 text-center text-sm">
        No open skill reviews.
      </p>
    );
  return (
    <div className="space-y-3">
      {items.map(({ row, requester, target }) => (
        <QueueCard
          key={row.id}
          title="Skill review"
          status={SKILL_REVIEW_STATUS_LABELS[row.status as SkillReviewStatus] ?? row.status}
          createdAt={row.created_at}
        >
          <p className="text-foreground-muted text-xs">
            From <MiniLink p={requester} /> · about <MiniLink p={target} />
            {row.tournament_id && <span> · tournament context</span>}
          </p>
          <p className="text-foreground mt-1 text-sm">{row.reason}</p>
          <Evidence evidence={row.evidence} />

          <ResolveForm
            statuses={STATUSES}
            requireReasonFor={CLOSING}
            onResolve={(status, reason) =>
              resolveSkillReview(row.id, status as SkillReviewStatus, reason)
            }
          />

          {target && (
            <>
              <VouchModerationPanel targetId={target.id} targetName={target.name} />
              <AccountActionPanel userId={target.id} userName={target.name} />
            </>
          )}
        </QueueCard>
      ))}
    </div>
  );
}
