import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { loadSettingNumber, loadSettingText } from '@/lib/settings';
import { createServiceClient } from '@/lib/supabase/service';
import { ROLE_EVIDENCE_BUCKET } from '@/lib/storage';

export interface PreparedCoachEvidence {
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  bytes: Uint8Array;
}

const IMAGE_FORMAT_TO_MIME: Readonly<Record<string, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function safeOriginalName(name: string): string {
  return name.replace(/[\u0000-\u001f\\/]/g, '_').slice(0, 255) || 'evidence';
}

async function decodeAndNormalize(
  file: File,
): Promise<{ bytes: Uint8Array; mime: string; ext: string }> {
  const source = Buffer.from(await file.arrayBuffer());
  if (file.type === 'application/pdf') {
    if (!source.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new Error('PDF signature mismatch.');
    const pdf = await PDFDocument.load(source, { ignoreEncryption: false, updateMetadata: false });
    if (pdf.getPageCount() < 1) throw new Error('PDF has no readable pages.');
    return { bytes: source, mime: 'application/pdf', ext: 'pdf' };
  }

  const image = sharp(source, { failOn: 'error', limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();
  const detected = metadata.format ? IMAGE_FORMAT_TO_MIME[metadata.format] : undefined;
  if (!detected || detected !== file.type)
    throw new Error('Image content does not match its file type.');
  const normalized = await image
    .rotate()
    .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 86 })
    .toBuffer();
  return { bytes: normalized, mime: 'image/webp', ext: 'webp' };
}

/** Validate content, decode it, strip image metadata, and generate an unguessable private path. */
export async function prepareCoachEvidence(
  files: File[],
  userId: string,
  applicationId: string,
): Promise<PreparedCoachEvidence[]> {
  const [maxFiles, maxBytes, allowedCsv] = await Promise.all([
    loadSettingNumber('coach_evidence_max_files', 5),
    loadSettingNumber('coach_evidence_max_bytes', 5 * 1024 * 1024),
    loadSettingText(
      'coach_evidence_allowed_mime_types',
      'image/jpeg,image/png,image/webp,application/pdf',
    ),
  ]);
  const allowed = new Set(
    allowedCsv
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  );
  if (files.length > maxFiles) throw new Error(`Attach no more than ${maxFiles} evidence files.`);

  const prepared: PreparedCoachEvidence[] = [];
  for (const file of files) {
    if (!allowed.has(file.type))
      throw new Error(`${safeOriginalName(file.name)} has an unsupported file type.`);
    if (file.size <= 0 || file.size > maxBytes) {
      throw new Error(
        `${safeOriginalName(file.name)} must be ${Math.floor(maxBytes / 1048576)} MB or smaller.`,
      );
    }
    let decoded: { bytes: Uint8Array; mime: string; ext: string };
    try {
      decoded = await decodeAndNormalize(file);
    } catch {
      throw new Error(
        `${safeOriginalName(file.name)} could not be decoded as a valid ${file.type === 'application/pdf' ? 'PDF' : 'image'}.`,
      );
    }
    if (decoded.bytes.byteLength > maxBytes) {
      throw new Error(`${safeOriginalName(file.name)} is still too large after safe processing.`);
    }
    prepared.push({
      storagePath: `${userId}/${applicationId}/${randomUUID()}.${decoded.ext}`,
      originalFilename: safeOriginalName(file.name),
      mimeType: decoded.mime,
      sizeBytes: decoded.bytes.byteLength,
      sha256: createHash('sha256').update(decoded.bytes).digest('hex'),
      bytes: decoded.bytes,
    });
  }
  return prepared;
}

/** Daily bounded retention cleanup. Metadata is retained; private objects are irreversibly removed. */
export async function purgeExpiredCoachEvidence(): Promise<number> {
  const db = createServiceClient();
  const { data } = await db
    .from('role_application_evidence')
    .select('id, storage_path')
    .is('deleted_at', null)
    .lte('delete_after', new Date().toISOString())
    .order('delete_after')
    .limit(100);
  const rows = (data ?? []) as { id: string; storage_path: string }[];
  if (!rows.length) return 0;
  const { error } = await db.storage
    .from(ROLE_EVIDENCE_BUCKET)
    .remove(rows.map((row) => row.storage_path));
  if (error) return 0;
  await db
    .from('role_application_evidence')
    .update({ deleted_at: new Date().toISOString() })
    .in(
      'id',
      rows.map((row) => row.id),
    );
  return rows.length;
}
