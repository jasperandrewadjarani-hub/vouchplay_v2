'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { clubCreateSchema, clubUpdateSchema } from '@vouchplay/validation';
import type { ClubRole } from '@vouchplay/db';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { AVATARS_BUCKET } from '@/lib/storage';
import { loadSettingFlag } from '@/lib/settings';
import { CLUBS_LIST_TAG, clubTag, clubMembersTag, userClubsTag } from '@/lib/clubs/queries';

export interface ClubActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const LOGO_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

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

async function uploadClubLogo(clubId: string, file: File): Promise<string | null> {
  const ext = LOGO_MIME_EXT[file.type];
  if (!ext || file.size === 0 || file.size > MAX_LOGO_BYTES) return null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = `club-logos/${clubId}/logo-${Date.now()}.${ext}`;
    const svc = createServiceClient();
    const { error } = await svc.storage
      .from(AVATARS_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: true });
    return error ? null : path;
  } catch {
    return null;
  }
}

/** Returns the caller's active club role, or null (used for manager/owner authz). */
async function myClubRole(userId: string, clubId: string): Promise<ClubRole | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('club_memberships')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  return (data as { role: ClubRole } | null)?.role ?? null;
}

function invalidateClub(slug: string | null, clubId: string) {
  revalidateTag(CLUBS_LIST_TAG);
  if (slug) revalidateTag(clubTag(slug));
  revalidateTag(clubMembersTag(clubId));
}

// ---------------------------------------------------------------------------
// Create (§15.2)
// ---------------------------------------------------------------------------
export async function createClub(
  _prev: ClubActionState,
  formData: FormData,
): Promise<ClubActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in to create a club.' };

  const parsed = clubCreateSchema.safeParse({
    name: formData.get('name'),
    city: formData.get('city') ?? '',
    description: formData.get('description') ?? '',
    privacy: formData.get('privacy') ?? 'public',
    contact: formData.get('contact') ?? '',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const v = parsed.data;

  let newSlug: string | null = null;
  try {
    if (!(await loadSettingFlag('club_creation_enabled', true))) {
      return { error: 'Club creation is temporarily disabled.' };
    }
    const svc = createServiceClient();
    const { data: me } = await svc
      .from('profiles')
      .select('account_status, onboarded_at')
      .eq('id', user.id)
      .maybeSingle();
    const meRow = me as { account_status: string; onboarded_at: string | null } | null;
    if (!meRow || meRow.account_status !== 'active' || !meRow.onboarded_at) {
      return { error: 'Complete your profile before creating a club.' };
    }

    const slug = `${slugify(v.name) || 'club'}-${crypto.randomUUID().slice(0, 6)}`;
    const { data: created, error } = await svc
      .from('clubs')
      .insert({
        name: v.name,
        slug,
        description: v.description || null,
        city: v.city || null,
        contact: v.contact || null,
        privacy: v.privacy,
        created_by: user.id,
      })
      .select('id, slug')
      .single();
    if (error || !created) return { error: 'Could not create the club. Please try again.' };
    const club = created as { id: string; slug: string };
    newSlug = club.slug;

    // Owner membership is created immediately (§15.2).
    await svc.from('club_memberships').insert({
      club_id: club.id,
      user_id: user.id,
      role: 'owner',
      status: 'active',
      approved_at: new Date().toISOString(),
    });

    const logo = formData.get('logo');
    if (logo instanceof File && logo.size > 0) {
      const path = await uploadClubLogo(club.id, logo);
      if (path) await svc.from('clubs').update({ logo_path: path }).eq('id', club.id);
    }

    revalidateTag(CLUBS_LIST_TAG);
    revalidateTag(userClubsTag(user.id));
  } catch {
    return { error: 'Club creation is temporarily unavailable. Please try again shortly.' };
  }
  redirect(`/clubs/${newSlug}`);
}

// ---------------------------------------------------------------------------
// Update (manager)
// ---------------------------------------------------------------------------
export async function updateClub(
  clubId: string,
  slug: string,
  _prev: ClubActionState,
  formData: FormData,
): Promise<ClubActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const role = await myClubRole(user.id, clubId);
  if (role !== 'owner' && role !== 'admin')
    return { error: 'Only club managers can edit this club.' };

  const parsed = clubUpdateSchema.safeParse({
    name: formData.get('name'),
    city: formData.get('city') ?? '',
    description: formData.get('description') ?? '',
    privacy: formData.get('privacy'),
    contact: formData.get('contact') ?? '',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const v = parsed.data;
  try {
    const svc = createServiceClient();
    const patch: Record<string, unknown> = {
      name: v.name,
      city: v.city || null,
      description: v.description || null,
      privacy: v.privacy,
      contact: v.contact || null,
    };
    const logo = formData.get('logo');
    if (logo instanceof File && logo.size > 0) {
      const path = await uploadClubLogo(clubId, logo);
      if (path) patch.logo_path = path;
    }
    const { error } = await svc.from('clubs').update(patch).eq('id', clubId);
    if (error) return { error: 'Could not save changes. Please try again.' };
    invalidateClub(slug, clubId);
  } catch {
    return { error: 'Club editing is temporarily unavailable.' };
  }
  return { ok: true, message: 'Club updated.' };
}

// ---------------------------------------------------------------------------
// Membership: join / leave
// ---------------------------------------------------------------------------
export async function requestJoin(clubId: string, slug: string): Promise<ClubActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in to join.' };
  try {
    const svc = createServiceClient();
    const [{ data: club }, { data: me }, { data: existing }] = await Promise.all([
      svc.from('clubs').select('privacy, activity_status').eq('id', clubId).maybeSingle(),
      svc.from('profiles').select('account_status').eq('id', user.id).maybeSingle(),
      svc
        .from('club_memberships')
        .select('id, status')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .in('status', ['requested', 'invited', 'active'])
        .maybeSingle(),
    ]);
    const c = club as { privacy: string; activity_status: string } | null;
    const meRow = me as { account_status: string } | null;
    if (!c || c.activity_status !== 'active')
      return { error: 'This club is not accepting members.' };
    if (!meRow || meRow.account_status !== 'active') {
      return { error: 'Your account cannot join clubs right now.' };
    }
    if (existing) {
      const st = (existing as { status: string }).status;
      return {
        error:
          st === 'active' ? 'You are already a member.' : 'You already have a pending request.',
      };
    }
    const status = c.privacy === 'public' ? 'active' : 'requested';
    const { error } = await svc.from('club_memberships').insert({
      club_id: clubId,
      user_id: user.id,
      role: 'member',
      status,
      approved_at: status === 'active' ? new Date().toISOString() : null,
    });
    if (error) return { error: 'Could not join. Please try again.' };
    invalidateClub(slug, clubId);
    revalidateTag(userClubsTag(user.id));
    return {
      ok: true,
      message:
        status === 'active' ? 'You joined the club.' : 'Request sent - an admin will review it.',
    };
  } catch {
    return { error: 'Joining is temporarily unavailable.' };
  }
}

export async function leaveClub(clubId: string, slug: string): Promise<ClubActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  try {
    const svc = createServiceClient();
    const { data: mine } = await svc
      .from('club_memberships')
      .select('id, role')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .in('status', ['requested', 'invited', 'active'])
      .maybeSingle();
    const m = mine as { id: string; role: ClubRole } | null;
    if (!m) return { error: 'You are not a member of this club.' };
    if (m.role === 'owner') {
      return { error: 'Transfer ownership or delete the club before leaving.' };
    }
    const { error } = await svc
      .from('club_memberships')
      .update({ status: 'left', ended_at: new Date().toISOString() })
      .eq('id', m.id);
    if (error) return { error: 'Could not leave the club.' };
    invalidateClub(slug, clubId);
    revalidateTag(userClubsTag(user.id));
    return { ok: true, message: 'You left the club.' };
  } catch {
    return { error: 'Leaving is temporarily unavailable.' };
  }
}

