/**
 * VouchPlay canonical configuration.
 *
 * Values here that the handover marks Admin-configurable are DEFAULTS ONLY. At runtime they must be
 * read from the `system_settings` table (handover §30.7) — never hardcode them into domain logic.
 * The canonical vocabulary (skill bands, verification terms) is fixed and must not be reordered
 * (handover §3, §72, coding-agent rule #6).
 */

export * from './skill';
export * from './settings';
export * from './brand';
export * from './visibility';
export * from './geo';
export * from './moderation';
