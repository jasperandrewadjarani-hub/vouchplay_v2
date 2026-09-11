import sharp from 'sharp';

export const ACCEPTED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export interface ImageUploadSource {
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ImageNormalizationProfile {
  maxSourceBytes: number;
  maxOutputBytes: number;
  dimensions: readonly number[];
  qualities: readonly number[];
}

export const AVATAR_IMAGE_PROFILE: ImageNormalizationProfile = {
  maxSourceBytes: 2 * 1024 * 1024,
  maxOutputBytes: 250_000,
  dimensions: [512, 384, 256],
  qualities: [82, 72, 62, 52],
};

export const CLUB_LOGO_IMAGE_PROFILE: ImageNormalizationProfile = {
  maxSourceBytes: 2 * 1024 * 1024,
  maxOutputBytes: 384_000,
  dimensions: [768, 640, 512, 384],
  qualities: [84, 74, 64, 54],
};

export const PAYMENT_PROOF_IMAGE_PROFILE: ImageNormalizationProfile = {
  maxSourceBytes: 5 * 1024 * 1024,
  maxOutputBytes: 1_500_000,
  dimensions: [2048, 1800, 1600, 1280],
  qualities: [88, 80, 72, 64],
};

/**
 * Identity-verification document images (master_plan §2AG Phase C). Same bound as payment-proof
 * images - a government ID needs to stay readable for staff review, but the private bucket still
 * needs a sane cap. The source image is deleted on decision regardless (§13.3); this only bounds
 * what is stored between submission and review.
 */
export const ID_DOCUMENT_IMAGE_PROFILE: ImageNormalizationProfile = {
  maxSourceBytes: 5 * 1024 * 1024,
  maxOutputBytes: 1_500_000,
  dimensions: [2048, 1800, 1600, 1280],
  qualities: [88, 80, 72, 64],
};

export type ImageNormalizationError =
  'empty' | 'source_too_large' | 'unsupported_type' | 'invalid_image' | 'output_too_large';

export type PreparedImage =
  | { ok: true; bytes: Uint8Array; mimeType: 'image/webp'; extension: 'webp' }
  | { ok: false; error: ImageNormalizationError };

const FORMAT_TO_MIME: Readonly<Record<string, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Safely prepare an uploaded image for storage. Each output is freshly decoded and re-encoded,
 * which removes metadata and prevents a browser-provided MIME or filename from becoming trusted.
 */
export async function normalizeUploadedImage(
  source: ImageUploadSource,
  profile: Readonly<ImageNormalizationProfile>,
): Promise<PreparedImage> {
  if (!Number.isFinite(source.size) || source.size <= 0) return { ok: false, error: 'empty' };
  if (source.size > profile.maxSourceBytes) return { ok: false, error: 'source_too_large' };
  if (!(ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(source.type)) {
    return { ok: false, error: 'unsupported_type' };
  }

  let input: Uint8Array;
  try {
    input = new Uint8Array(await source.arrayBuffer());
    const metadata = await sharp(input, {
      failOn: 'error',
      limitInputPixels: 40_000_000,
    }).metadata();
    const detectedMime = metadata.format ? FORMAT_TO_MIME[metadata.format] : undefined;
    if (!detectedMime || detectedMime !== source.type || (metadata.pages ?? 1) > 1) {
      return { ok: false, error: 'invalid_image' };
    }
  } catch {
    return { ok: false, error: 'invalid_image' };
  }

  try {
    for (const dimension of profile.dimensions) {
      for (const quality of profile.qualities) {
        const output = await sharp(input, { failOn: 'error', limitInputPixels: 40_000_000 })
          .rotate()
          .resize({
            width: dimension,
            height: dimension,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality, effort: 4 })
          .toBuffer();
        if (output.byteLength <= profile.maxOutputBytes) {
          return {
            ok: true,
            bytes: new Uint8Array(output),
            mimeType: 'image/webp',
            extension: 'webp',
          };
        }
      }
    }
  } catch {
    return { ok: false, error: 'invalid_image' };
  }

  return { ok: false, error: 'output_too_large' };
}
