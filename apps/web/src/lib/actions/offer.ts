'use server';

import { revalidateTag } from 'next/cache';
import { offerCreateSchema, offerResponseSchema } from '@vouchplay/validation';
import type { ClubOfferRow, ClubOfferResponseRow, ClubRole } from '@vouchplay/db';
import {
  canChangeOfferStatus,
  canChangeResponseStatus,
  isOfferPubliclyVisible,
} from '@vouchplay/core';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { loadSettingFlag, loadSettingNumber } from '@/lib/settings';
import { checkActorCanInteract } from '@/lib/moderation/enforcement';
import { writeAudit } from '@/lib/moderation/audit';
import { notify, notifyMany } from '@/lib/notifications/create';
import { getActorMini, getClubManagerIds } from '@/lib/notifications/recipients';
import { CLUBS_LIST_TAG, clubTag } from '@/lib/clubs/queries';
import { OFFERS_LIST_TAG, clubOffersTag } from '@/lib/offers/queries';

export interface OfferActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Caller's active club role (owner/admin gate). */
async function managerRole(userId: string, clubId: string): Promise<ClubRole | null> {
  const { data } = await createServiceClient()
    .from('club_memberships')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  const role = (data as { role: ClubRole } | null)?.role ?? null;
  return role === 'owner' || role === 'admin' ? role : null;
}

async function clubIsPublishable(clubId: string): Promise<{ ok: boolean; slug: string | null }> {
  const { data } = await createServiceClient()
    .from('clubs')
    .select('slug, verification_status, activity_status, deleted_at')
    .eq('id', clubId)
    .maybeSingle();
  const c = data as {
    slug: string | null;
    verification_status: string;
    activity_status: string;
    deleted_at: string | null;
  } | null;
  const ok =
    !!c && c.verification_status === 'verified' && c.activity_status === 'active' && !c.deleted_at;
  return { ok, slug: c?.slug ?? null };
}

function invalidate(clubId: string, clubSlug: string | null) {
  revalidateTag(OFFERS_LIST_TAG);
  revalidateTag(clubOffersTag(clubId));
  revalidateTag(CLUBS_LIST_TAG);
  if (clubSlug) revalidateTag(clubTag(clubSlug));
}

// ---------------------------------------------------------------------------
// Club-side: create / publish / close / cancel
// ---------------------------------------------------------------------------
export async function createOffer(
  clubId: string,
  _prev: OfferActionState,
  formData: FormData,
): Promise<OfferActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await loadSettingFlag('recruitment_enabled', true)))
    return { error: 'Club offers are currently unavailable.' };
  if (!(await managerRole(user.id, clubId)))
    return { error: 'Only a club owner or admin can create offers.' };
  const publishable = await clubIsPublishable(clubId);
  if (!publishable.ok) return { error: 'Your club must be verified and active to publish offers.' };

  const parsed = offerCreateSchema.safeParse({
    type: formData.get('type') ?? 'recruitment',
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    city: formData.get('city') ?? '',
    minSkill: formData.get('minSkill') || undefined,
    maxSkill: formData.get('maxSkill') || undefined,
    expiresInDays: formData.get('expiresInDays') || undefined,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const v = parsed.data;

  const limit = await loadSettingNumber('club_offers_per_24h', 10);
  if (limit > 0) {
    const since = new Date(Date.now() - DAY_MS).toISOString();
    const { count } = await createServiceClient()
      .from('club_offers')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', clubId)
      .gte('created_at', since);
    if ((count ?? 0) >= limit)
      return { error: 'This club has reached its daily offer limit. Try again tomorrow.' };
  }

  try {
    const { data, error } = await createServiceClient()
      .from('club_offers')
      .insert({
        club_id: clubId,
        type: v.type,
        title: v.title,
        description: v.description || null,
        city: v.city || null,
        min_skill: v.minSkill ?? null,
        max_skill: v.maxSkill ?? null,
        status: 'draft',
        created_by: user.id,
      })
      .select('id')
      .single();
    if (error || !data) return { error: 'Could not create the offer. Please try again.' };
    await writeAudit({
      actorId: user.id,
      actorRole: 'club_manager',
      action: 'club_offer_created',
      entityType: 'club_offer',
      entityId: (data as { id: string }).id,
      after: { club_id: clubId, type: v.type, status: 'draft' },
    });
    invalidate(clubId, publishable.slug);
  } catch {
    return { error: 'Offers are temporarily unavailable.' };
  }
  return { ok: true, message: 'Draft offer created. Publish it when you are ready.' };
}

async function loadOffer(offerId: string): Promise<ClubOfferRow | null> {
  const { data } = await createServiceClient()
    .from('club_offers')
    .select(
      'id, club_id, type, title, description, city, min_skill, max_skill, status, published_at, expires_at, closed_reason, created_by, created_at, updated_at',
    )
    .eq('id', offerId)
    .maybeSingle();
  return (data as ClubOfferRow | null) ?? null;
}

async function transitionOffer(
  offerId: string,
  next: 'open' | 'closed' | 'cancelled',
  reason: string | null,
): Promise<OfferActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const offer = await loadOffer(offerId);
  if (!offer) return { error: 'That offer could not be found.' };
  if (!(await managerRole(user.id, offer.club_id)))
    return { error: 'Only a club owner or admin can change offers.' };
  if (!canChangeOfferStatus(offer.status, next))
    return { error: 'That change is not allowed for this offer.' };

  const patch: Record<string, unknown> = { status: next };
  if (next === 'open') {
    const publishable = await clubIsPublishable(offer.club_id);
    if (!publishable.ok)
      return { error: 'Your club must be verified and active to publish offers.' };
    const days = await loadSettingNumber('offer_default_expiry_days', 30);
    patch.published_at = new Date().toISOString();
    patch.expires_at = new Date(Date.now() + days * DAY_MS).toISOString();
  }
  if (next === 'closed' || next === 'cancelled') patch.closed_reason = reason;

  try {
    const { error } = await createServiceClient()
      .from('club_offers')
      .update(patch)
      .eq('id', offerId);
    if (error) return { error: 'Could not update the offer. Please try again.' };
    await writeAudit({
      actorId: user.id,
      actorRole: 'club_manager',
      action: `club_offer_${next}`,
      entityType: 'club_offer',
      entityId: offerId,
      before: { status: offer.status },
      after: { status: next },
      reason,
    });
    const { slug } = await clubIsPublishable(offer.club_id);
    invalidate(offer.club_id, slug);
  } catch {
    return { error: 'Offers are temporarily unavailable.' };
  }
  const label = next === 'open' ? 'published' : next;
  return { ok: true, message: `Offer ${label}.` };
}

