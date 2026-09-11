'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Loader2, UserPlus, UserMinus, TriangleAlert } from 'lucide-react';
import {
  replacePendingPartner,
  searchInvitablePlayers,
  cancelInvitation,
  requestPartnerRelease,
  respondPartnerRelease,
  cancelPartnerRelease,
  type PlayerSearchResult,
} from '@/lib/actions/registration';
import { Input } from '@/components/ui/field';
import { formatMonthDay } from '@/lib/format-date';
import type { ReleaseRequestView } from '@/lib/tournaments/registration-queries';

/**
 * The one compact "Partner" block for a doubles entry (master_plan §2AM). Exactly one of six states
 * shows at a time, chosen in the order below - never more than one control cluster, and never a
 * control that cannot succeed:
 *
 *  a. open seat, changes still open   -> choose a partner (the existing search UI)
 *  b. a named partner has not answered -> say so, offer to withdraw the invite
 *  c. confirmed partner, changes open -> change partner (consented release) / leave this team
 *  d. an outgoing release request     -> waiting for an answer, offer to withdraw it
 *  e. an incoming release request     -> approve / decline, highlighted (needs the viewer now)
 *  f. changes closed                  -> one muted line, no controls
 *
 * `d` and `e` are mutually exclusive in practice (a team has at most one open request, and the
 * viewer is either the requester or the approver on it), so the request is checked once and each
 * branch below simply reads which side of it the viewer is on.
 */
export function PartnerChangeActions({
  teamId,
  tournamentId,
  divisionId,
  viewerId,
  pendingPartnerName,
  pendingInvitationId,
  confirmedPartner,
  seatOpen,
  releaseRequest,
  partnerLockAt,
  partnerChangesOpen,
}: {
  teamId: string;
  tournamentId: string;
  divisionId: string;
  viewerId: string;
  pendingPartnerName: string | null;
  pendingInvitationId: string | null;
  confirmedPartner: { id: string; name: string } | null;
  seatOpen: boolean;
  releaseRequest: ReleaseRequestView | null;
  /** Effective partner lock-in, or null when there is none to show. */
  partnerLockAt: string | null;
  /** Tournament status in (registration_open, registration_closed) AND now before the lock. */
  partnerChangesOpen: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function run(fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) {
    setMsg(null);
    setIsError(false);
    start(async () => {
      const res = await fn();
      setMsg(res.error ?? res.message ?? null);
      setIsError(Boolean(res.error));
      if (res.ok) router.refresh();
    });
  }

  const lockLine =
    partnerLockAt && partnerChangesOpen ? (
      <p className="text-foreground-muted mt-1.5 text-[11px]">
        Partner changes close {formatMonthDay(partnerLockAt)}.
      </p>
    ) : null;

  // f. Changes closed - one muted line, no controls (a pending invitee still declines elsewhere).
  if (!partnerChangesOpen) {
    return (
      <p className="text-foreground-muted mt-2 flex items-start gap-2 text-sm">
        <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
        <span>Partner changes are locked for this tournament.</span>
      </p>
    );
  }

  // e. Incoming release request - needs the viewer now, so it is highlighted rather than muted.
  if (releaseRequest?.iAmApprover) {
    const requesterName = confirmedPartner?.name ?? 'Your partner';
    const headline = releaseRequest.iAmLeaving
      ? `${requesterName} asked you to release the seat.`
      : `${releaseRequest.leavingName} wants to leave the team.`;
    return (
      <div className="border-warning/40 bg-warning/10 mt-2 space-y-2 rounded-xl border p-3">
        <p className="text-foreground flex items-start gap-2 text-sm font-semibold">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          {headline}
        </p>
        <p className="text-foreground-muted text-xs">
          The entry, slot and payment stay with the team either way.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => respondPartnerRelease(releaseRequest.id, true))}
            className="vp-gradient min-h-[40px] rounded-lg px-4 text-xs font-semibold text-white disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => respondPartnerRelease(releaseRequest.id, false))}
            className="border-border text-foreground min-h-[40px] rounded-lg border px-4 text-xs font-semibold disabled:opacity-50"
          >
            Decline
          </button>
        </div>
        {msg && (
          <p
            className={`text-xs ${isError ? 'text-danger' : 'text-foreground-muted'}`}
            role="status"
          >
            {msg}
          </p>
        )}
      </div>
    );
  }

  // d. Outgoing release request - waiting on the other member to answer.
  if (releaseRequest?.iRequested) {
    const otherName = confirmedPartner?.name ?? 'your partner';
    return (
      <div className="mt-2 space-y-1.5">
        <p className="text-foreground-muted flex items-start gap-2 text-sm">
          <Clock size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Waiting for <span className="text-foreground font-semibold">{otherName}</span> to answer
            your partner change.
          </span>
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => cancelPartnerRelease(releaseRequest.id))}
          className="border-border text-foreground-muted hover:text-foreground inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium disabled:opacity-60"
        >
          {pending && <Loader2 size={13} className="animate-spin" aria-hidden />}
          Withdraw request
        </button>
        {msg && (
          <p
            className={`text-xs ${isError ? 'text-danger' : 'text-foreground-muted'}`}
            role="status"
          >
            {msg}
          </p>
        )}
      </div>
    );
  }

  // a. Open seat - choose a partner (any open seat: never named, declined, expired, or cancelled).
  if (seatOpen) {
    return (
      <ChoosePartner
        teamId={teamId}
        tournamentId={tournamentId}
        divisionId={divisionId}
        partnerLockAt={partnerLockAt}
      />
    );
  }

  // b. A named partner has not answered yet.
  if (pendingPartnerName) {
    return (
      <div className="mt-2 space-y-1.5">
        <p className="text-foreground-muted flex items-start gap-2 text-sm">
          <Clock size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Waiting for <span className="text-foreground font-semibold">{pendingPartnerName}</span>{' '}
            to accept. They can accept or decline from their own notifications.
          </span>
        </p>
        {pendingInvitationId && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => cancelInvitation(pendingInvitationId))}
            className="border-border text-foreground-muted hover:text-foreground inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium disabled:opacity-60"
          >
            {pending && <Loader2 size={13} className="animate-spin" aria-hidden />}
            Withdraw invite
          </button>
        )}
        {msg && (
          <p
            className={`text-xs ${isError ? 'text-danger' : 'text-foreground-muted'}`}
            role="status"
          >
            {msg}
          </p>
        )}
      </div>
    );
  }

  // c. Confirmed partner - change (consented release) or leave.
  if (confirmedPartner) {
    return (
      <ConfirmedPartner
        teamId={teamId}
        viewerId={viewerId}
        partner={confirmedPartner}
        lockLine={lockLine}
      />
    );
  }

  return null;
}

