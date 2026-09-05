'use server';

import { redirect } from 'next/navigation';
import { onboardingSchema } from '@vouchplay/validation';
import { createClient } from '@/lib/supabase/server';

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
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check your input.' };

  const v = parsed.data;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const base = slugify(v.nickname) || slugify(`${v.firstName}-${v.lastName}`) || 'player';
    const slug = `${base}-${crypto.randomUUID().slice(0, 6)}`;

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
        slug,
        onboarded_at: new Date().toISOString(),
      })
      .eq('id', user!.id);

    if (error) return { error: 'Could not save your profile. Please try again.' };
  } catch {
    return { error: 'Profile setup is not available yet. Please try again shortly.' };
  }

  redirect('/');
}
