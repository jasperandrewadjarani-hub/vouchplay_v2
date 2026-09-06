'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { approveRoleApplication, rejectRoleApplication } from '@/lib/actions/roles';
import { QueueCard } from './queue-card';

interface RoleAppItem {
  id: string;
  role: string;
  motivation: string | null;
  createdAt: string;
  applicantName: string | null;
  applicantSlug: string | null;
}

/** Admin role-application review (handover §30.2, §4.3 - approve grants the global role). */
export function RoleAppsPanel({ items }: { items: RoleAppItem[] }) {
  if (items.length === 0)
    return (
      <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-6 text-center text-sm">
        No pending role applications.
      </p>
    );
  return (
    <div className="space-y-3">
      {items.map((a) => (
        <RoleAppCard key={a.id} item={a} />
      ))}
    </div>
  );
}

function RoleAppCard({ item }: { item: RoleAppItem }) {
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function decide(approve: boolean) {
    setMsg(null);
    start(async () => {
      const res = approve
        ? await approveRoleApplication(item.id, reason)
        : await rejectRoleApplication(item.id, reason);
      setMsg({ ok: !!res.ok, text: res.ok ? (res.message ?? 'Done.') : (res.error ?? 'Failed.') });
    });
  }

  return (
    <QueueCard title={`Organizer application`} status={item.role} createdAt={item.createdAt}>
      <p className="text-foreground-muted text-xs">
        From{' '}
        {item.applicantSlug ? (
          <Link href={`/players/${item.applicantSlug}`} className="text-primary font-medium">
            {item.applicantName ?? 'applicant'}
          </Link>
        ) : (
          <span className="text-foreground font-medium">{item.applicantName ?? 'applicant'}</span>
        )}
      </p>
      {item.motivation && <p className="text-foreground mt-1 text-sm">{item.motivation}</p>}

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Decision note (optional, audited)"
        className="border-border bg-background mt-3 w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => decide(true)}
          className="vp-gradient rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide(false)}
          className="border-border text-foreground rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {msg && (
        <p className={`mt-1 text-xs ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>
      )}
    </QueueCard>
  );
}
