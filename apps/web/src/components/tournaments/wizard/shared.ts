import { quoteFee, formatFee } from '@vouchplay/core';
import { SKILL_BANDS } from '@vouchplay/config';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import type { GuestFacts, WizardTournament } from './types';

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

/**
 * A synthetic `ViewerRegistrationState` built purely from the About-you facts, for the guest wizard's
 * Division/Partner steps BEFORE any shadow account exists (master_plan §2AU Decision A/§3 item 3) -
 * feeds `DivisionStep`/`PayStep` unchanged. Registered/invited sets are empty (a brand-new guest has
 * neither); `slotsEnabled: false` doubles as "no bare-slot strip" and "hide 'choose a division
 * later'" - both riding the same existing gate those components already have, not a new one. Once
 * `startGuestEntry` + `getGuestState` return a real state, the wizard swaps this out entirely (Pay/
 * Receipt never see it).
 */
export function guestViewerState(
  guest: GuestFacts,
  tournamentStartAt: string | null,
): ViewerRegistrationState {
  return {
    teamsByDivision: {},
    registrationsByDivision: {},
    invitations: [],
    invitedDivisionIds: [],
    clubReps: [],
    eligibleClubs: [],
    viewerSkill: {
      playerId: '',
      profileSlug: null,
      communitySkillLevel: null,
      sts: 0,
      uniqueVoucherCount: 0,
      skillVerified: false,
      selfRatedSkillLevel: guest.selfRatedSkill,
      sex: guest.sex,
      dateOfBirth: guest.dateOfBirth,
    },
    paymentQrUrl: null,
    viewerId: '',
    viewerLookingForPartner: false,
    viewerOpenForSponsorship: false,
    viewerOnboarded: false,
    partnerLockAt: null,
    partnerLockPassed: false,
    partnerChangesOpen: false,
    slotsEnabled: false,
    bareSlot: null,
    slotPrice: null,
    tournamentStartAt,
  };
}
