/**
 * Shared result/DTO shapes for the organizer-powers server actions (master_plan §2BE) - a plain
 * module (NOT `'use server'`) so both the server actions in `actions/registration.ts` /
 * `actions/payment.ts` / `actions/eligibility.ts` and the organizer UI components can import the
 * exact same types without pulling a `'use server'` file into client code.
 */

/** The one result shape every new organizer-powers action returns (master_plan §2BE Contracts).
 *  `note` carries a non-blocking advisory (e.g. a capacity warning) alongside success. */
export type OrganizerActionResult =
  { ok: true; message?: string; note?: string } | { ok: false; error: string };

/** One candidate row for the organizer's "Add entry" player search (master_plan §2BE C). `blocked`
 *  is a HARD rule (sex / composition / already on a live team in this division) - the candidate
 *  cannot be picked. `warning` is advisory only (skill above the division max, unrated, unknown
 *  birthday on an age-limited division) - the organizer can still enter them. */
export type OrganizerPlayerSearchResult = {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  sex: 'male' | 'female' | null;
  communitySkill: string | null;
  blocked: string | null;
  warning: string | null;
};

/** One row in the organizer's "Unverified accounts" panel (master_plan §2BE E) - a guest
 *  (`guest_created_at` set, `onboarded_at` still null) with a live entry in this tournament. */
export type UnverifiedAccount = {
  profileId: string;
  name: string;
  email: string | null;
  createdAt: string;
  registrationId: string | null;
  divisionName: string | null;
  status: string | null;
  lastCodeSentAt: string | null;
};
