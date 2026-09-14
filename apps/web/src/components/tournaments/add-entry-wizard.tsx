'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { createEntryForPlayers, searchPlayersForOrganizer } from '@/lib/actions/registration';
import type { OrganizerPlayerSearchResult } from '@/lib/tournaments/organizer-types';

/**
 * A division option for the Add entry wizard (master_plan §2BE Decision C). Merges the capacity strip
 * data (`DivisionCapacityRow` in organizer-registrations.tsx) with the reclassify picker's format/
 * team-size data (`EligibilityDivisionOption`) - both already loaded on Manage, so the wizard needs no
 * query of its own.
 */
export interface AddEntryDivisionOption {
  id: string;
  name: string;
  format: string;
  teamSize: number;
  registered: number;
  /** 0 = uncapped/open. */
  capacity: number;
}

type Step = 'division' | 'players' | 'payment' | 'review';
const STEPS: { key: Step; label: string }[] = [
  { key: 'division', label: 'Division' },
  { key: 'players', label: 'Players' },
  { key: 'payment', label: 'Payment' },
  { key: 'review', label: 'Review' },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Mini step rail matching the player wizard's look (`wizard/step-rail.tsx`) - not reused directly,
 *  since that component's steps are typed to the player/guest registration flow specifically. */
function AddEntryRail({ step }: { step: Step }) {
  const activeIndex = STEPS.findIndex((s) => s.key === step);
  return (
    <ol className="mb-4 flex items-center gap-1.5" aria-label="Add entry steps">
      {STEPS.map((s, i) => {
        const done = i < activeIndex;
        const current = i === activeIndex;
        return (
          <li key={s.key} className="flex flex-1 items-center gap-1.5">
            <span
              className={`flex items-center gap-1.5 text-xs font-semibold ${
                current ? 'text-foreground' : done ? 'text-primary' : 'text-foreground-muted'
              }`}
            >
              <span
                aria-hidden
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  done
                    ? 'vp-gradient text-white'
                    : current
                      ? 'border-primary text-primary border-2'
                      : 'border-border text-foreground-muted border'
                }`}
              >
                {done ? <Check size={12} aria-hidden /> : i + 1}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </span>
            {i < STEPS.length - 1 && (
              <span aria-hidden className={`h-px flex-1 ${done ? 'bg-primary' : 'bg-border'}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** One player search + pick field (singles: one of these; doubles: two, "Player 1" / "Player 2"). */
function PlayerPickField({
  label,
  tournamentId,
  divisionId,
  chosen,
  onChoose,
  onClear,
  excludeId,
}: {
  label: string;
  tournamentId: string;
  divisionId: string;
  chosen: OrganizerPlayerSearchResult | null;
  onChoose: (p: OrganizerPlayerSearchResult) => void;
  onClear: () => void;
  /** The other field's chosen player id, if any - so the same person cannot fill both seats. */
  excludeId?: string;
}) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<OrganizerPlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (chosen || query.trim().length < 2) {
      setMatches([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const res = await searchPlayersForOrganizer(tournamentId, divisionId, query.trim());
      setMatches(res.filter((r) => r.id !== excludeId));
      setSearching(false);
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, chosen, divisionId, tournamentId, excludeId]);

  return (
    <div className="space-y-1.5">
      <span className="text-foreground-muted text-xs font-semibold">{label}</span>
      {chosen ? (
        <div className="border-border bg-surface-muted flex items-center gap-2 rounded-xl border p-2">
          <PlayerAvatar
            url={chosen.avatarUrl}
            initials={initialsOf(chosen.name)}
            name={chosen.name}
            size="sm"
          />
          <span className="min-w-0 flex-1">
            <span className="text-foreground block truncate text-sm font-medium">
              {chosen.name}
            </span>
            <span className="text-foreground-muted block truncate text-xs">
              Community: {chosen.communitySkill ?? 'Unrated'}
            </span>
            {chosen.warning && <span className="text-warning block text-xs">{chosen.warning}</span>}
          </span>
          <button
            type="button"
            onClick={onClear}
            aria-label={`Change ${label.toLowerCase()}`}
            className="text-foreground-muted hover:text-foreground inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a player by name"
            aria-label={`Search ${label.toLowerCase()}`}
            className="border-border bg-background min-h-11 w-full rounded-xl border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          {searching && <p className="text-foreground-muted text-xs">Searching…</p>}
          {!searching && matches.length > 0 && (
            <ul className="border-border divide-border divide-y overflow-hidden rounded-xl border">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={!!m.blocked}
                    onClick={() => {
                      onChoose(m);
                      setQuery('');
                      setMatches([]);
                    }}
                    className="hover:bg-surface-muted flex min-h-11 w-full items-center gap-2 px-2.5 py-1.5 text-left disabled:opacity-50"
                  >
                    <PlayerAvatar
                      url={m.avatarUrl}
                      initials={initialsOf(m.name)}
                      name={m.name}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground block truncate text-sm font-medium">
                        {m.name}
                      </span>
                      <span className="text-foreground-muted block truncate text-xs">
                        Community: {m.communitySkill ?? 'Unrated'}
                      </span>
                    </span>
                    {m.blocked && (
                      <span className="border-danger/30 bg-danger/10 text-danger shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                        Can&rsquo;t enter: {m.blocked}
                      </span>
                    )}
                    {!m.blocked && m.warning && (
                      <span className="border-warning/40 bg-warning/10 text-warning shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                        {m.warning}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/**
 * "Add entry" wizard (master_plan §2BE Decision C) - the organizer builds an entry for existing
 * VouchPlay accounts in four short steps. Non-user (email-only) entry and bulk import are Phase B
 * (migration 0051) and are not offered here - the muted note under Players says so plainly.
 */
export function AddEntryWizard({
  tournamentId,
  divisions,
  onClose,
}: {
  tournamentId: string;
  divisions: AddEntryDivisionOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('division');
  const [divisionId, setDivisionId] = useState<string>('');
  const [player1, setPlayer1] = useState<OrganizerPlayerSearchResult | null>(null);
  const [player2, setPlayer2] = useState<OrganizerPlayerSearchResult | null>(null);
  const [markPaid, setMarkPaid] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ warnings: string[] } | null>(null);

  const division = divisions.find((d) => d.id === divisionId) ?? null;
  const isDoubles = (division?.teamSize ?? 1) > 1;

  function canAdvance(): boolean {
    if (step === 'division') return !!division;
    if (step === 'players') {
      if (!player1 || player1.blocked) return false;
      if (isDoubles && (!player2 || player2.blocked)) return false;
      return true;
    }
    if (step === 'payment') return reason.trim().length >= 3;
    return true;
  }

  function next() {
    const order: Step[] = ['division', 'players', 'payment', 'review'];
    const i = order.indexOf(step);
    if (i < order.length - 1) setStep(order[i + 1] as Step);
  }
  function back() {
    const order: Step[] = ['division', 'players', 'payment', 'review'];
    const i = order.indexOf(step);
    if (i > 0) setStep(order[i - 1] as Step);
  }

  async function submit() {
    if (!division || !player1) return;
    setPending(true);
    setError(null);
    const playerIds = [player1.id, ...(player2 ? [player2.id] : [])];
    const res = await createEntryForPlayers({
      tournamentId,
      divisionId: division.id,
      playerIds,
      markPaid,
      reason: reason.trim(),
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess({ warnings: res.warnings ?? [] });
    router.refresh();
  }

  if (success) {
    return (
      <Modal title="Entry added" onClose={onClose} align="center">
        <div className="space-y-3">
          <p className="text-success text-sm font-medium">Entry added.</p>
          {success.warnings.length > 0 && (
            <ul className="text-warning space-y-1 text-xs">
              {success.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <Button type="button" variant="secondary" onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add entry" onClose={onClose} align="center">
      <AddEntryRail step={step} />

      {step === 'division' && (
        <div className="space-y-2">
          {divisions.length === 0 && (
            <p className="text-foreground-muted text-sm">No divisions on this tournament yet.</p>
          )}
          <ul className="border-border divide-border divide-y overflow-hidden rounded-xl border">
            {divisions.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  aria-pressed={divisionId === d.id}
                  onClick={() => setDivisionId(d.id)}
                  className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2.5 text-left ${
                    divisionId === d.id ? 'bg-primary/5' : 'hover:bg-surface-muted'
                  }`}
                >
                  <span>
                    <span className="text-foreground block text-sm font-medium">{d.name}</span>
                    <span className="text-foreground-muted block text-xs">
                      {d.teamSize > 1 ? 'Doubles' : 'Singles'} · {d.format}
                    </span>
                  </span>
                  <span className="text-foreground-muted shrink-0 text-xs font-semibold tabular-nums">
                    {d.capacity > 0 ? `${d.registered}/${d.capacity}` : 'Open'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 'players' && division && (
        <div className="space-y-3">
          <PlayerPickField
            label={isDoubles ? 'Player 1' : 'Player'}
            tournamentId={tournamentId}
            divisionId={division.id}
            chosen={player1}
            onChoose={setPlayer1}
            onClear={() => setPlayer1(null)}
            excludeId={player2?.id}
          />
          {isDoubles && (
            <PlayerPickField
              label="Player 2"
              tournamentId={tournamentId}
              divisionId={division.id}
              chosen={player2}
              onChoose={setPlayer2}
              onClear={() => setPlayer2(null)}
              excludeId={player1?.id}
            />
          )}
          <p className="text-foreground-muted text-xs">
            Not on VouchPlay yet? Entering by email is coming with the next update.
          </p>
        </div>
      )}

      {step === 'payment' && (
        <div className="space-y-4">
          <Switch checked={markPaid} onCheckedChange={setMarkPaid} label="Mark as paid (cash)" />
          <div className="space-y-1.5">
            <label htmlFor="add-entry-reason" className="text-foreground block text-sm font-medium">
              Reason<span className="text-danger ml-0.5">*</span>
            </label>
            <input
              id="add-entry-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. registered at the venue"
              className="border-border bg-background min-h-11 w-full rounded-xl border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            />
          </div>
        </div>
      )}

      {step === 'review' && division && player1 && (
        <div className="space-y-3">
          <div className="border-border space-y-2 rounded-xl border border-dashed p-3 text-sm">
            <p>
              <span className="text-foreground-muted">Division: </span>
              <span className="text-foreground font-medium">{division.name}</span>
            </p>
            <p>
              <span className="text-foreground-muted">Players: </span>
              <span className="text-foreground font-medium">
                {[player1, player2]
                  .filter(Boolean)
                  .map((p) => p?.name)
                  .join(' & ')}
              </span>
            </p>
            {[player1, player2]
              .filter((p): p is OrganizerPlayerSearchResult => !!p?.warning)
              .map((p) => (
                <p key={p.id} className="text-warning text-xs">
                  {p.name.split(/\s+/)[0]}: {p.warning}
                </p>
              ))}
            <p>
              <span className="text-foreground-muted">Paid: </span>
              <span className="text-foreground font-medium">{markPaid ? 'Yes, cash' : 'No'}</span>
            </p>
            <p>
              <span className="text-foreground-muted">Reason: </span>
              <span className="text-foreground">{reason.trim()}</span>
            </p>
          </div>
          {error && (
            <p role="alert" className="bg-danger/10 text-danger rounded-lg px-3 py-2 text-sm">
              {error}
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={step === 'division' ? onClose : back}
          className="text-foreground-muted hover:text-foreground min-h-11 px-2 text-sm font-medium"
        >
          {step === 'division' ? 'Cancel' : 'Back'}
        </button>
        {step === 'review' ? (
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? 'Adding…' : 'Add entry'}
          </Button>
        ) : (
          <Button type="button" onClick={next} disabled={!canAdvance()}>
            Next
          </Button>
        )}
      </div>
    </Modal>
  );
}
