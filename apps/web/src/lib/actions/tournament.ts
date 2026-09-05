'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import {
  tournamentCreateSchema,
  tournamentUpdateSchema,
  divisionSchema,
  announcementSchema,
} from '@vouchplay/validation';
import type { TournamentStatus } from '@vouchplay/db';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { AVATARS_BUCKET } from '@/lib/storage';
import { authorizeOrganizer, hasOrganizerRole, type OrganizerPerm } from '@/lib/tournaments/authz';
import {
  TOURNAMENTS_LIST_TAG,
  tournamentTag,
  tournamentDivisionsTag,
  tournamentAnnouncementsTag,
} from '@/lib/tournaments/queries';

export interface TournamentActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const COVER_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const MAX_COVER_BYTES = 4 * 1024 * 1024;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
}

function bool(formData: FormData, name: string): boolean {
  const v = formData.get(name);
  return v === 'on' || v === 'true' || v === '1';
}

function toIso(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function uploadCover(tournamentId: string, file: File): Promise<string | null> {
  const ext = COVER_MIME_EXT[file.type];
  if (!ext || file.size === 0 || file.size > MAX_COVER_BYTES) return null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = `tournament-covers/${tournamentId}/cover-${Date.now()}.${ext}`;
    const svc = createServiceClient();
    const { error } = await svc.storage
      .from(AVATARS_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: true });
    return error ? null : path;
  } catch {
    return null;
  }
}

function invalidate(slug: string | null, tournamentId: string) {
  revalidateTag(TOURNAMENTS_LIST_TAG);
  if (slug) revalidateTag(tournamentTag(slug));
  revalidateTag(tournamentDivisionsTag(tournamentId));
  revalidateTag(tournamentAnnouncementsTag(tournamentId));
}

