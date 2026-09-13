import type { DivisionDTO } from '@/lib/tournaments/dto';

/**
 * The slice of tournament data the registration wizard needs, assembled once by the caller (the
 * tournament page, or any component that already has a `TournamentDetailDTO` in scope) so every
 * step reads the same numbers (master_plan §2AO B). Not the full `TournamentDetailDTO` - the wizard
 * has no business with announcements, organizers, club rules, etc.
 */
export interface WizardTournament {
  id: string;
  slug: string;
  name: string;
  divisions: DivisionDTO[];
  earlyBird: { startsAt: string | null; endsAt: string | null };
  enforceSkillFloor: boolean;
  /** Organizer toggle: entry one skill level below the player's own is allowed, subject to the
   *  organizers' final skills assessment (master_plan §2AO C). */
  allowPlayDownOneLevel: boolean;
  requireSkillVerified: boolean;
  paymentInstructions: string | null;
  paymentMethods: string | null;
  registrationOpen: boolean;
  /** How long an unpaid entry holds its slot, for the honest "pay later" warning (§2J). */
  slotHoldMinutes: number;
  /** Cap on how many clubs a player may represent at once (handover §22.6) - the Done step's
   *  "Represent a club" card (master_plan §2AT Decision G) needs it for `ClubRepSelector`. */
  maxClubsPerPlayer: number;
  /** When registration closes, for the Done step's "choose your division before..." reservation
   *  note. Not part of the literal contract signature but needed for that copy - additive and
   *  optional, so a caller that omits it just gets the open-ended phrasing instead. */
  registrationCloseAt?: string | null;
  /** `tournaments.start_at` (master_plan §2AU Decision A/§3) - the guest wizard's About-you step
   *  needs it to compute age-at-the-door (`ageAtDate`) before any account/state exists at all. Null
   *  when the tournament has no scheduled start yet, same as `ViewerRegistrationState.tournamentStartAt`. */
  startAt: string | null;
}

export type WizardMode = 'player' | 'guest';

export type WizardStep =
  | 'about-you'
  | 'division'
  | 'partner'
  | 'pay'
  | 'receipt'
  | 'existing-account'
  | 'verify'
  /** Guest closed the wizard from the Verify step without finishing (master_plan §2AU Decision D) -
   *  a small "your entry is saved" screen instead of vanishing outright. */
  | 'verify-later'
  | 'done';
export type WizardPayFor = 'seat' | 'team' | 'reservation';

export interface WizardInitial {
  step?: WizardStep;
  divisionId?: string | null;
  registrationId?: string | null;
  payFor?: WizardPayFor;
}

export interface WizardPartner {
  slug: string;
  name: string;
}

/**
 * Facts collected at the guest wizard's About-you step (master_plan §2AU Decision A) - nothing is
 * created from these until Pay actually commits (Decision D). `website` is the honeypot: a real
 * visitor never sees or fills it, so a non-empty value marks the submission for the server to refuse
 * quietly (Decision G).
 */
export interface GuestFacts {
  firstName: string;
  lastName: string;
  email: string;
  sex: 'male' | 'female';
  /** ISO date (yyyy-mm-dd), matching `<input type="date">` and `ageAtDate`'s expected format. */
  dateOfBirth: string;
  selfRatedSkill: number;
  acceptedTerms: boolean;
  website: string;
}
