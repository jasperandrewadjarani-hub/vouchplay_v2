import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { TOURNAMENT_COVER_OUTPUT_MAX_BYTES } from '@vouchplay/core';
import { prepareTournamentCover, type TournamentCoverSource } from './cover-image';

function sourceFrom(bytes: Uint8Array, type: string): TournamentCoverSource {
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

describe('prepareTournamentCover', () => {
  it('normalizes a large valid source to a bounded WebP cover', async () => {
    const width = 1280;
    const height = 960;
    const pixels = Buffer.alloc(width * height * 3);
    let seed = 123_456_789;
    for (let index = 0; index < pixels.length; index += 1) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      pixels[index] = seed & 255;
    }
    const source = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
      .toBuffer();
    expect(source.byteLength).toBeGreaterThan(2 * 1024 * 1024);
    expect(source.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024);

    const result = await prepareTournamentCover(sourceFrom(source, 'image/jpeg'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeLessThanOrEqual(1600);
    expect(metadata.height).toBeLessThanOrEqual(900);
    expect(result.bytes.byteLength).toBeLessThanOrEqual(TOURNAMENT_COVER_OUTPUT_MAX_BYTES);
  });

  it('returns an actionable error for bytes that are not a decodable image', async () => {
    const result = await prepareTournamentCover(sourceFrom(new Uint8Array([1, 2, 3]), 'image/png'));
    expect(result).toEqual({
      ok: false,
      error: 'This image could not be read. Try another PNG, JPG, or WebP file.',
    });
  });
});
