'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { onboardingSchema } from '@vouchplay/validation';
import { LEGAL } from '@vouchplay/config';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { safeNext } from '@/lib/auth';
import { AVATARS_BUCKET } from '@/lib/storage';
import { PLAYERS_LIST_TAG, playerTag } from '@/lib/players/queries';
import { AVATAR_IMAGE_PROFILE, normalizeUploadedImage } from '@/lib/images/normalize-upload-image';

type AvatarUploadResult = { path?: string; error?: string };

function isGeneratedAvatarPath(userId: string, path: string | null | undefined): path is string {
  return !!path && path.startsWith(`${userId}/avatar-`) && path.endsWith('.webp');
}

async function cleanupGeneratedAvatar(userId: string, path: string | null | undefined) {
  if (!isGeneratedAvatarPath(userId, path)) return;
  try {
    await createServiceClient().storage.from(AVATARS_BUCKET).remove([path]);
  } catch {
    // Best effort only: cleanup never overturns a successful profile save.
  }
}

/**
 * Upload an avatar for `userId` to the public `avatars` bucket via the service client. The path is
 * keyed to the user's own id (authorization: the caller already verified this is that user), so a
 * user can only ever write their own avatar. Stored media is always bounded, metadata-free WebP.
 */
async function uploadAvatar(userId: string, file: File): Promise<AvatarUploadResult> {
  const prepared = await normalizeUploadedImage(file, AVATAR_IMAGE_PROFILE);
  if (!prepared.ok) {
    return {
      error:
        prepared.error === 'source_too_large'
          ? 'Profile photo must be 2 MB or smaller.'
          : 'Profile photo could not be read. Use a valid PNG, JPG, or WebP image.',
    };
  }
  try {
    const path = `${userId}/avatar-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.webp`;
    const svc = createServiceClient();
    const { error } = await svc.storage.from(AVATARS_BUCKET).upload(path, prepared.bytes, {
      contentType: prepared.mimeType,
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) return { error: 'Profile photo could not be uploaded. Please try again.' };
    return { path };
  } catch {
    return { error: 'Profile photo could not be uploaded. Please try again.' };
  }
}

export interface ProfileFormState {
  error?: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

/** Completes profile onboarding for the signed-in user (handover §7.3). */
export async function completeOnboarding(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const parsed = onboardingSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    nickname: formData.get('nickname'),
    sex: formData.get('sex'),
    selfRatedSkill: formData.get('selfRatedSkill'),
    city: formData.get('city'),
    facebookUrl: formData.get('facebookUrl') ?? '',
    bio: formData.get('bio') ?? '',
    lookingForPartner: formData.get('lookingForPartner') === 'on',
    openForSponsorship: formData.get('openForSponsorship') === 'on',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check your input.' };

  const v = parsed.data;
  const next = safeNext(formData.get('next') as string | null);
  let savedSlug: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const base = slugify(v.nickname) || slugify(`${v.firstName}-${v.lastName}`) || 'player';
    const slug = `${base}-${crypto.randomUUID().slice(0, 6)}`;

    const avatarFile = formData.get('avatar');
    const avatarUpload =
      avatarFile instanceof File && avatarFile.size > 0
        ? await uploadAvatar(user!.id, avatarFile)
        : {};
    if (avatarUpload.error) return { error: avatarUpload.error };
    const avatarPath = avatarUpload.path;

    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: v.firstName,
        last_name: v.lastName,
        nickname: v.nickname,
        sex: v.sex,
        self_rated_skill: v.selfRatedSkill,
        city: v.city,
        facebook_url: v.facebookUrl ? v.facebookUrl : null,
        bio: v.bio ? v.bio : null,
        looking_for_partner: v.lookingForPartner,
        open_for_sponsorship: v.openForSponsorship,
        slug,
        ...(avatarPath ? { avatar_path: avatarPath } : {}),
        onboarded_at: new Date().toISOString(),
      })
      .eq('id', user!.id);

    if (error) {
      await cleanupGeneratedAvatar(user!.id, avatarPath);
      return { error: 'Could not save your profile. Please try again.' };
    }
    savedSlug = slug;

    // Record the Terms/Privacy consent the player gave at signup (§2R) so they are not shown the
    // in-app gate right after onboarding. Its own try/catch: if migration 0032 is not applied yet
    // this no-ops and the fail-open gate simply catches them on their next visit instead.
    try {
      await supabase
        .from('profiles')
        .update({
          terms_accepted_version: LEGAL.version,
          terms_accepted_at: new Date().toISOString(),
        })
        .eq('id', user!.id);
    } catch {
      /* gate will catch them once the column exists */
    }
  } catch {
    return { error: 'Profile setup is not available yet. Please try again shortly.' };
  }

  // A new/updated public profile changes the directory and this player's page (§34A tag invalidation).
  revalidateTag(PLAYERS_LIST_TAG);
  if (savedSlug) revalidateTag(playerTag(savedSlug));

  redirect(next ?? '/');
}

