'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Loader2 } from 'lucide-react';
import { remindPartner } from '@/lib/actions/registration';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Remind {name}" - shown next to the OTHER member's seat line on My registrations when that seat
 * is unpaid/declined and the viewer's own seat is already settled (master_plan §2AQ A2). Throttled
 * server-side to one reminder per 24h per entry; `lastReminderAt` drives the same window client-side
 * so the button never invites a call the server will just refuse.
 */
export function RemindPartnerButton({
  registrationId,
  tournamentId,
  partnerName,
  lastReminderAt,
}: {
  registrationId: string;
  tournamentId: string;
  partnerName: string;
  lastReminderAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const recentlyReminded = Boolean(
    lastReminderAt && Date.now() - new Date(lastReminderAt).getTime() < DAY_MS,
  );
  const firstName = partnerName.trim().split(/\s+/)[0] || partnerName;

  if (recentlyReminded) {
    return (
      <span className="text-foreground-muted shrink-0 text-xs font-medium">
        Reminded · try again tomorrow
      </span>
    );
  }

  function send() {
    setMsg(null);
    setIsError(false);
    start(async () => {
      const res = await remindPartner(registrationId, tournamentId);
      setMsg(res.error ?? res.message ?? null);
      setIsError(Boolean(res.error));
      if (res.ok) router.refresh();
    });
  }

  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={send}
        className="border-border text-foreground-muted hover:text-foreground hover:border-primary inline-flex min-h-[28px] items-center gap-1 rounded-lg border px-2 text-xs font-medium disabled:opacity-60"
      >
        {pending ? (
          <Loader2 size={12} className="animate-spin" aria-hidden />
        ) : (
          <Bell size={12} aria-hidden />
        )}
        Remind {firstName}
      </button>
      {msg && (
        <span className={`text-[11px] ${isError ? 'text-danger' : 'text-foreground-muted'}`}>
          {msg}
        </span>
      )}
    </span>
  );
}
