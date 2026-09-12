'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Clock, ShieldAlert, Users } from 'lucide-react';
import {
  describeDivisionFit,
  effectivePlayerSkill,
  evaluateDivisionFit,
  formatFee,
  PLAY_DOWN_WARNING,
} from '@vouchplay/core';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { Button } from '@/components/ui/button';
import { bandLabelFor, moneyPerPlayer, quoteFor, skillLabelFor } from './shared';
import type { WizardTournament } from './types';

type CardState = 'registered' | 'ineligible' | 'full' | 'playdown' | 'eligible';

/**
 * Step 1: pick a division (master_plan §2AO B). One card per open division, big and tappable, each
 * with exactly one state so a player never has to reconcile two contradictory badges on the same
 * card. "One level below your skill" is the only selectable-but-warned state, and it requires a
 * separate tick before Continue - the same discipline the old inline forms used for "enter with an
 * unconfirmed partner" (§2D).
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
  /** Pre-selects a card, e.g. from "Enter" on a specific division row (master_plan §2AO B). The
   *  player can still change their mind before Continue. */
  preselectedId?: string | null;
  /** Closes the whole wizard - used by the "You're in this one" link to My registrations. */
  onClose: () => void;
  onContinue: (divisionId: string, playingDown: boolean) => void;
  /** "I'll choose a division later" -> straight to Pay with a bare slot reservation. */
  onChooseLater: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(preselectedId);
  const [ackPlayDown, setAckPlayDown] = useState(false);

  const visible = tournament.divisions.filter(
    (d) => d.status !== 'draft' && d.status !== 'cancelled',
  );
  const registeredIds = new Set(Object.keys(state.registrationsByDivision));
  const effectiveSkill = effectivePlayerSkill(
    state.viewerSkill.communitySkillLevel,
    state.viewerSkill.selfRatedSkillLevel,
  );

  const bareSlot = state.bareSlot ?? null;
  const canChooseLater = Boolean(state.slotsEnabled && state.slotPrice && !bareSlot);

  const rows = visible.map((d) => {
    const fit = evaluateDivisionFit({
      playerSex: state.viewerSkill.sex,
      effectiveSkill,
      sexClassification: d.sexClassification,
      skillPolicy: d.skillPolicy,
      divisionMinimumSkill: d.minimumSkill,
      divisionMaximumSkill: d.maximumSkill,
      enforceSkillFloor: tournament.enforceSkillFloor,
      allowPlayDownOneLevel: tournament.allowPlayDownOneLevel,
    });
    const capacity = Math.max(0, d.capacityTeams);
    const isFull = capacity > 0 && d.registeredTeams >= capacity;
    const registered = registeredIds.has(d.id);
    let cardState: CardState;
    if (registered) cardState = 'registered';
    else if (!fit.fits) cardState = 'ineligible';
    else if (fit.playingDown) cardState = 'playdown';
    else if (isFull) cardState = 'full';
    else cardState = 'eligible';
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
    return { d, cardState, fitMessage, price, topupOverBareSlot };
  });

  const selected = rows.find((r) => r.d.id === selectedId) ?? null;
  const canContinue = Boolean(selected && (selected.cardState !== 'playdown' || ackPlayDown));

  function selectCard(d: DivisionDTO, cardState: CardState) {
    if (cardState === 'ineligible' || cardState === 'registered') return;
    setSelectedId(d.id);
    if (cardState !== 'playdown') setAckPlayDown(false);
  }

  return (
    <div className="space-y-3">
      {bareSlot && (
        <div className="border-primary/30 bg-primary/5 flex items-start gap-2 rounded-xl border p-3 text-sm">
          <ShieldAlert size={16} className="text-primary mt-0.5 shrink-0" aria-hidden />
          <p className="text-foreground">
            Your reserved slot ({formatFee(bareSlot.currency, bareSlot.amountDue)}) will be applied
            to the division you choose.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {rows.map(({ d, cardState, fitMessage, price, topupOverBareSlot }) => {
          const isSelected = selectedId === d.id;
          const disabled = cardState === 'ineligible' || cardState === 'registered';
          return (
            <li key={d.id}>
              <button
                type="button"
                aria-disabled={disabled}
                aria-pressed={isSelected}
                onClick={() => selectCard(d, cardState)}
                className={`min-h-11 w-full rounded-xl border p-3.5 text-left transition-colors ${
                  disabled
                    ? 'border-border bg-surface-muted cursor-not-allowed opacity-70'
                    : isSelected
                      ? 'ring-primary border-primary bg-primary/5 ring-2'
                      : 'border-border bg-surface hover:border-primary/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-foreground text-sm font-semibold">{d.name}</p>
                    {bandLabelFor(d) && (
                      <p className="text-foreground-muted text-xs">{bandLabelFor(d)}</p>
                    )}
                  </div>
                  {isSelected && <Check size={18} className="text-primary shrink-0" aria-hidden />}
                </div>
                <div className="text-foreground-muted mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="font-medium">{price.text}</span>
                  {price.earlyBirdApplied && tournament.earlyBird.endsAt && (
                    <span className="text-success inline-flex items-center gap-1 font-medium">
                      <Clock size={11} aria-hidden />
                      Early bird
                    </span>
                  )}
                  {topupOverBareSlot != null && (
                    <span>
                      This division costs {formatFee(d.currency, topupOverBareSlot)} more -
                      you&rsquo;ll be asked for the difference.
                    </span>
                  )}
                </div>

                {cardState === 'registered' && (
                  <p className="text-foreground-muted mt-1.5 text-xs font-medium">
                    You&rsquo;re in this one.{' '}
                    <Link
                      href="#my-registrations"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                      }}
                      className="text-primary underline underline-offset-2"
                    >
                      View in My registrations
                    </Link>
                  </p>
                )}
                {cardState === 'ineligible' && fitMessage && (
                  <p className="text-warning mt-1.5 flex items-start gap-1.5 text-xs">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
                    {fitMessage}
                  </p>
                )}
                {cardState === 'full' && (
                  <p className="text-warning mt-1.5 flex items-center gap-1.5 text-xs font-medium">
                    <Users size={12} aria-hidden />
                    Full - joining adds you to the waitlist
                  </p>
                )}
                {cardState === 'playdown' && (
                  <p className="text-warning mt-1.5 flex items-start gap-1.5 text-xs font-medium">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
                    One level below your skill
                  </p>
                )}
              </button>

              {isSelected && cardState === 'playdown' && (
                <div className="border-warning/40 bg-warning/10 mt-2 space-y-2 rounded-xl border p-3">
                  <p className="text-foreground text-xs">{PLAY_DOWN_WARNING}</p>
                  <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={ackPlayDown}
                      onChange={(e) => setAckPlayDown(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span className="text-foreground">I understand</span>
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {visible.length === 0 && (
        <p className="text-foreground-muted text-sm">No divisions are open for entry right now.</p>
      )}

      <div className="space-y-2 pt-1">
        <Button
          type="button"
          disabled={!canContinue}
          onClick={() => selected && onContinue(selected.d.id, selected.cardState === 'playdown')}
          className="w-full"
        >
          Continue
        </Button>
        {canChooseLater && (
          <button
            type="button"
            onClick={onChooseLater}
            className="text-foreground-muted hover:text-foreground min-h-11 w-full text-center text-sm font-medium underline underline-offset-2"
          >
            I&rsquo;ll choose a division later
          </button>
        )}
        {canChooseLater && (
          <p className="text-foreground-muted text-center text-xs">
            You&rsquo;ll pick a partner after you choose a division.
          </p>
        )}
      </div>
    </div>
  );
}
