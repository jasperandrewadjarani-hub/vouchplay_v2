import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  AVATAR_IMAGE_PROFILE,
  CLUB_LOGO_IMAGE_PROFILE,
  normalizeUploadedImage,
  type ImageUploadSource,
} from './normalize-upload-image';

function sourceFrom(bytes: Uint8Array, type: string): ImageUploadSource {
  return {
    type,
    size: bytes.byteLength,
    arrayBuffer: async () => {
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      return copy;
    },
  };
}

describe('normalizeUploadedImage', () => {
  it('re-encodes a public upload as bounded metadata-free WebP without enlargement', async () => {
    const source = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: '#0875e1' },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'private upload metadata' } } })
      .jpeg({ quality: 92 })
      .toBuffer();

    const result = await normalizeUploadedImage(
      sourceFrom(source, 'image/jpeg'),
      AVATAR_IMAGE_PROFILE,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const metadata = await sharp(result.bytes).metadata();
    expect(result.mimeType).toBe('image/webp');
    expect(result.bytes.byteLength).toBeLessThanOrEqual(AVATAR_IMAGE_PROFILE.maxOutputBytes);
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeLessThanOrEqual(512);
    expect(metadata.height).toBeLessThanOrEqual(512);
    expect(metadata.exif).toBeUndefined();
  });

  it('keeps a small source at its native dimensions', async () => {
    const source = await sharp({
      create: { width: 64, height: 48, channels: 4, background: '#ffffff00' },
    })
      .png()
      .toBuffer();
    const result = await normalizeUploadedImage(
      sourceFrom(source, 'image/png'),
      CLUB_LOGO_IMAGE_PROFILE,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.width).toBe(64);
    expect(metadata.height).toBe(48);
  });

  it('rejects unreadable bytes and a declared MIME mismatch', async () => {
    await expect(
      normalizeUploadedImage(
        sourceFrom(new Uint8Array([1, 2, 3]), 'image/png'),
        AVATAR_IMAGE_PROFILE,
      ),
    ).resolves.toEqual({ ok: false, error: 'invalid_image' });

    const jpeg = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .toBuffer();
    await expect(
      normalizeUploadedImage(sourceFrom(jpeg, 'image/png'), AVATAR_IMAGE_PROFILE),
    ).resolves.toEqual({ ok: false, error: 'invalid_image' });
  });
});
