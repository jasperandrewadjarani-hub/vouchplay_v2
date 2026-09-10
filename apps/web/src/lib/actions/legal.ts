'use server';

import { revalidatePath } from 'next/cache';
import { LEGAL } from '@vouchplay/config';
import { createClient } from '@/lib/supabase/server';

/**
 * Records that the signed-in player has accepted the current Terms of Service and Privacy Policy
 * (master_plan §2R). Stamps the version + timestamp on their own profile row (RLS: self-update).
 * Called from the consent gate, which only shows once migration 0032 has added the columns, so this
 * assumes they exist; any failure is surfaced so the gate can show a retry rather than silently
 * passing someone through without a recorded acceptance.
 */
export async function acceptCurrentLegalTerms(): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Please sign in again.' };

    const { error } = await supabase
      .from('profiles')
      .update({
        terms_accepted_version: LEGAL.version,
        terms_accepted_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) return { ok: false, error: 'Could not record your acceptance. Please try again.' };

    // Clear the gate on every route by refreshing the app shell's server render.
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not record your acceptance. Please try again.' };
  }
}
