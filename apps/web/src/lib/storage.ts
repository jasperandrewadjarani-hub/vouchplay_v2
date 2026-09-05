import { publicEnv } from '@/lib/env';

/** Public bucket that holds profile avatars (handover §38; created in migration 0003). */
export const AVATARS_BUCKET = 'avatars';

/** PRIVATE bucket for payment proof (handover §38; created in migration 0009). Access via signed URLs only. */
export const PAYMENT_PROOFS_BUCKET = 'payment-proofs';

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
