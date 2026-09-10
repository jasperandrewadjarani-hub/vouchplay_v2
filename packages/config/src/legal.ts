/**
 * App-wide legal document versioning (master_plan §2R).
 *
 * `version` is the single string compared against `profiles.terms_accepted_version`: bump it whenever
 * the Terms of Service or Privacy Policy change materially, and every player is re-prompted to accept
 * on their next visit. Keep it date-based and stable between real changes. `effectiveDate` is the
 * human-readable date shown on the documents.
 *
 * The document TEXT lives in the app (components/legal/*), not here, so it can use JSX; this module
 * holds only the values domain/shell code needs (the version to compare, and identity used in copy).
 */
export const LEGAL = {
  /** Bump on any material change to Terms or Privacy; re-prompts everyone. */
  version: '2026-09-10',
  /** Shown on the documents as "Last updated / Effective". */
  effectiveDate: 'September 10, 2026',
  /** The operating entity behind VouchPlay (also in BRAND.developer). */
  entity: 'JT Consulting & Analytics Inc.',
  /** Governing jurisdiction for the Terms. */
  jurisdiction: 'the Republic of the Philippines',
} as const;

/** True when a stored acceptance version matches the current published documents. */
export function isCurrentLegalVersion(acceptedVersion: string | null | undefined): boolean {
  return typeof acceptedVersion === 'string' && acceptedVersion === LEGAL.version;
}