/** Updates the signed-in player's editable profile fields without changing their stable slug. */
export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const parsed = onboardingSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    nickname: formData.get('nickname'),
    sex: formData.get('sex'),
    selfRatedSkill: formData.get('selfRatedSkill'),
    city: formData.get('city'),
    facebookUrl: formData.get('facebookUrl') ?? '',
    bio: formData.get('bio') ?? '',
    lookingForPartner: formData.get('lookingForPartner') === 'on',
    openForSponsorship: formData.get('openForSponsorship') === 'on',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check your input.' };
  }

  let savedSlug: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'Please sign in again.' };

    const { data: current } = await supabase
      .from('profiles')
      .select('slug, onboarded_at, avatar_path')
      .eq('id', user.id)
      .maybeSingle();
    if (!(current as { onboarded_at: string | null } | null)?.onboarded_at) {
      return { error: 'Complete your profile setup before editing it.' };
    }

    const avatarFile = formData.get('avatar');
    const avatarUpload =
      avatarFile instanceof File && avatarFile.size > 0
        ? await uploadAvatar(user.id, avatarFile)
        : {};
    if (avatarUpload.error) return { error: avatarUpload.error };
    const avatarPath = avatarUpload.path;
    const v = parsed.data;
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: v.firstName,
        last_name: v.lastName,
        nickname: v.nickname,
        sex: v.sex,
        self_rated_skill: v.selfRatedSkill,
        city: v.city,
        facebook_url: v.facebookUrl || null,
        bio: v.bio || null,
        looking_for_partner: v.lookingForPartner,
        open_for_sponsorship: v.openForSponsorship,
        ...(avatarPath ? { avatar_path: avatarPath } : {}),
      })
      .eq('id', user.id);
    if (error) {
      await cleanupGeneratedAvatar(user.id, avatarPath);
      return { error: 'Could not save your profile. Please try again.' };
    }
    const currentRow = current as { slug: string | null; avatar_path: string | null };
    if (avatarPath) await cleanupGeneratedAvatar(user.id, currentRow.avatar_path);
    savedSlug = currentRow.slug;
  } catch {
    return { error: 'Profile editing is temporarily unavailable. Please try again shortly.' };
  }

  revalidateTag(PLAYERS_LIST_TAG);
  if (savedSlug) revalidateTag(playerTag(savedSlug));
  redirect('/me?profile=updated');
}

type AvailabilityResult = { ok?: boolean; error?: string; value?: boolean };

/**
 * Shared writer for the one-column availability flags (master_plan §2M/§2N). A focused write behind
 * the inline toggles on the Players tab and the tournament, so a player can flag themselves in the
 * moment without opening Edit profile. Writes one whitelisted column, revalidates the directory and
 * the player's own page, and returns fast so the optimistic switch settles quickly. Same columns the
 * filter and badges use, so every surface stays in sync.
 */
async function setAvailabilityFlag(
  column: 'looking_for_partner' | 'open_for_sponsorship',
  value: boolean,
): Promise<AvailabilityResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'Please sign in.' };

    const { data: current } = await supabase
      .from('profiles')
      .select('slug, onboarded_at')
      .eq('id', user.id)
      .maybeSingle();
    const row = current as { slug: string | null; onboarded_at: string | null } | null;
    if (!row?.onboarded_at) return { error: 'Finish setting up your profile first.' };

    const { error } = await supabase
      .from('profiles')
      .update({ [column]: value })
      .eq('id', user.id);
    if (error) return { error: 'Could not update your status. Please try again.' };

    revalidateTag(PLAYERS_LIST_TAG);
    if (row.slug) revalidateTag(playerTag(row.slug));
    return { ok: true, value };
  } catch {
    return { error: 'That is temporarily unavailable. Please try again shortly.' };
  }
}

export async function setLookingForPartner(value: boolean): Promise<AvailabilityResult> {
  return setAvailabilityFlag('looking_for_partner', value);
}

export async function setOpenForSponsorship(value: boolean): Promise<AvailabilityResult> {
  return setAvailabilityFlag('open_for_sponsorship', value);
}