export async function publishOffer(offerId: string): Promise<OfferActionState> {
  return transitionOffer(offerId, 'open', null);
}
export async function closeOffer(offerId: string, reason?: string): Promise<OfferActionState> {
  return transitionOffer(offerId, 'closed', reason?.trim() || null);
}
export async function cancelOffer(offerId: string, reason?: string): Promise<OfferActionState> {
  return transitionOffer(offerId, 'cancelled', reason?.trim() || null);
}

// ---------------------------------------------------------------------------
// Player-side: opt-in, respond, withdraw
// ---------------------------------------------------------------------------
export async function setOpportunityOptIn(optIn: boolean): Promise<OfferActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  try {
    const { error } = await createServiceClient()
      .from('profiles')
      .update({ open_for_sponsorship: optIn })
      .eq('id', user.id);
    if (error) return { error: 'Could not update your preference.' };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return {
    ok: true,
    message: optIn
      ? 'You are now open to club opportunities.'
      : 'You have opted out of opportunities.',
  };
}

export async function respondToOffer(
  offerId: string,
  _prev: OfferActionState,
  formData: FormData,
): Promise<OfferActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const statusErr = await checkActorCanInteract(user.id);
  if (statusErr) return { error: statusErr };
  if (!(await loadSettingFlag('recruitment_enabled', true)))
    return { error: 'Club offers are currently unavailable.' };

  const svc = createServiceClient();
  const { data: profileRow } = await svc
    .from('profiles')
    .select('open_for_sponsorship')
    .eq('id', user.id)
    .maybeSingle();
  if (!(profileRow as { open_for_sponsorship: boolean } | null)?.open_for_sponsorship)
    return { error: 'Turn on "open to opportunities" before responding.' };

  const offer = await loadOffer(offerId);
  if (!offer || !isOfferPubliclyVisible(offer.status, offer.expires_at))
    return { error: 'This offer is no longer open.' };

  const parsed = offerResponseSchema.safeParse({ message: formData.get('message') ?? '' });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check your message.' };

  const limit = await loadSettingNumber('offer_responses_per_24h', 20);
  if (limit > 0) {
    const since = new Date(Date.now() - DAY_MS).toISOString();
    const { count } = await svc
      .from('club_offer_responses')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', user.id)
      .gte('created_at', since);
    if ((count ?? 0) >= limit)
      return { error: 'You have reached your daily response limit. Try again tomorrow.' };
  }

  try {
    const { data, error } = await svc
      .from('club_offer_responses')
      .insert({
        offer_id: offerId,
        player_id: user.id,
        status: 'submitted',
        message: parsed.data.message || null,
      })
      .select('id')
      .single();
    if (error) {
      // The partial unique index rejects a second live response.
      if (error.code === '23505') return { error: 'You have already responded to this offer.' };
      return { error: 'Could not send your response. Please try again.' };
    }
    await writeAudit({
      actorId: user.id,
      actorRole: 'player',
      action: 'club_offer_response_submitted',
      entityType: 'club_offer_response',
      entityId: (data as { id: string }).id,
      after: { offer_id: offerId, status: 'submitted' },
    });
    const [managers, me] = await Promise.all([
      getClubManagerIds(offer.club_id),
      getActorMini(user.id),
    ]);
    await notifyMany(managers, {
      type: 'offer_response_received',
      actorId: user.id,
      params: { actorName: me.name, offerTitle: offer.title },
      link: `/clubs`,
      entityType: 'club_offer',
      entityId: offerId,
    });
    invalidate(offer.club_id, null);
  } catch {
    return { error: 'Responses are temporarily unavailable.' };
  }
  return { ok: true, message: 'Your response was sent to the club.' };
}