// ---------------------------------------------------------------------------
// Manager actions on members
// ---------------------------------------------------------------------------
async function requireManager(userId: string, clubId: string): Promise<ClubRole | null> {
  const role = await myClubRole(userId, clubId);
  return role === 'owner' || role === 'admin' ? role : null;
}

async function setMembership(
  clubId: string,
  slug: string,
  targetUserId: string,
  patch: Record<string, unknown>,
  fromStatuses: string[],
): Promise<ClubActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await requireManager(user.id, clubId))) return { error: 'Only club managers can do that.' };
  try {
    const svc = createServiceClient();
    const { data: target } = await svc
      .from('club_memberships')
      .select('id, role, status')
      .eq('club_id', clubId)
      .eq('user_id', targetUserId)
      .in('status', fromStatuses)
      .maybeSingle();
    const t = target as { id: string; role: ClubRole } | null;
    if (!t) return { error: 'Member not found in that state.' };
    if (t.role === 'owner') return { error: 'You cannot modify the owner here.' };
    const { error } = await svc.from('club_memberships').update(patch).eq('id', t.id);
    if (error) return { error: 'Could not update the member.' };
    invalidateClub(slug, clubId);
    revalidateTag(userClubsTag(targetUserId));
    return { ok: true, message: 'Member updated.' };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
}

export async function approveMember(
  clubId: string,
  slug: string,
  userId: string,
): Promise<ClubActionState> {
  return setMembership(
    clubId,
    slug,
    userId,
    { status: 'active', approved_at: new Date().toISOString() },
    ['requested', 'invited'],
  );
}
export async function rejectMember(
  clubId: string,
  slug: string,
  userId: string,
): Promise<ClubActionState> {
  return setMembership(
    clubId,
    slug,
    userId,
    { status: 'rejected', ended_at: new Date().toISOString() },
    ['requested', 'invited'],
  );
}
export async function removeMember(
  clubId: string,
  slug: string,
  userId: string,
): Promise<ClubActionState> {
  return setMembership(
    clubId,
    slug,
    userId,
    { status: 'removed', ended_at: new Date().toISOString() },
    ['active'],
  );
}

