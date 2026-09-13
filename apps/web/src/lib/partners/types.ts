import type { SkillBand } from '@vouchplay/config';

/**
 * Partner matchmaking DTOs (master_plan §2AV). The contract between the server (`lib/partners/*`,
 * `actions/partners.ts`) and the deck UI (`components/partners/*`). Everything here is what the
 * VIEWER may see: never a swipe, never "they liked you" - reciprocity only sorts (§2AV D, F).
 */

/** A doubles division as it relates to the viewer. */
export interface PartnerDivisionRef {
  id: string;
  name: string;
  /** Fits the viewer without playing up or down (counts double in the overlap term). */
  recommended: boolean;
  /** The viewer already holds a live open-seat entry here (locked on in the opt-in sheet). */
  viewerHasSeat: boolean;
}

export interface PartnerSearchState {
  id: string;
  divisionIds: string[];
  note: string | null;
  status: 'open' | 'closed';
  createdAt: string;
}

/** One deck card. Rating fields already follow §2AW privacy for THIS viewer (nulled when private). */
export interface PartnerCard {
  playerId: string;
  slug: string;
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  sex: 'male' | 'female' | null;
  city: string | null;
  communitySkill: SkillBand | null;
  selfRatedSkill: SkillBand | null;
  /** True when the candidate hides the community rating (and meter) from the public (§2AW). */
  communityRatingPrivate: boolean;
  selfRatingPrivate: boolean;
  sts: number | null;
  identityVerified: boolean;
  coachVouched: boolean;
  /** Divisions both players want AND both fit (with each other as partner). */
  commonDivisions: { id: string; name: string }[];
  /** The candidate's live open-seat entry in a common division, when they hold one. */
  seat: { divisionId: string; divisionName: string; paid: boolean } | null;
  note: string | null;
  /** Sort key only - the UI never shows it. */
  score: number;
}

/** How a match proceeds to a team - decided by the server at match time (§2AV F). */
export type PartnerMatchDoor =
  | { kind: 'invited'; byViewer: boolean; registrationId: string | null }
  | { kind: 'enter_together'; href: string }
  | { kind: 'entered' }
  | { kind: 'closed'; reason: string };

export interface PartnerMatchView {
  id: string;
  partner: {
    playerId: string;
    slug: string;
    displayName: string;
    initials: string;
    avatarUrl: string | null;
  };
  divisions: { id: string; name: string }[];
  matchedAt: string;
  status: 'open' | 'entered' | 'closed';
  door: PartnerMatchDoor;
}

export interface PartnerDeckData {
  /** `partner_matchmaking_enabled` and the viewer may use the feature (onboarded, active). */
  enabled: boolean;
  tournament: { id: string; slug: string; name: string; registrationOpen: boolean };
  /** Doubles divisions the viewer could choose, with fit; empty when none is open. */
  eligibleDivisions: PartnerDivisionRef[];
  search: PartnerSearchState | null;
  cards: PartnerCard[];
  /** Other open searches in the tournament (before the viewer's own filters). */
  lookingCount: number;
  matches: PartnerMatchView[];
  swipesLeftToday: number;
  /** A last "Not now" exists that Undo can bring back. */
  canUndo: boolean;
}

export type SwipeResult =
  | { ok: true; matched: PartnerMatchView | null; swipesLeftToday: number; canUndo: boolean }
  | { ok: false; error: string };

export type PartnerActionState = { ok?: true; error?: string };