// ---------------------------------------------------------------------------
// Create (§17.1 — approved organizer/admin only)
// ---------------------------------------------------------------------------
export async function createTournament(
  _prev: TournamentActionState,
  formData: FormData,
): Promise<TournamentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };

  const parsed = tournamentCreateSchema.safeParse({
    name: formData.get('name'),
    city: formData.get('city') ?? '',
    venueName: formData.get('venueName') ?? '',
    description: formData.get('description') ?? '',
    visibility: formData.get('visibility') ?? 'public',
    startAt: formData.get('startAt') ?? '',
    endAt: formData.get('endAt') ?? '',
    registrationOpenAt: formData.get('registrationOpenAt') ?? '',
    registrationCloseAt: formData.get('registrationCloseAt') ?? '',
    contact: formData.get('contact') ?? '',
    termsText: formData.get('termsText') ?? '',
    paymentInstructions: formData.get('paymentInstructions') ?? '',
    paymentMethods: formData.get('paymentMethods') ?? '',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const v = parsed.data;

  let newSlug: string | null = null;
  try {
    if (!(await hasOrganizerRole(user.id))) {
      return { error: 'You need an approved Organizer role to create tournaments.' };
    }
    const svc = createServiceClient();
    const slug = `${slugify(v.name) || 'tournament'}-${crypto.randomUUID().slice(0, 6)}`;
    const { data: created, error } = await svc
      .from('tournaments')
      .insert({
        name: v.name,
        slug,
        city: v.city || null,
        venue_name: v.venueName || null,
        description: v.description || null,
        visibility: v.visibility,
        start_at: toIso(formData.get('startAt')),
        end_at: toIso(formData.get('endAt')),
        registration_open_at: toIso(formData.get('registrationOpenAt')),
        registration_close_at: toIso(formData.get('registrationCloseAt')),
        contact: v.contact || null,
        terms_text: v.termsText || null,
        payment_instructions: v.paymentInstructions || null,
        payment_methods: v.paymentMethods || null,
        owner_organizer_id: user.id,
        status: 'draft',
      })
      .select('id, slug')
      .single();
    if (error || !created) return { error: 'Could not create the tournament. Please try again.' };
    const t = created as { id: string; slug: string };
    newSlug = t.slug;

    const cover = formData.get('cover');
    if (cover instanceof File && cover.size > 0) {
      const path = await uploadCover(t.id, cover);
      if (path) await svc.from('tournaments').update({ cover_path: path }).eq('id', t.id);
    }
    revalidateTag(TOURNAMENTS_LIST_TAG);
  } catch {
    return { error: 'Tournament creation is temporarily unavailable. Please try again shortly.' };
  }
  redirect(`/tournaments/${newSlug}/manage`);
}

// ---------------------------------------------------------------------------
// Update (organizer with edit permission)
// ---------------------------------------------------------------------------
export async function updateTournament(
  tournamentId: string,
  slug: string,
  _prev: TournamentActionState,
  formData: FormData,
): Promise<TournamentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'edit'))) {
    return { error: 'You do not have permission to edit this tournament.' };
  }
  const parsed = tournamentUpdateSchema.safeParse({
    name: formData.get('name'),
    city: formData.get('city') ?? '',
    venueName: formData.get('venueName') ?? '',
    description: formData.get('description') ?? '',
    visibility: formData.get('visibility') ?? 'public',
    startAt: formData.get('startAt') ?? '',
    endAt: formData.get('endAt') ?? '',
    registrationOpenAt: formData.get('registrationOpenAt') ?? '',
    registrationCloseAt: formData.get('registrationCloseAt') ?? '',
    contact: formData.get('contact') ?? '',
    termsText: formData.get('termsText') ?? '',
    paymentInstructions: formData.get('paymentInstructions') ?? '',
    paymentMethods: formData.get('paymentMethods') ?? '',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const v = parsed.data;
  try {
    const svc = createServiceClient();
    const patch: Record<string, unknown> = {
      name: v.name,
      city: v.city || null,
      venue_name: v.venueName || null,
      description: v.description || null,
      visibility: v.visibility,
      start_at: toIso(formData.get('startAt')),
      end_at: toIso(formData.get('endAt')),
      registration_open_at: toIso(formData.get('registrationOpenAt')),
      registration_close_at: toIso(formData.get('registrationCloseAt')),
      contact: v.contact || null,
      terms_text: v.termsText || null,
      payment_instructions: v.paymentInstructions || null,
      payment_methods: v.paymentMethods || null,
    };
    const cover = formData.get('cover');
    if (cover instanceof File && cover.size > 0) {
      const path = await uploadCover(tournamentId, cover);
      if (path) patch.cover_path = path;
    }
    const { error } = await svc.from('tournaments').update(patch).eq('id', tournamentId);
    if (error) return { error: 'Could not save changes.' };
    invalidate(slug, tournamentId);
  } catch {
    return { error: 'Editing is temporarily unavailable.' };
  }
  return { ok: true, message: 'Tournament updated.' };
}

// ---------------------------------------------------------------------------
// Lifecycle state machine (§17.2)
// ---------------------------------------------------------------------------
const TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ['published', 'cancelled'],
  published: ['registration_open', 'draft', 'cancelled'],
  registration_open: ['registration_closed', 'cancelled'],
  registration_closed: ['locked', 'registration_open', 'cancelled'],
  locked: ['live', 'registration_closed', 'cancelled'],
  live: ['completed', 'cancelled'],
  completed: ['archived'],
  archived: [],
  cancelled: [],
};

export async function setTournamentStatus(
  tournamentId: string,
  slug: string,
  next: TournamentStatus,
): Promise<TournamentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'edit'))) {
    return { error: 'You do not have permission to change this tournament.' };
  }
  try {
    const svc = createServiceClient();
    const { data: t } = await svc
      .from('tournaments')
      .select('status')
      .eq('id', tournamentId)
      .maybeSingle();
    const current = (t as { status: TournamentStatus } | null)?.status;
    if (!current) return { error: 'Tournament not found.' };
    if (!TRANSITIONS[current].includes(next)) {
      return {
        error: `Cannot move from ${current.replace('_', ' ')} to ${next.replace('_', ' ')}.`,
      };
    }
    const { error } = await svc.from('tournaments').update({ status: next }).eq('id', tournamentId);
    if (error) return { error: 'Could not update the status.' };
    invalidate(slug, tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: `Status set to ${next.replace('_', ' ')}.` };
}

