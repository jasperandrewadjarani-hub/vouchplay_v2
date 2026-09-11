import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { ID_DOCUMENT_IMAGE_PROFILE } from '../images/normalize-upload-image';
import { prepareIdentityDocument, type IdentityDocumentSource } from './prepare-identity-document';

function sourceFrom(bytes: Uint8Array, type: string): IdentityDocumentSource {
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

describe('prepareIdentityDocument', () => {
  it('normalizes an image document into the bounded private WebP profile', async () => {
    const image = await sharp({
      create: { width: 2600, height: 1800, channels: 3, background: '#fafafa' },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    const result = await prepareIdentityDocument(sourceFrom(image, 'image/jpeg'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mimeType).toBe('image/webp');
    expect(result.bytes.byteLength).toBeLessThanOrEqual(ID_DOCUMENT_IMAGE_PROFILE.maxOutputBytes);
  });

  it('keeps a readable PDF private and unchanged', async () => {
    const document = await PDFDocument.create();
    document.addPage([100, 100]);
    const pdf = await document.save();
    const result = await prepareIdentityDocument(sourceFrom(pdf, 'application/pdf'));
    expect(result).toEqual({
      ok: true,
      bytes: expect.any(Uint8Array),
      mimeType: 'application/pdf',
      extension: 'pdf',
    });
  });

  it('rejects invalid PDFs', async () => {
    await expect(
      prepareIdentityDocument(sourceFrom(new Uint8Array([1, 2, 3]), 'application/pdf')),
    ).resolves.toEqual({ ok: false, error: 'invalid_pdf' });
  });

  it('rejects a file over the 5MB cap', async () => {
    const oversized = {
      type: 'image/jpeg',
      size: 6 * 1024 * 1024,
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    await expect(prepareIdentityDocument(oversized)).resolves.toEqual({
      ok: false,
      error: 'too_large',
    });
  });

  it('rejects an empty file', async () => {
    const empty = { type: 'image/jpeg', size: 0, arrayBuffer: async () => new ArrayBuffer(0) };
    await expect(prepareIdentityDocument(empty)).resolves.toEqual({ ok: false, error: 'empty' });
  });
});
