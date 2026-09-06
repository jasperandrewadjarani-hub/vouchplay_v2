/**
 * Profile field visibility contract (handover §7.4, §8.1).
 *
 * `profiles.profile_visibility` is a jsonb map of field → visibility level. It controls what
 * NON-privileged viewers (anonymous public and other logged-in members) may see. The profile OWNER
 * and authorized staff (moderation/admin) always see every field regardless of these settings; that
 * elevation is applied in the server DTO layer, never here.
 *
 * Enforcement is server-side (DTO projection) - RLS lets the public read the profile row, so hidden
 * fields must be dropped before the payload ever reaches the client. Never send a hidden field to a
 * non-privileged viewer.
 *
 * Defaults mirror §8.1 (the player card shows sex + city when available) and take the
 * privacy-preserving option for the more sensitive derived field (age is hidden by default; it is not
 * shown on the card at all, and organizers reach it only for age-defined divisions - a later phase).
 */

export type VisibilityLevel = 'public' | 'hidden';

/** Fields whose public visibility a player can control. */
export type VisibilityField = 'sex' | 'city' | 'age' | 'directory';

export type ProfileVisibility = Partial<Record<VisibilityField, VisibilityLevel>>;

export const VISIBILITY_DEFAULTS: Record<VisibilityField, VisibilityLevel> = {
  sex: 'public',
  city: 'public',
  age: 'hidden',
  // `directory` controls whether the profile is listed in the public /players directory.
  // (Individual profile pages remain reachable by direct link; this only affects listing.)
  directory: 'public',
};

/** Coerce an unknown jsonb value into a safe ProfileVisibility map. */
export function parseVisibility(raw: unknown): ProfileVisibility {
  if (!raw || typeof raw !== 'object') return {};
  const out: ProfileVisibility = {};
  const obj = raw as Record<string, unknown>;
  for (const field of ['sex', 'city', 'age', 'directory'] as const) {
    if (obj[field] === 'public' || obj[field] === 'hidden') {
      out[field] = obj[field] as VisibilityLevel;
    }
  }
  return out;
}

/**
 * Whether a field is visible to a NON-privileged viewer. Privileged viewers (owner/staff) must be
 * short-circuited by the caller before consulting this.
 */
export function fieldVisible(visibility: ProfileVisibility, field: VisibilityField): boolean {
  return (visibility[field] ?? VISIBILITY_DEFAULTS[field]) === 'public';
}
