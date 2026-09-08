import { PDFDocument } from 'pdf-lib';
import {
  normalizeUploadedImage,
  PAYMENT_PROOF_IMAGE_PROFILE,
  type ImageUploadSource,
} from '../images/normalize-upload-image';

export type PaymentProofSource = ImageUploadSource;

export type PreparedPaymentProof =
  | {
      ok: true;
      bytes: Uint8Array;
      mimeType: 'image/webp' | 'application/pdf';
      extension: 'webp' | 'pdf';
    }
  | {
      ok: false;
      error: 'empty' | 'too_large' | 'unsupported_type' | 'invalid_image' | 'invalid_pdf';
    };

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

/** Keep documents private and intact; normalize only image proofs to a readable bounded WebP. */
export async function preparePaymentProof(
  source: PaymentProofSource,
): Promise<PreparedPaymentProof> {
  if (!Number.isFinite(source.size) || source.size <= 0) return { ok: false, error: 'empty' };
  if (source.size > MAX_PROOF_BYTES) return { ok: false, error: 'too_large' };

  if (source.type === 'application/pdf') {
    try {
      const bytes = new Uint8Array(await source.arrayBuffer());
      if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
        return { ok: false, error: 'invalid_pdf' };
      }
      const document = await PDFDocument.load(bytes, {
        ignoreEncryption: false,
        updateMetadata: false,
      });
      if (document.getPageCount() < 1) return { ok: false, error: 'invalid_pdf' };
      return { ok: true, bytes, mimeType: 'application/pdf', extension: 'pdf' };
    } catch {
      return { ok: false, error: 'invalid_pdf' };
    }
  }

  const image = await normalizeUploadedImage(source, PAYMENT_PROOF_IMAGE_PROFILE);
  if (!image.ok) {
    return {
      ok: false,
      error:
        image.error === 'empty'
          ? 'empty'
          : image.error === 'source_too_large'
            ? 'too_large'
            : image.error === 'unsupported_type'
              ? 'unsupported_type'
              : 'invalid_image',
    };
  }
  return image;
}
