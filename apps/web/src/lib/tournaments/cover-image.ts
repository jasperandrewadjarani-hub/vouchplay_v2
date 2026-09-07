import sharp from 'sharp';
import { TOURNAMENT_COVER_OUTPUT_MAX_BYTES, validateTournamentCoverInput } from '@vouchplay/core';

export interface TournamentCoverSource {
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type PreparedTournamentCover =
  { ok: true; bytes: Uint8Array } | { ok: false; error: string };

const VALIDATION_ERRORS = {
  empty: 'Choose a non-empty cover image.',
  too_large: 'Cover photo must be 4 MB or smaller.',
  unsupported_type: 'Use a PNG, JPG, or WebP cover image.',
} as const;

/** Decode, auto-orient, strip metadata, bound dimensions, and fit the public 2 MB bucket. */
export async function prepareTournamentCover(
  file: TournamentCoverSource,
): Promise<PreparedTournamentCover> {
  const validation = validateTournamentCoverInput({ mimeType: file.type, size: file.size });
  if (!validation.ok) return { ok: false, error: VALIDATION_ERRORS[validation.code] };
  try {
    const source = new Uint8Array(await file.arrayBuffer());
    for (const width of [1600, 1280, 1024]) {
      for (const quality of [82, 72, 62, 52]) {
        const bytes = await sharp(source, { failOn: 'warning', limitInputPixels: 40_000_000 })
          .rotate()
          .resize({
            width,
            height: Math.round((width * 9) / 16),
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality, effort: 4 })
          .toBuffer();
        if (bytes.byteLength <= TOURNAMENT_COVER_OUTPUT_MAX_BYTES) {
          return { ok: true, bytes };
        }
      }
    }
    return {
      ok: false,
      error: 'This image could not be optimized. Try a smaller or simpler photo.',
    };
  } catch {
    return {
      ok: false,
      error: 'This image could not be read. Try another PNG, JPG, or WebP file.',
    };
  }
}
