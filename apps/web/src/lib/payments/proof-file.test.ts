import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { PAYMENT_PROOF_IMAGE_PROFILE } from '../images/normalize-upload-image';
import { preparePaymentProof, type PaymentProofSource } from './proof-file';

function sourceFrom(bytes: Uint8Array, type: string): PaymentProofSource {
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

describe('preparePaymentProof', () => {
  it('normalizes an image proof into the bounded private WebP profile', async () => {
    const image = await sharp({
      create: { width: 2600, height: 1800, channels: 3, background: '#fafafa' },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    const result = await preparePaymentProof(sourceFrom(image, 'image/jpeg'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mimeType).toBe('image/webp');
    expect(result.bytes.byteLength).toBeLessThanOrEqual(PAYMENT_PROOF_IMAGE_PROFILE.maxOutputBytes);
  });

  it('keeps a readable PDF private and unchanged', async () => {
    const document = await PDFDocument.create();
    document.addPage([100, 100]);
    const pdf = await document.save();
    const result = await preparePaymentProof(sourceFrom(pdf, 'application/pdf'));
    expect(result).toEqual({
      ok: true,
      bytes: expect.any(Uint8Array),
      mimeType: 'application/pdf',
      extension: 'pdf',
    });
  });

  it('rejects invalid PDFs', async () => {
    await expect(
      preparePaymentProof(sourceFrom(new Uint8Array([1, 2, 3]), 'application/pdf')),
    ).resolves.toEqual({ ok: false, error: 'invalid_pdf' });
  });
});
