/**
 * Human copy for `vouches.interaction_type` (handover §10.1). One source of truth so the vouch form,
 * the moderation panel and anything added later never drift apart.
 *
 * `observed` was added in migration 0024 for a voucher who has genuinely watched a player but never
 * partnered with or played against them. It is a CONTEXT label only: interaction type has never been
 * an input to effective_weight (§10.5, LOCKED), so vouch weighting is unchanged by it.
 */

export const VOUCH_INTERACTION_ORDER = ['with', 'against', 'both', 'observed'] as const;

export type VouchInteraction = (typeof VOUCH_INTERACTION_ORDER)[number];

/** Full sentence, used in the vouch form where the player is choosing. */
export const VOUCH_INTERACTION_OPTIONS: { value: VouchInteraction; label: string }[] = [
  { value: 'with', label: 'I played with them (partner)' },
  { value: 'against', label: 'I played against them (opponent)' },
  { value: 'both', label: 'Both (partner and opponent)' },
  { value: 'observed', label: 'I have not played with them, but I have watched them play' },
];

/** Short phrase, used where the vouch is being described back to someone (moderation, summaries). */
const SHORT: Record<string, string> = {
  with: 'played with them',
  against: 'played against them',
  both: 'played with and against them',
  observed: 'watched them play',
};

export function interactionLabel(value: string): string {
  return SHORT[value] ?? value;
}