export async function withdrawResponse(responseId: string): Promise<OfferActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  const { data } = await svc
    .from('club_offer_responses')
    .select('id, player_id, status, offer_id')
    .eq('id', responseId)
    .maybeSingle();
  const resp = data as Pick<
    ClubOfferResponseRow,
    'id' | 'player_id' | 'status' | 'offer_id'
  > | null;
  if (!resp || resp.player_id !== user.id) return { error: 'That response could not be found.' };
  if (!canChangeResponseStatus(resp.status, 'withdrawn'))
    return { error: 'This response can no longer be withdrawn.' };
  try {
    const { error } = await svc
      .from('club_offer_responses')
      .update({ status: 'withdrawn' })
      .eq('id', responseId);
    if (error) return { error: 'Could not withdraw your response.' };
    await writeAudit({
      actorId: user.id,
      actorRole: 'player',
      action: 'club_offer_response_withdrawn',
      entityType: 'club_offer_response',
      entityId: responseId,
      before: { status: resp.status },
      after: { status: 'withdrawn' },
    });
    revalidateTag(OFFERS_LIST_TAG);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Response withdrawn.' };
}

// ---------------------------------------------------------------------------
// Club-side: decide a response
// ---------------------------------------------------------------------------
export async function decideResponse(
  responseId: string,
  accept: boolean,
): Promise<OfferActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  const { data } = await svc
    .from('club_offer_responses')
    .select('id, player_id, status, offer_id')
    .eq('id', responseId)
    .maybeSingle();
  const resp = data as Pick<
    ClubOfferResponseRow,
    'id' | 'player_id' | 'status' | 'offer_id'
  > | null;
  if (!resp) return { error: 'That response could not be found.' };
  const offer = await loadOffer(resp.offer_id);
  if (!offer) return { error: 'That offer could not be found.' };
  if (!(await managerRole(user.id, offer.club_id)))
    return { error: 'Only a club owner or admin can review responses.' };
  const next = accept ? 'accepted' : 'declined';
  if (!canChangeResponseStatus(resp.status, next))
    return { error: 'This response has already been reviewed.' };

  try {
    const { error } = await svc
      .from('club_offer_responses')
      .update({ status: next, decided_by: user.id, decided_at: new Date().toISOString() })
      .eq('id', responseId);
    if (error) return { error: 'Could not update the response.' };
    await writeAudit({
      actorId: user.id,
      actorRole: 'club_manager',
      action: `club_offer_response_${next}`,
      entityType: 'club_offer_response',
      entityId: responseId,
      before: { status: resp.status },
      after: { status: next },
    });
    const { data: clubRow } = await svc
      .from('clubs')
      .select('name')
      .eq('id', offer.club_id)
      .maybeSingle();
    await notify({
      recipientId: resp.player_id,
      type: accept ? 'offer_response_accepted' : 'offer_response_declined',
      params: {
        clubName: (clubRow as { name: string } | null)?.name ?? undefined,
        offerTitle: offer.title,
      },
      link: '/opportunities',
      entityType: 'club_offer',
      entityId: offer.id,
    });
    invalidate(offer.club_id, null);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: accept ? 'Response accepted.' : 'Response declined.' };
}
