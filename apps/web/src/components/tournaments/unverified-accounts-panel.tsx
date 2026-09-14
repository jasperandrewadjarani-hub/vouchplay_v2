'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { resendGuestCode } from '@/lib/actions/registration';
import type { UnverifiedAccount } from '@/lib/tournaments/organizer-types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "3 days ago" / "2 hours ago" / "just now" - local to this panel; nowhere else in the app needs a
 *  relative-time string (every other date reads as an absolute PH-time date, `lib/format-date.ts`). */
function relativeDate(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

function AccountRow({
  account,
  tournamentId,
}: {
  account: UnverifiedAccount;
  tournamentId: string;
}) {
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const sentToday =
    sent || (!!account.lastCodeSentAt && Date.now() - Date.parse(account.lastCodeSentAt) < DAY_MS);

  async function resend() {
    setPending(true);
    setMsg(null);
    const res = await resendGuestCode(account.profileId, tournamentId);
    setPending(false);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setSent(true);
  }

  return (
    <li className="flex flex-col gap-1.5 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 flex-1">
          <span className="text-foreground block truncate text-sm font-semibold">
            {account.name}
          </span>
          <span className="text-foreground-muted block truncate text-xs">{account.email}</span>
        </span>
        <span className="text-foreground-muted shrink-0 text-xs">
          Entered {relativeDate(account.createdAt)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="border-border text-foreground-muted inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium">
          {account.divisionName}
        </span>
        <span className="border-warning/30 bg-warning/10 text-foreground-muted inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold">
          {account.status}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || sentToday}
          onClick={resend}
          className="border-border text-foreground hover:bg-surface-muted inline-flex min-h-9 items-center justify-center rounded-lg border px-2.5 text-xs font-semibold disabled:opacity-50"
        >
          {sentToday ? 'Sent today' : pending ? 'Sending…' : 'Resend code'}
        </button>
        {msg && <span className="text-danger text-xs">{msg}</span>}
      </div>
    </li>
  );
}

/**
 * "Unverified accounts" panel (master_plan §2BE Decision E) - a compact, collapsible list next to
 * `ReservedSlotsPanel` on Manage, for the guest accounts an organizer's entries have created but that
 * have not yet been claimed by the player. Hidden entirely when there is nothing to show, the same
 * "don't grow a permanently-empty section" rule `ReservedSlotsPanel` follows.
 */
export function UnverifiedAccountsPanel({
  accounts,
  tournamentId,
}: {
  accounts: UnverifiedAccount[];
  tournamentId: string;
}) {
  const [open, setOpen] = useState(true);
  if (accounts.length === 0) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-foreground flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm font-semibold"
      >
        <span>Unverified accounts ({accounts.length})</span>
        <ChevronDown
          size={16}
          aria-hidden
          className={`text-foreground-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ul className="border-border divide-border divide-y overflow-hidden rounded-2xl border">
          {accounts.map((a) => (
            <AccountRow key={a.profileId} account={a} tournamentId={tournamentId} />
          ))}
        </ul>
      )}
    </div>
  );
}
