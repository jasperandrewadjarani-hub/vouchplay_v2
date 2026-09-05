'use client';

import { updateSupportTicket } from '@/lib/actions/moderation';
import type { SupportTicketStatus } from '@vouchplay/db';
import { ResolveForm } from './resolve-form';
import { QueueCard, MiniLink, type MiniProfile } from './queue-card';

interface SupportTicketItem {
  row: {
    id: string;
    category: string;
    subject: string;
    body: string;
    status: string;
    created_at: string;
  };
  user: MiniProfile | null;
}

const STATUSES = [
  { value: 'pending_staff', label: 'With our team' },
  { value: 'pending_user', label: 'Awaiting user' },
  { value: 'resolved', label: 'Resolve' },
  { value: 'closed', label: 'Close' },
];

export function SupportPanel({ items }: { items: SupportTicketItem[] }) {
  if (items.length === 0)
    return (
      <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-6 text-center text-sm">
        No open support tickets.
      </p>
    );
  return (
    <div className="space-y-3">
      {items.map(({ row, user }) => (
        <QueueCard key={row.id} title={row.subject} status={row.status} createdAt={row.created_at}>
          <p className="text-foreground-muted text-xs">
            {row.category} · from <MiniLink p={user} />
          </p>
          <p className="text-foreground mt-1 text-sm whitespace-pre-wrap">{row.body}</p>
          <ResolveForm
            statuses={STATUSES}
            onResolve={(status) => updateSupportTicket(row.id, status as SupportTicketStatus)}
          />
        </QueueCard>
      ))}
    </div>
  );
}
