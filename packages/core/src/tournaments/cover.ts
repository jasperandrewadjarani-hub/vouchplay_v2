export const TOURNAMENT_COVER_SOURCE_MAX_BYTES = 4 * 1024 * 1024;
export const TOURNAMENT_COVER_OUTPUT_MAX_BYTES = 1_900_000;

export const TOURNAMENT_COVER_ACCEPTED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type TournamentCoverValidationCode = 'empty' | 'too_large' | 'unsupported_type';

export type TournamentCoverValidation =
  { ok: true } | { ok: false; code: TournamentCoverValidationCode };

/**
 * Fast metadata gate for tournament cover sources. Image bytes are decoded and normalized by the
 * server before upload, so a valid MIME/size result is necessary but not sufficient.
 */
export function validateTournamentCoverInput(input: {
  mimeType: string;
  size: number;
}): TournamentCoverValidation {
  if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, code: 'empty' };
  if (input.size > TOURNAMENT_COVER_SOURCE_MAX_BYTES) {
    return { ok: false, code: 'too_large' };
  }
  if (!(TOURNAMENT_COVER_ACCEPTED_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    return { ok: false, code: 'unsupported_type' };
  }
  return { ok: true };
}
