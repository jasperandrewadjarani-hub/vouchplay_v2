'use server';

import { revalidatePath } from 'next/cache';
import { supportTicketSchema } from '@vouchplay/validation';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import type { SafetyActionState } from './report';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Submit a support ticket / appeal (handover §36.38, §47 — appeal/support path for material account
 * actions). Suspended and banned users can still file an appeal here. Rate-limited to curb spam.
 */
export async function submitSupportTicket(
  _prev: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in to contact support.' };

  const parsed = supportTicketSchema.safeParse({
    category: formData.get('category'),
    subject: formData.get('subject') ?? '',
    body: formData.get('body') ?? '',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const t = parsed.data;

  const svc = createServiceClient();
  const since = new Date(Date.now() - DAY_MS).toISOString();
  try {
    const { count } = await svc
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since);
    if ((count ?? 0) >= 10) {
      return {
        error: "You've submitted several requests recently. Please wait before adding more.",
      };
    }
    const { error } = await svc.from('support_tickets').insert({
      user_id: user.id,
      category: t.category,
      subject: t.subject.trim(),
      body: t.body.trim(),
    });
    if (error) return { error: 'Could not submit your request. Please try again.' };
  } catch {
    return { error: 'Support is temporarily unavailable. Please try again shortly.' };
  }
  revalidatePath('/me/support');
  return { ok: true, message: 'Request submitted. Our team will get back to you.' };
}
