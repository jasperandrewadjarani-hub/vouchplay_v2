'use client';

import { useState, useTransition } from 'react';
import type { IdentityQueueItem } from '@/lib/moderation/queries';
import { getIdentityDocSignedUrl, reviewIdentityVerification } from '@/lib/actions/identity';
import { QueueCard, MiniLink } from './queue-card';

/**
 * Staff → Moderation → "Identity" (master_plan §2AG Phase C): the identity-verification review
 * queue. A calm, staff-only surface - approve/reject with an audited reason, and a "View ID" button
 * that mints a 5-minute signed URL on demand rather than ever loading the document into this page.
 * Approving is the ONLY thing that ever flips `identity_verifications.status` to `approved`, which
 * both the "ID Verified" badge and the STS_V2 trust anchor key off directly - nothing here touches
 * that logic beyond making the one status write.
 */

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  national_id: 'National ID',
  passport: 'Passport',
  drivers_license: "Driver's license",
  other: 'Other government ID',
};

function IdentityActions({ item }: { item: IdentityQueueItem }) {
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const input =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2';
  const primaryBtn =
    'vp-gradient min-h-11 inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50';
  const secondaryBtn =
    'border-border text-foreground min-h-11 inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50';

  function viewDocument() {
    setMsg(null);
    start(async () => {
      const res = await getIdentityDocSignedUrl(item.id);
      if (res.url) window.open(res.url, '_blank', 'noopener');
      else setMsg({ ok: false, text: res.error ?? 'Could not open the document.' });
    });
  }

  function decide(decision: 'approve' | 'reject') {
    setMsg(null);
    start(async () => {
      const res = await reviewIdentityVerification(item.id, decision, reason);
      setMsg({ ok: !!res.ok, text: res.ok ? (res.message ?? 'Done.') : (res.error ?? 'Failed.') });
      if (res.ok) setReason('');
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {!item.subject.hasAvatar && (
        <p className="text-warning text-xs font-medium">
          No profile photo yet - both a photo and an ID are required before approving.
        </p>
      )}
      <button type="button" onClick={viewDocument} disabled={pending} className={secondaryBtn}>
        View ID (opens for 5 min)
      </button>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Reason (required to reject)"
        aria-label="Reason for this decision"
        className={input}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => decide('approve')}
          disabled={pending}
          className={primaryBtn}
        >
          {pending ? 'Saving…' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => decide('reject')}
          disabled={pending || !reason.trim()}
          className={secondaryBtn}
        >
          Reject
        </button>
      </div>
      {msg && <p className={`text-xs ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
    </div>
  );
}

export function IdentityPanel({ items }: { items: IdentityQueueItem[] }) {
  if (items.length === 0)
    return (
      <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-6 text-center text-sm">
        No identity verifications waiting right now.
      </p>
    );

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <QueueCard
          key={item.id}
          title={DOCUMENT_TYPE_LABELS[item.documentType ?? ''] ?? 'Identity verification'}
          status={item.status}
          createdAt={item.submittedAt}
        >
          <p className="text-foreground-muted mt-1 text-xs">
            <MiniLink p={{ id: item.userId, name: item.subject.name, slug: item.subject.slug }} />
          </p>
          <IdentityActions item={item} />
        </QueueCard>
      ))}
    </div>
  );
}