// ---------------------------------------------------------------------------
// Divisions (§18)
// ---------------------------------------------------------------------------
function divisionPatchFromForm(formData: FormData) {
  const parsed = divisionSchema.safeParse({
    nameOverride: formData.get('nameOverride') ?? '',
    skillPolicy: formData.get('skillPolicy') ?? 'open',
    minimumSkill: formData.get('minimumSkill') || undefined,
    maximumSkill: formData.get('maximumSkill') || undefined,
    format: formData.get('format') ?? 'doubles',
    sexClassification: formData.get('sexClassification') ?? 'mixed',
    minimumAge: formData.get('minimumAge') || undefined,
    maximumAge: formData.get('maximumAge') || undefined,
    teamSize: formData.get('teamSize') || 2,
    capacityTeams: formData.get('capacityTeams') || 0,
    feeAmount: formData.get('feeAmount') || 0,
    currency: formData.get('currency') || 'PHP',
    skillVerifiedRequired: bool(formData, 'skillVerifiedRequired'),
    minimumSts: formData.get('minimumSts') || undefined,
    organizerApprovalRequired: bool(formData, 'organizerApprovalRequired'),
    registrationOpenAt: formData.get('registrationOpenAt') ?? '',
    registrationCloseAt: formData.get('registrationCloseAt') ?? '',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const d = parsed.data;
  return {
    data: {
      name_override: d.nameOverride || null,
      skill_policy: d.skillPolicy,
      minimum_skill: d.skillPolicy === 'band' ? (d.minimumSkill ?? null) : null,
      maximum_skill: d.skillPolicy === 'band' ? (d.maximumSkill ?? null) : null,
      format: d.format,
      sex_classification: d.sexClassification,
      minimum_age: d.minimumAge ?? null,
      maximum_age: d.maximumAge ?? null,
      team_size: d.format === 'singles' ? 1 : d.teamSize,
      capacity_teams: d.capacityTeams,
      fee_amount: d.feeAmount,
      currency: d.currency.toUpperCase(),
      skill_verified_required: d.skillVerifiedRequired,
      minimum_sts: d.minimumSts ?? null,
      organizer_approval_required: d.organizerApprovalRequired,
      registration_open_at: toIso(formData.get('registrationOpenAt')),
      registration_close_at: toIso(formData.get('registrationCloseAt')),
    },
  };
}

export async function addDivision(
  tournamentId: string,
  slug: string,
  _prev: TournamentActionState,
  formData: FormData,
): Promise<TournamentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'manage_divisions'))) {
    return { error: 'You do not have permission to manage divisions.' };
  }
  const built = divisionPatchFromForm(formData);
  if ('error' in built) return { error: built.error };
  try {
    const svc = createServiceClient();
    const { error } = await svc
      .from('divisions')
      .insert({ tournament_id: tournamentId, ...built.data });
    if (error) return { error: 'Could not add the division.' };
    invalidate(slug, tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Division added.' };
}

export async function updateDivision(
  divisionId: string,
  tournamentId: string,
  slug: string,
  _prev: TournamentActionState,
  formData: FormData,
): Promise<TournamentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'manage_divisions'))) {
    return { error: 'You do not have permission to manage divisions.' };
  }
  const built = divisionPatchFromForm(formData);
  if ('error' in built) return { error: built.error };
  try {
    const svc = createServiceClient();
    const { error } = await svc
      .from('divisions')
      .update(built.data)
      .eq('id', divisionId)
      .eq('tournament_id', tournamentId);
    if (error) return { error: 'Could not update the division.' };
    invalidate(slug, tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Division updated.' };
}

export async function cloneDivision(
  divisionId: string,
  tournamentId: string,
  slug: string,
): Promise<TournamentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'manage_divisions'))) {
    return { error: 'You do not have permission to manage divisions.' };
  }
  try {
    const svc = createServiceClient();
    const { data: src } = await svc
      .from('divisions')
      .select('*')
      .eq('id', divisionId)
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    if (!src) return { error: 'Division not found.' };
    const row = src as Record<string, unknown>;
    delete row.id;
    delete row.created_at;
    delete row.updated_at;
    row.status = 'draft';
    row.name_override = row.name_override ? `${row.name_override} (copy)` : null;
    const { error } = await svc.from('divisions').insert(row);
    if (error) return { error: 'Could not clone the division.' };
    invalidate(slug, tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Division cloned.' };
}

export async function setDivisionStatus(
  divisionId: string,
  tournamentId: string,
  slug: string,
  status: 'draft' | 'open' | 'closed' | 'locked' | 'cancelled',
): Promise<TournamentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'manage_divisions'))) {
    return { error: 'You do not have permission to manage divisions.' };
  }
  try {
    const svc = createServiceClient();
    const { error } = await svc
      .from('divisions')
      .update({ status })
      .eq('id', divisionId)
      .eq('tournament_id', tournamentId);
    if (error) return { error: 'Could not update the division.' };
    invalidate(slug, tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Division updated.' };
}

// ---------------------------------------------------------------------------
// Interest (§36.22) — any active player
// ---------------------------------------------------------------------------
export async function toggleInterest(
  tournamentId: string,
  slug: string,
  divisionId: string | null,
): Promise<TournamentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  try {
    const svc = createServiceClient();
    let q = svc
      .from('tournament_interests')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('player_id', user.id);
    q = divisionId ? q.eq('division_id', divisionId) : q.is('division_id', null);
    const { data: existing } = await q.maybeSingle();
    if (existing) {
      await svc
        .from('tournament_interests')
        .delete()
        .eq('id', (existing as { id: string }).id);
      invalidate(slug, tournamentId);
      return { ok: true, message: 'Removed from your interests.' };
    }
    const { error } = await svc.from('tournament_interests').insert({
      tournament_id: tournamentId,
      player_id: user.id,
      division_id: divisionId,
    });
    if (error) return { error: 'Could not update interest.' };
    invalidate(slug, tournamentId);
    return { ok: true, message: "You're marked as interested." };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
}

// ---------------------------------------------------------------------------
// Announcements (§36.30)
// ---------------------------------------------------------------------------
export async function postAnnouncement(
  tournamentId: string,
  slug: string,
  _prev: TournamentActionState,
  formData: FormData,
): Promise<TournamentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'send_announcements'))) {
    return { error: 'You do not have permission to post announcements.' };
  }
  const parsed = announcementSchema.safeParse({
    title: formData.get('title'),
    body: formData.get('body'),
    audience: formData.get('audience') ?? 'all',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const a = parsed.data;
  try {
    const svc = createServiceClient();
    const { error } = await svc.from('tournament_announcements').insert({
      tournament_id: tournamentId,
      audience: a.audience,
      title: a.title,
      body: a.body,
      created_by: user.id,
    });
    if (error) return { error: 'Could not post the announcement.' };
    revalidateTag(tournamentAnnouncementsTag(tournamentId));
    if (slug) revalidateTag(tournamentTag(slug));
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Announcement posted.' };
}

// ---------------------------------------------------------------------------
// Co-organizers (§17.4) — owner only
// ---------------------------------------------------------------------------
const PERM_KEYS: OrganizerPerm[] = [
  'edit',
  'manage_divisions',
  'send_announcements',
  'approve_registrations',
  'manage_payments',
  'export',
];

export async function addCoOrganizer(
  tournamentId: string,
  slug: string,
  _prev: TournamentActionState,
  formData: FormData,
): Promise<TournamentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'manage_organizers'))) {
    return { error: 'Only the tournament owner can manage co-organizers.' };
  }
  const targetSlug = String(formData.get('targetSlug') ?? '').trim();
  if (!targetSlug) return { error: "Enter the co-organizer's profile handle." };
  try {
    const svc = createServiceClient();
    const { data: target } = await svc
      .from('profiles')
      .select('id')
      .eq('slug', targetSlug)
      .maybeSingle();
    const targetUserId = (target as { id: string } | null)?.id;
    if (!targetUserId) return { error: 'No player found with that handle.' };
    if (targetUserId === user.id) return { error: 'You already own this tournament.' };
    const { data: isOrg } = await svc
      .from('user_roles')
      .select('id')
      .eq('user_id', targetUserId)
      .eq('status', 'active')
      .in('role', ['organizer', 'admin', 'super_admin'])
      .maybeSingle();
    if (!isOrg) return { error: 'A co-organizer must have an approved Organizer role.' };

    const permissions: Record<string, boolean> = {};
    for (const key of PERM_KEYS) permissions[key] = bool(formData, `perm_${key}`);

    const { error } = await svc
      .from('tournament_organizers')
      .upsert(
        { tournament_id: tournamentId, user_id: targetUserId, permissions, status: 'active' },
        { onConflict: 'tournament_id,user_id' },
      );
    if (error) return { error: 'Could not add the co-organizer.' };
    invalidate(slug, tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Co-organizer added.' };
}

export async function removeCoOrganizer(
  tournamentId: string,
  slug: string,
  targetUserId: string,
): Promise<TournamentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'manage_organizers'))) {
    return { error: 'Only the tournament owner can manage co-organizers.' };
  }
  try {
    const svc = createServiceClient();
    const { error } = await svc
      .from('tournament_organizers')
      .update({ status: 'removed' })
      .eq('tournament_id', tournamentId)
      .eq('user_id', targetUserId);
    if (error) return { error: 'Could not remove the co-organizer.' };
    invalidate(slug, tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Co-organizer removed.' };
}
