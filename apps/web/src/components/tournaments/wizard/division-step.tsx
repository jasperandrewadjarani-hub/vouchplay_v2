'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, ChevronDown, Clock, Info, ShieldAlert, Users } from 'lucide-react';
import {
  ageAtDate,
  classifyDivision,
  describeDivisionFit,
  effectivePlayerSkill,
  evaluateDivisionFit,
  formatFee,
  PLAY_DOWN_WARNING,
  type DivisionFitResult,
  type DivisionKind,
} from '@vouchplay/core';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { bandLabelFor, moneyPerPlayer, quoteFor, skillLabelFor } from './shared';
import type { WizardTournament } from './types';

interface DivisionRow {
  d: DivisionDTO;
  kind: DivisionKind;
  fit: DivisionFitResult;
  full: boolean;
  invited: boolean;
  fitMessage: string | null;
  price: { text: string; earlyBirdApplied: boolean };
  topupOverBareSlot: number | null;
}

/**
 * Step 1: pick a division (master_plan §2AP A). Divisions are grouped, not listed flat: Recommended
 * (tap auto-advances), Other divisions (tap opens a one-sentence confirm panel with a required tick),
 * and Not eligible (collapsed, greyed, never selectable - a (!) button reveals why on tap). A player
 * already registered or invited into a division sees that instead, with a link out rather than a
 * second copy of the entry controls.
 */
