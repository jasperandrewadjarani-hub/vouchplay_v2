import { publicEnv } from '@/lib/env';

/** Public bucket that holds profile avatars (handover §38; created in migration 0003). */
export const AVATARS_BUCKET = 'avatars';

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
