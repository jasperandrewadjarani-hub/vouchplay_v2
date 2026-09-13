import { publicEnv } from '@/lib/env';

/** Public bucket that holds profile avatars (handover §38; created in migration 0003). */
export const AVATARS_BUCKET = 'avatars';

/** PRIVATE bucket for payment proof (handover §38; created in migration 0009). Access via signed URLs only. */
export const PAYMENT_PROOFS_BUCKET = 'payment-proofs';

/** PRIVATE Coach application evidence. Access is service-side and AAL2 signed-URL only. */
export const ROLE_EVIDENCE_BUCKET = 'role-evidence';

/**
 * PRIVATE identity-verification document bucket (handover §13.3, §38; master_plan §2AG Phase C;
 * created in migration 0036). Never a public URL - staff-only 5-minute signed URLs, and the object
 * is deleted the moment a reviewer decides (approve or reject).
 */
export const IDENTITY_DOCS_BUCKET = 'identity-docs';

/**
 * Resolve a stored avatar path to a public URL. Avatars live in a PUBLIC bucket, so the URL is
 * derived without a network call. Returns null when there is no avatar (caller renders initials).
 * A value that is already an absolute URL (e.g. a Google profile photo) is returned unchanged.
 */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = publicEnv.supabaseUrl.replace(/\/$/, '');
  const clean = path.replace(/^\/+/, '');
  return `${base}/storage/v1/object/public/${AVATARS_BUCKET}/${clean}`;
}

/**
 * Rewrite a resolved avatar/public-object URL into a small, server-resized thumbnail (Supabase
 * Storage image transformation) to cut egress: a full-size phone-photo upload is downloaded once at
 * ~160px instead of at its original resolution to render a 40-80px circle (master_plan §2AV egress
 * follow-up - a sample avatar dropped from 36KB to 5KB). Only OUR public Storage object URLs are
 * rewritten (`/object/public/` -> `/render/image/public/`); an external absolute URL (e.g. a Google
 * profile photo) is returned unchanged, and a null stays null. `px` is the target square size in CSS
 * pixels; callers pass ~2x their display size so it stays crisp on high-density screens.
 */
export function avatarThumb(url: string | null | undefined, px: number): string | null {
  if (!url) return null;
  const marker = '/storage/v1/object/public/';
  const i = url.indexOf(marker);
  if (i === -1) return url;
  const base = url.slice(0, i);
  const objectPath = url.slice(i + marker.length);
  const size = Math.max(16, Math.round(px));
  return `${base}/storage/v1/render/image/public/${objectPath}?width=${size}&height=${size}&resize=cover&quality=70`;
}

/**
 * Club logos live in the same PUBLIC `avatars` bucket under a `club-logos/` prefix (no new bucket
 * needed; writes go through the service client which bypasses storage RLS). Same public-URL rules.
 */
export function clubLogoUrl(path: string | null | undefined): string | null {
  return avatarUrl(path);
}

/** Tournament covers live in the public `avatars` bucket under a `tournament-covers/` prefix. */
export function tournamentCoverUrl(path: string | null | undefined): string | null {
  return avatarUrl(path);
}

/** Up-to-two-letter initials from a display name, for the avatar fallback. */
export function nameInitials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