/** State (a): the search-and-choose UI, reused as-is from the pre-§2AM version. */
function ChoosePartner({
  teamId,
  tournamentId,
  divisionId,
  partnerLockAt,
}: {
  teamId: string;
  tournamentId: string;
  divisionId: string;
  partnerLockAt: string | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setSearching(false);
      setResults([]);
      return;
    }
    setSearching(true);
    setResults([]);
    timer.current = setTimeout(async () => {
      setResults(await searchInvitablePlayers(q, divisionId));
      setSearching(false);
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, divisionId]);

  function choose(slug: string, name: string) {
    setMsg(null);
    setIsError(false);
    const fd = new FormData();
    fd.set('teamId', teamId);
    fd.set('divisionId', divisionId);
    fd.set('inviteeSlug', slug);
    start(async () => {
      const res = await replacePendingPartner(tournamentId, {}, fd);
      if (res.ok) {
        setMsg(`${name} has been asked to confirm. Your slot and payment are unchanged.`);
        setIsError(false);
        setQ('');
        setResults([]);
        setOpen(false);
        router.refresh();
      } else {
        setMsg(res.error ?? 'Could not name that partner.');
        setIsError(true);
      }
    });
  }

  return (
    <div className="border-warning/40 bg-warning/10 mt-2 space-y-2 rounded-xl border p-3">
      <p className="text-foreground text-sm font-semibold">
        No partner yet{partnerLockAt ? ` · choose before ${formatMonthDay(partnerLockAt)}` : ''}
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="vp-gradient inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white"
        >
          <UserPlus size={16} aria-hidden />
          Choose a partner
        </button>
      ) : (
        <div className="space-y-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search players by name"
            aria-label="Search for a new partner"
          />
          {searching && <p className="text-foreground-muted text-xs">Searching...</p>}
          {results.length > 0 && (
            <ul className="border-border divide-border bg-surface divide-y rounded-lg border">
              {results.map((p) => (
                <li key={p.slug} className="flex items-start justify-between gap-2 p-2">
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block text-sm">
                      {p.name}
                      {p.city && <span className="text-foreground-muted text-xs"> · {p.city}</span>}
                    </span>
                    {p.blockedReason && (
                      <span className="text-warning mt-0.5 block text-xs">{p.blockedReason}</span>
                    )}
                  </span>
                  {p.blockedReason ? (
                    <span className="text-foreground-muted shrink-0 self-center text-xs font-medium">
                      Can&rsquo;t enter
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => choose(p.slug, p.name)}
                      className="vp-gradient min-h-[44px] shrink-0 self-center rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {pending ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                      ) : (
                        'Choose'
                      )}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && !searching && results.length === 0 && (
            <p className="text-foreground-muted text-xs">
              No players found. Your partner needs a VouchPlay account.
            </p>
          )}
        </div>
      )}
      {msg && (
        <p className={`text-sm ${isError ? 'text-danger' : 'text-foreground-muted'}`} role="status">
          {msg}
        </p>
      )}
    </div>
  );
}

/** State (c): a confirmed partner - each control opens its own inline confirm sheet, never
 *  `window.confirm`, and the copy says plainly that money is untouched. */
function ConfirmedPartner({
  teamId,
  viewerId,
  partner,
  lockLine,
}: {
  teamId: string;
  viewerId: string;
  partner: { id: string; name: string };
  lockLine: ReactNode;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<'none' | 'change' | 'leave'>('none');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function ask(leavingPlayerId: string) {
    setMsg(null);
    setIsError(false);
    start(async () => {
      const res = await requestPartnerRelease(teamId, leavingPlayerId);
      setMsg(res.error ?? res.message ?? null);
      setIsError(Boolean(res.error));
      if (res.ok) {
        setSheet('none');
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="text-foreground flex items-center gap-1.5 text-sm">
        Partner: <span className="font-semibold">{partner.name}</span>
        <span className="text-success" aria-hidden>
          ✓
        </span>
      </p>
      {lockLine}

      {sheet === 'none' && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSheet('change')}
            className="border-border text-foreground min-h-[40px] rounded-lg border px-3 text-xs font-semibold"
          >
            Change partner
          </button>
          <button
            type="button"
            onClick={() => setSheet('leave')}
            className="text-foreground-muted hover:text-foreground inline-flex min-h-[40px] items-center gap-1 px-2 text-xs font-medium"
          >
            <UserMinus size={13} aria-hidden />
            Leave this team
          </button>
        </div>
      )}

      {sheet === 'change' && (
        <div className="border-border bg-surface space-y-2 rounded-xl border p-3 text-sm">
          <p className="text-foreground">
            Ask {partner.name} to release the seat? They must agree. The entry and payment stay with
            the team.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => ask(partner.id)}
              className="vp-gradient min-h-[40px] rounded-lg px-4 text-xs font-semibold text-white disabled:opacity-50"
            >
              {pending ? 'Sending…' : `Ask ${partner.name}`}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setSheet('none')}
              className="border-border text-foreground min-h-[40px] rounded-lg border px-4 text-xs font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {sheet === 'leave' && (
        <div className="border-border bg-surface space-y-2 rounded-xl border p-3 text-sm">
          <p className="text-foreground">Ask {partner.name} to let you leave? They must agree.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => ask(viewerId)}
              className="vp-gradient min-h-[40px] rounded-lg px-4 text-xs font-semibold text-white disabled:opacity-50"
            >
              {pending ? 'Sending…' : `Ask ${partner.name}`}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setSheet('none')}
              className="border-border text-foreground min-h-[40px] rounded-lg border px-4 text-xs font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={`text-sm ${isError ? 'text-danger' : 'text-foreground-muted'}`} role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