export function DivisionStep({
  tournament,
  state,
  preselectedId = null,
  onClose,
  onContinue,
  onChooseLater,
}: {
  tournament: WizardTournament;
  state: ViewerRegistrationState;
  /** Pre-selects a card, e.g. from "Enter" on a specific division row (master_plan §2AO B). A
   *  recommended pre-selection auto-advances immediately, matching a real tap; an "other" one opens
   *  its confirm panel so the player still ticks before continuing. */
  preselectedId?: string | null;
  /** Closes the whole wizard - used by the "You're in this one" / "See your invitation" links. */
  onClose: () => void;
  onContinue: (divisionId: string, playingDown: boolean) => void;
  /** "I'll choose a division later" -> straight to Pay with a bare slot reservation. */
  onChooseLater: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [hideIneligible, setHideIneligible] = useState(false);
  const [revealedReasons, setRevealedReasons] = useState<Set<string>>(new Set());

  const visible = tournament.divisions.filter(
    (d) => d.status !== 'draft' && d.status !== 'cancelled',
  );
  const registeredIds = new Set(Object.keys(state.registrationsByDivision));
  const invitedIds = new Set(state.invitedDivisionIds ?? []);
  const effectiveSkill = effectivePlayerSkill(
    state.viewerSkill.communitySkillLevel,
    state.viewerSkill.selfRatedSkillLevel,
  );
  const ageAtStart = ageAtDate(state.viewerSkill.dateOfBirth, state.tournamentStartAt);

  const bareSlot = state.bareSlot ?? null;
  const canChooseLater = Boolean(state.slotsEnabled && state.slotPrice && !bareSlot);

  const rows: DivisionRow[] = useMemo(
    () =>
      visible.map((d) => {
        const fit = evaluateDivisionFit({
          playerSex: state.viewerSkill.sex,
          effectiveSkill,
          sexClassification: d.sexClassification,
          skillPolicy: d.skillPolicy,
          divisionMinimumSkill: d.minimumSkill,
          divisionMaximumSkill: d.maximumSkill,
          enforceSkillFloor: tournament.enforceSkillFloor,
          allowPlayDownOneLevel: tournament.allowPlayDownOneLevel,
          ageAtStart,
          divisionMinimumAge: d.minimumAge,
          divisionMaximumAge: d.maximumAge,
        });
        const capacity = Math.max(0, d.capacityTeams);
        const full = capacity > 0 && d.registeredTeams >= capacity;
        const invited = invitedIds.has(d.id);
        const registered = registeredIds.has(d.id) || invited;
        const { kind } = classifyDivision({ fit, registered, full });
        const fitMessage =
          !fit.fits && fit.reason
            ? describeDivisionFit(fit.reason, {
                subject: 'you',
                divisionName: d.name,
                bandLabel: bandLabelFor(d),
                playerLevel: skillLabelFor(effectiveSkill),
              })
            : null;
        const price = moneyPerPlayer(d, tournament.earlyBird);
        const quote = quoteFor(d, tournament.earlyBird);
        const topupOverBareSlot =
          bareSlot && quote.perPlayer > bareSlot.amountDue
            ? quote.perPlayer - bareSlot.amountDue
            : null;
        return { d, kind, fit, full, invited, fitMessage, price, topupOverBareSlot };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, state, tournament, effectiveSkill, ageAtStart, bareSlot],
  );

  const registeredRows = rows.filter((r) => r.kind === 'registered');
  const recommended = rows.filter((r) => r.kind === 'recommended');
  const other = rows.filter(
    (r) => r.kind === 'other_up' || r.kind === 'other_down' || r.kind === 'full',
  );
  const ineligible = rows.filter((r) => r.kind === 'ineligible');

  // A pre-selection from "Enter" on a specific division row behaves exactly like a real tap: a
  // recommended one auto-advances, an "other" one opens its confirm panel.
  useEffect(() => {
    if (!preselectedId) return;
    const row = rows.find((r) => r.d.id === preselectedId);
    if (!row) return;
    if (row.kind === 'recommended') {
      onContinue(row.d.id, false);
    } else if (row.kind === 'other_up' || row.kind === 'other_down' || row.kind === 'full') {
      setSelectedId(row.d.id);
    }
    // Runs once on mount only - this mirrors a single tap, not a live binding to `rows`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectOther(id: string) {
    setSelectedId((cur) => (cur === id ? null : id));
    setAck(false);
  }

  function toggleReason(id: string) {
    setRevealedReasons((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const cardShell =
    'min-h-11 w-full rounded-xl border p-3.5 text-left transition-colors border-border bg-surface hover:border-primary/50';

  function CardHeader({ r, isSelected }: { r: DivisionRow; isSelected?: boolean }) {
    return (
      <>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-foreground text-sm font-semibold">{r.d.name}</p>
            {bandLabelFor(r.d) && (
              <p className="text-foreground-muted text-xs">{bandLabelFor(r.d)}</p>
            )}
          </div>
          {isSelected && <Check size={18} className="text-primary shrink-0" aria-hidden />}
        </div>
        <div className="text-foreground-muted mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-medium">{r.price.text}</span>
          {r.price.earlyBirdApplied && tournament.earlyBird.endsAt && (
            <span className="text-success inline-flex items-center gap-1 font-medium">
              <Clock size={11} aria-hidden />
              Early bird
            </span>
          )}
          {r.topupOverBareSlot != null && (
            <span>
              This division costs {formatFee(r.d.currency, r.topupOverBareSlot)} more - you&rsquo;ll
              be asked for the difference.
            </span>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      {bareSlot && (
        <div className="border-primary/30 bg-primary/5 flex items-start gap-2 rounded-xl border p-3 text-sm">
          <ShieldAlert size={16} className="text-primary mt-0.5 shrink-0" aria-hidden />
          <p className="text-foreground">
            Your reserved slot ({formatFee(bareSlot.currency, bareSlot.amountDue)}) will be applied
            to the division you choose.
          </p>
        </div>
      )}

      {registeredRows.length > 0 && (
        <ul className="space-y-2">
          {registeredRows.map((r) => (
            <li
              key={r.d.id}
              className="border-border bg-surface-muted rounded-xl border p-3.5 opacity-90"
            >
              <p className="text-foreground text-sm font-semibold">{r.d.name}</p>
              <p className="text-foreground-muted mt-1 text-xs font-medium">
                {r.invited ? (
                  <>
                    Invited.{' '}
                    <Link
                      href="#partner-invitations"
                      onClick={() => onClose()}
                      className="text-primary underline underline-offset-2"
                    >
                      See your invitation
                    </Link>
                  </>
                ) : (
                  <>
                    You&rsquo;re in this one.{' '}
                    <Link
                      href="#my-registrations"
                      onClick={() => onClose()}
                      className="text-primary underline underline-offset-2"
                    >
                      View in My registrations
                    </Link>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}

      {recommended.length > 0 && (
        <div>
          <p className="text-foreground-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">
            Recommended for you
          </p>
          <ul className="space-y-2">
            {recommended.map((r) => (
              <li key={r.d.id}>
                <button
                  type="button"
                  onClick={() => onContinue(r.d.id, false)}
                  className={cardShell}
                >
                  <CardHeader r={r} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {other.length > 0 && (
        <div>
          <p className="text-foreground-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">
            Other divisions
          </p>
          <ul className="space-y-2">
            {other.map((r) => {
              const isSelected = selectedId === r.d.id;
              const isFullOnly = r.kind === 'full';
              const isOtherUp = r.kind === 'other_up';
              const isOtherDown = r.kind === 'other_down';
              const showFullLine = isFullOnly || (isOtherDown && r.full);
              return (
                <li key={r.d.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => selectOther(r.d.id)}
                    className={`${cardShell} ${
                      isSelected ? 'ring-primary border-primary bg-primary/5 ring-2' : ''
                    }`}
                  >
                    <CardHeader r={r} isSelected={isSelected} />
                    {isOtherUp && (
                      <p className="text-foreground-muted mt-1.5 flex items-center gap-1.5 text-xs font-medium">
                        <AlertTriangle size={13} aria-hidden />
                        Above your level
                      </p>
                    )}
                    {isOtherDown && (
                      <p className="text-warning mt-1.5 flex items-center gap-1.5 text-xs font-medium">
                        <AlertTriangle size={13} aria-hidden />
                        One level below your skill
                      </p>
                    )}
                    {showFullLine && (
                      <p className="text-warning mt-1.5 flex items-center gap-1.5 text-xs font-medium">
                        <Users size={12} aria-hidden />
                        Full - joining adds you to the waitlist
                      </p>
                    )}
                  </button>

                  {isSelected && (
                    <div className="border-warning/40 bg-warning/10 mt-2 space-y-2 rounded-xl border p-3">
                      {isOtherUp && (
                        <p className="text-foreground text-xs">
                          This division is above your community-vouched skill.
                        </p>
                      )}
                      {isOtherDown && (
                        <p className="text-foreground text-xs">{PLAY_DOWN_WARNING}</p>
                      )}
                      {showFullLine && (
                        <p className="text-foreground text-xs">This division is full.</p>
                      )}
                      <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm">
                        <input
                          type="checkbox"
                          checked={ack}
                          onChange={(e) => setAck(e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        <span className="text-foreground">
                          {isOtherUp
                            ? 'I understand it may not match my level.'
                            : isOtherDown
                              ? 'I understand'
                              : 'I understand I’m joining the waitlist, not taking a slot.'}
                        </span>
                      </label>
                      <button
                        type="button"
                        disabled={!ack}
                        onClick={() => {
                          onContinue(r.d.id, r.fit.playingDown);
                        }}
                        className="vp-gradient inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Continue
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {ineligible.length > 0 && !hideIneligible && (
        <details className="border-border rounded-xl border">
          <summary className="text-foreground-muted flex cursor-pointer list-none items-center gap-2 p-3 text-xs font-semibold tracking-wide uppercase">
            Not eligible ({ineligible.length})
            <ChevronDown size={14} className="ml-auto" aria-hidden />
          </summary>
          <ul className="space-y-2 p-3 pt-0">
            {ineligible.map((r) => {
              const revealed = revealedReasons.has(r.d.id);
              return (
                <li key={r.d.id}>
                  <div
                    aria-disabled
                    className="border-border bg-surface-muted rounded-xl border p-3.5 opacity-60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-foreground text-sm font-semibold">{r.d.name}</p>
                          <button
                            type="button"
                            aria-label="Why not eligible"
                            onClick={() => toggleReason(r.d.id)}
                            className="text-foreground-muted hover:text-foreground -m-2 inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center"
                          >
                            <Info size={15} aria-hidden />
                          </button>
                        </div>
                        {bandLabelFor(r.d) && (
                          <p className="text-foreground-muted text-xs">{bandLabelFor(r.d)}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-foreground-muted mt-1 text-xs font-medium">{r.price.text}</p>
                    {revealed && r.fitMessage && (
                      <p className="text-warning mt-1.5 flex items-start gap-1.5 text-xs">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
                        {r.fitMessage}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {ineligible.length > 0 && (
        <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 text-sm">
          <span className="text-foreground-muted font-medium">Hide ineligible</span>
          <span className="relative shrink-0">
            <input
              type="checkbox"
              checked={hideIneligible}
              onChange={(e) => setHideIneligible(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="border-border bg-surface-muted peer-checked:bg-primary peer-checked:border-primary peer-focus-visible:ring-primary/50 block h-6 w-11 rounded-full border transition-colors peer-focus-visible:ring-2"
            />
            <span
              aria-hidden
              className="absolute top-0.5 left-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
            />
          </span>
        </label>
      )}

      {visible.length === 0 && (
        <p className="text-foreground-muted text-sm">No divisions are open for entry right now.</p>
      )}

      {canChooseLater && (
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={onChooseLater}
            className="text-foreground-muted hover:text-foreground min-h-11 w-full text-center text-sm font-medium underline underline-offset-2"
          >
            I&rsquo;ll choose a division later
          </button>
        </div>
      )}
    </div>
  );
}