// ---------------------------------------------------------------------------
// Role management (owner only)
// ---------------------------------------------------------------------------
async function requireOwner(userId: string, clubId: string): Promise<boolean> {
  return (await myClubRole(userId, clubId)) === 'owner';
}

export async function setMemberRole(
  clubId: string,
  slug: string,
  targetUserId: string,
  role: 'admin' | 'member',
): Promise<ClubActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await requireOwner(user.id, clubId))) return { error: 'Only the owner can change roles.' };
  try {
    const svc = createServiceClient();
    const { data: target } = await svc
      .from('club_memberships')
      .select('id, role')
      .eq('club_id', clubId)
      .eq('user_id', targetUserId)
      .eq('status', 'active')
      .maybeSingle();
    const t = target as { id: string; role: ClubRole } | null;
    if (!t) return { error: 'Active member not found.' };
    if (t.role === 'owner') return { error: 'The owner role is managed via transfer.' };
    const { error } = await svc.from('club_memberships').update({ role }).eq('id', t.id);
    if (error) return { error: 'Could not change the role.' };
    invalidateClub(slug, clubId);
    return { ok: true, message: role === 'admin' ? 'Promoted to admin.' : 'Set to member.' };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
}

export async function transferOwnership(
  clubId: string,
  slug: string,
  newOwnerUserId: string,
): Promise<ClubActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await requireOwner(user.id, clubId)))
    return { error: 'Only the owner can transfer ownership.' };
  if (newOwnerUserId === user.id) return { error: 'You already own this club.' };
  try {
    const svc = createServiceClient();
    const { data: target } = await svc
      .from('club_memberships')
      .select('id')
      .eq('club_id', clubId)
      .eq('user_id', newOwnerUserId)
      .eq('status', 'active')
      .maybeSingle();
    if (!target) return { error: 'The new owner must be an active member.' };
    // Demote current owner first to satisfy the single-active-owner constraint, then promote.
    await svc
      .from('club_memberships')
      .update({ role: 'admin' })
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .eq('status', 'active');
    const { error } = await svc
      .from('club_memberships')
      .update({ role: 'owner' })
      .eq('id', (target as { id: string }).id);
    if (error) {
      // Roll back the demotion on failure.
      await svc
        .from('club_memberships')
        .update({ role: 'owner' })
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .eq('status', 'active');
      return { error: 'Could not transfer ownership.' };
    }
    invalidateClub(slug, clubId);
    return { ok: true, message: 'Ownership transferred.' };
  } catch {
    return { error: 'Ownership transfer is temporarily unavailable.' };
  }
}

// ---------------------------------------------------------------------------
// Privacy / activity / delete (owner-ish)
// ---------------------------------------------------------------------------
export async function setClubPrivacy(
  clubId: string,
  slug: string,
  privacy: 'public' | 'approval_required',
): Promise<ClubActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await requireManager(user.id, clubId))) return { error: 'Only club managers can do that.' };
  try {
    const svc = createServiceClient();
    const { error } = await svc.from('clubs').update({ privacy }).eq('id', clubId);
    if (error) return { error: 'Could not update privacy.' };
    invalidateClub(slug, clubId);
    return { ok: true, message: 'Privacy updated.' };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
}

export async function setClubActivity(
  clubId: string,
  slug: string,
  activity: 'active' | 'inactive',
): Promise<ClubActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await requireOwner(user.id, clubId))) return { error: 'Only the owner can do that.' };
  try {
    const svc = createServiceClient();
    const { error } = await svc
      .from('clubs')
      .update({ activity_status: activity })
      .eq('id', clubId);
    if (error) return { error: 'Could not update the club.' };
    invalidateClub(slug, clubId);
    return { ok: true, message: activity === 'active' ? 'Club set active.' : 'Club set inactive.' };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
}

export async function deleteClub(
  clubId: string,
  slug: string,
  confirmName: string,
): Promise<ClubActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await requireOwner(user.id, clubId)))
    return { error: 'Only the owner can delete the club.' };
  try {
    const svc = createServiceClient();
    const { data: club } = await svc.from('clubs').select('name').eq('id', clubId).maybeSingle();
    const name = (club as { name: string } | null)?.name;
    if (!name) return { error: 'Club not found.' };
    if (confirmName.trim() !== name)
      return { error: 'Type the club name exactly to confirm deletion.' };
    // Soft-delete (§15.7).
    const { error } = await svc
      .from('clubs')
      .update({ activity_status: 'deleted', deleted_at: new Date().toISOString() })
      .eq('id', clubId);
    if (error) return { error: 'Could not delete the club.' };
    invalidateClub(slug, clubId);
  } catch {
    return { error: 'Deletion is temporarily unavailable.' };
  }
  redirect('/clubs');
}
