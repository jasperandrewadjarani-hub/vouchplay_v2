import { quoteFee, formatFee } from '@vouchplay/core';
import { SKILL_BANDS } from '@vouchplay/config';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import type { WizardTournament } from './types';

/** The band a division is for, in words - "Beginner", or "Beginner to Novice". Null when open.
 *  Mirrors `division-browser.tsx`'s helper of the same name; kept local so the wizard folder has no
 *  reach into a file another surface owns the layout of. */
export function bandLabelFor(d: {
  skillPolicy: string;
  minimumSkill: number | null;
  maximumSkill: number | null;
}): string | null {
  if (d.skillPolicy === 'open') return null;
  const label = (o: number | null) =>
    o == null ? null : (SKILL_BANDS.find((b) => b.ordinal === o)?.label ?? null);
  const min = label(d.minimumSkill);
  const max = label(d.maximumSkill);
  if (min && max) return min === max ? min : `${min} to ${max}`;
  return min ?? max;
}

export function skillLabelFor(ordinal: number | null): string | null {
  if (ordinal == null) return null;
  return SKILL_BANDS.find((b) => b.ordinal === ordinal)?.label ?? null;
}

/** "PHP 1,500 / player", with an early-bird chip line when it applies. fee_amount is per-player
 *  since migration 0026 - never divide by team size again (§1V). */
export function moneyPerPlayer(
  d: Pick<DivisionDTO, 'feeAmount' | 'earlyBirdFeeAmount' | 'currency' | 'teamSize'>,
  earlyBird: WizardTournament['earlyBird'],
): { text: string; earlyBirdApplied: boolean } {
  const quote = quoteFee({
    feeAmount: d.feeAmount,
    earlyBirdFeeAmount: d.earlyBirdFeeAmount,
    earlyBirdStartsAt: earlyBird.startsAt,
    earlyBirdEndsAt: earlyBird.endsAt,
    teamSize: d.teamSize,
  });
  if (quote.perPlayer <= 0) return { text: 'Free', earlyBirdApplied: false };
  return {
    text: `${formatFee(d.currency, quote.perPlayer)} / player`,
    earlyBirdApplied: quote.earlyBirdApplied,
  };
}

export function quoteFor(d: DivisionDTO, earlyBird: WizardTournament['earlyBird'], at?: Date) {
  return quoteFee(
    {
      feeAmount: d.feeAmount,
      earlyBirdFeeAmount: d.earlyBirdFeeAmount,
      earlyBirdStartsAt: earlyBird.startsAt,
      earlyBirdEndsAt: earlyBird.endsAt,
      teamSize: d.teamSize,
    },
    at,
  );
}
