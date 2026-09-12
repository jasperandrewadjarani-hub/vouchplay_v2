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
  /** When registration closes, for the Done step's "choose your division before..." reservation
   *  note. Not part of the literal contract signature but needed for that copy - additive and
   *  optional, so a caller that omits it just gets the open-ended phrasing instead. */
  registrationCloseAt?: string | null;
}

export type WizardStep = 'division' | 'partner' | 'pay' | 'receipt' | 'done';
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
