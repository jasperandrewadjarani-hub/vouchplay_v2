'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { cookies } from 'next/headers';
import { createHmac, randomBytes } from 'node:crypto';
import {
  tournamentCreateSchema,
  tournamentUpdateSchema,
  divisionSchema,
  announcementSchema,
} from '@vouchplay/validation';
import { DEFAULT_SYSTEM_SETTINGS } from '@vouchplay/config';
import {
  buildDefaultDivisionPreset,
  isTournamentDemandDivision,
  isManageableTournamentStatus,
  tournamentArchiveNameMatches,
} from '@vouchplay/core';
import { getOptionalUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { AVATARS_BUCKET } from '@/lib/storage';
import { authorizeOrganizer, hasOrganizerRole, type OrganizerPerm } from '@/lib/tournaments/authz';
import {
  TOURNAMENTS_LIST_TAG,
  tournamentTag,
  tournamentDivisionsTag,
  tournamentAnnouncementsTag,
} from '@/lib/tournaments/queries';
import { notifyMany } from '@/lib/notifications/create';
import { getTournamentMini, getTournamentParticipantIds } from '@/lib/notifications/recipients';
import { loadSettingFlag, loadSettingNumber } from '@/lib/settings';
import { prepareTournamentCover } from '@/lib/tournaments/cover-image';

export interface TournamentActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

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

async function uploadCover(
  tournamentId: string,
  bytes: Uint8Array,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const path = `tournament-covers/${tournamentId}/cover-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.webp`;
  const svc = createServiceClient();
  const { error } = await svc.storage.from(AVATARS_BUCKET).upload(path, bytes, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  });
  return error
    ? { ok: false, error: 'Cover photo could not be uploaded. Please try again.' }
    : { ok: true, path };
}

async function deleteGeneratedCover(path: string | null | undefined): Promise<void> {
  if (!path?.startsWith('tournament-covers/')) return;
  try {
    await createServiceClient().storage.from(AVATARS_BUCKET).remove([path]);
  } catch {
    // Best-effort orphan cleanup; never undo a successful tournament save because cleanup failed.
  }
}

function invalidate(slug: string | null, tournamentId: string) {
  revalidateTag(TOURNAMENTS_LIST_TAG);
  if (slug) revalidateTag(tournamentTag(slug));
  revalidateTag(tournamentDivisionsTag(tournamentId));
  revalidateTag(tournamentAnnouncementsTag(tournamentId));
}

// ---------------------------------------------------------------------------
// Create (§17.1 - approved organizer/admin only)
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
    const tournamentId = crypto.randomUUID();
    const slug = `${slugify(v.name) || 'tournament'}-${crypto.randomUUID().slice(0, 6)}`;
    const cover = formData.get('cover');
    let uploadedCoverPath: string | null = null;
    if (cover instanceof File && cover.size > 0) {
      const prepared = await prepareTournamentCover(cover);
      if (!prepared.ok) return { error: prepared.error };
      const uploaded = await uploadCover(tournamentId, prepared.bytes);
      if (!uploaded.ok) return { error: uploaded.error };
      uploadedCoverPath = uploaded.path;
    }
    const { data: created, error } = await svc
      .from('tournaments')
      .insert({
        id: tournamentId,
        name: v.name,
        slug,
        cover_path: uploadedCoverPath,
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
    if (error || !created) {
      await deleteGeneratedCover(uploadedCoverPath);
      return { error: 'Could not create the tournament. Please try again.' };
    }
    const t = created as { id: string; slug: string };
    newSlug = t.slug;

    const configuredCapacity = await loadSettingNumber(
      'default_division_capacity_teams',
      DEFAULT_SYSTEM_SETTINGS.default_division_capacity_teams,
    );
    const starterDivisions = buildDefaultDivisionPreset(configuredCapacity).map((division) => ({
      tournament_id: t.id,
      ...division,
    }));
    const { error: divisionError } = await svc.from('divisions').insert(starterDivisions);
    if (divisionError) {
      // Creation is one logical operation: compensate by removing the empty draft and all children.
      await svc.from('tournaments').delete().eq('id', t.id);
      await deleteGeneratedCover(uploadedCoverPath);
      return { error: 'Could not create the starter divisions. No tournament was saved.' };
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
  const submittedCover = formData.get('cover');
  const coverSelected = submittedCover instanceof File && submittedCover.size > 0;
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
    let uploadedCoverPath: string | null = null;
    let previousCoverPath: string | null = null;
    if (coverSelected) {
      const prepared = await prepareTournamentCover(submittedCover);
      if (!prepared.ok) return { error: prepared.error };
      const { data: current, error: currentError } = await svc
        .from('tournaments')
        .select('cover_path')
        .eq('id', tournamentId)
        .single();
      if (currentError || !current)
        return { error: 'Could not read the current tournament cover.' };
      previousCoverPath = (current as { cover_path: string | null }).cover_path;
      const uploaded = await uploadCover(tournamentId, prepared.bytes);
      if (!uploaded.ok) {
        return { error: `${uploaded.error} Your current cover was kept.` };
      }
      uploadedCoverPath = uploaded.path;
      patch.cover_path = uploaded.path;
    }
    const { error } = await svc.from('tournaments').update(patch).eq('id', tournamentId);
    if (error) {
      await deleteGeneratedCover(uploadedCoverPath);
      return { error: 'Could not save changes. Your current cover was kept.' };
    }
    if (uploadedCoverPath && previousCoverPath !== uploadedCoverPath) {
      await deleteGeneratedCover(previousCoverPath);
    }
    invalidate(slug, tournamentId);
  } catch {
    return { error: 'Editing is temporarily unavailable.' };
  }
  return {
    ok: true,
    message: coverSelected ? 'Tournament and cover updated.' : 'Tournament updated.',
  };
}

// ---------------------------------------------------------------------------
// Free non-archived lifecycle control (§17.2)
// ---------------------------------------------------------------------------
export async function setTournamentStatus(
  tournamentId: string,
  slug: string,
  _prev: TournamentActionState,
  formData: FormData,
): Promise<TournamentActionState> {
  const next = formData.get('nextStatus');
  if (!isManageableTournamentStatus(next)) return { error: 'Select a valid tournament status.' };

  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await authorizeOrganizer(user.id, tournamentId, 'edit'))) {
    return { error: 'You do not have permission to change this tournament.' };
  }

  let changed = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      'set_tournament_status' as never,
      { p_tournament_id: tournamentId, p_next_status: next } as never,
    );
    if (error) {
      if (error.message.includes('archived_requires_retention_flow')) {
        return { error: 'Use the separate Archive/Restore control for archived tournaments.' };
      }
      return { error: 'Could not update the status. Please try again.' };
    }
    changed = Boolean((data as unknown as { changed?: boolean } | null)?.changed);
    invalidate(slug, tournamentId);
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }

  if (changed && next === 'cancelled') {
    const [participantIds, tournament] = await Promise.all([
      getTournamentParticipantIds(tournamentId),
      getTournamentMini(tournamentId),
    ]);
    await notifyMany(participantIds, {
      type: 'tournament_cancelled',
      actorId: user.id,
      params: {
        tournamentName: tournament.name,
        reason: 'The organizer changed the tournament status to Cancelled.',
      },
      link: `/tournaments/${slug}`,
      entityType: 'tournament',
      entityId: tournamentId,
    });
  }

  const label = next.replaceAll('_', ' ');
  return { ok: true, message: changed ? `Status set to ${label}.` : `Status is already ${label}.` };
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

/** Remove an unused division through the audited, transactional database function (§18.6). */
export async function removeDivision(
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
    const supabase = await createClient();
    const { error } = await supabase.rpc(
      'remove_unused_division' as never,
      { p_division_id: divisionId } as never,
    );
    if (error) {
      if (error.message.includes('division_has_activity')) {
        return { error: 'This division already has player activity and cannot be removed.' };
      }
      return { error: 'Could not remove the division. Please try again.' };
    }
    invalidate(slug, tournamentId);
    return { ok: true, message: 'Division removed.' };
  } catch {
    return { error: 'Division removal is temporarily unavailable.' };
  }
}

// ---------------------------------------------------------------------------
// Reversible owner-only archive / restore (§17.2)
// ---------------------------------------------------------------------------
async function changeArchiveState(
  tournamentId: string,
  slug: string,
  expectedName: string,
  restore: boolean,
): Promise<TournamentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };

  const authorization = await authorizeOrganizer(user.id, tournamentId);
  if (!authorization?.isOwner) return { error: 'Only the tournament owner can do this.' };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc(
      'set_tournament_archived_state' as never,
      {
        p_tournament_id: tournamentId,
        p_expected_name: expectedName,
        p_restore: restore,
      } as never,
    );
    if (error) {
      if (error.message.includes('tournament_name_mismatch')) {
        return { error: 'The tournament name does not match.' };
      }
      if (error.message.includes('unsafe_archive_status')) {
        return {
          error: 'Move this tournament to Draft, Cancelled, or Completed before archiving.',
        };
      }
      if (error.message.includes('not_archived')) {
        return { error: 'This tournament is not archived.' };
      }
      return { error: `Could not ${restore ? 'restore' : 'archive'} the tournament.` };
    }
    invalidate(slug, tournamentId);
    return {
      ok: true,
      message: restore ? 'Tournament restored to Draft.' : 'Tournament archived.',
    };
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
}

export async function archiveTournament(
  tournamentId: string,
  slug: string,
  expectedName: string,
  _prev: TournamentActionState,
  formData: FormData,
): Promise<TournamentActionState> {
  const typedName = String(formData.get('tournamentName') ?? '').trim();
  if (!tournamentArchiveNameMatches(expectedName, typedName)) {
    return { error: 'Type the exact tournament name to continue.' };
  }
  return changeArchiveState(tournamentId, slug, typedName, false);
}

export async function restoreTournament(
  tournamentId: string,
  slug: string,
  expectedName: string,
  _prev: TournamentActionState,
  _formData: FormData,
): Promise<TournamentActionState> {
  void _prev;
  void _formData;
  return changeArchiveState(tournamentId, slug, expectedName, true);
}

// ---------------------------------------------------------------------------
// Interest (§36.22) - any active player
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

const DEMAND_COOKIE = 'vp_tournament_interest_v1';

function hashAnonymousDemand(raw: string): string | null {
  const secret =
    process.env.TOURNAMENT_INTEREST_COOKIE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return secret
    ? createHmac('sha256', secret).update(`tournament-demand:v1:${raw}`).digest('hex')
    : null;
}

/** Planning-only demand signal. Anonymous identity is an HMAC of a random HTTP-only browser cookie. */
export async function submitTournamentDemandInterest(
  tournamentId: string,
  slug: string,
  divisionKey: string,
): Promise<TournamentActionState> {
  if (!isTournamentDemandDivision(divisionKey))
    return { error: 'Choose one of the listed divisions.' };
  if (!(await loadSettingFlag('tournament_demand_interest_enabled', false))) {
    return { error: 'Tournament interest is not available right now.' };
  }
  try {
    const svc = createServiceClient();
    const { data: tournament } = await svc
      .from('tournaments')
      .select('id, status, visibility')
      .eq('id', tournamentId)
      .maybeSingle();
    if (
      !tournament ||
      !['published', 'registration_open'].includes((tournament as { status: string }).status) ||
      (tournament as { visibility: string }).visibility !== 'public'
    ) {
      return { error: 'Interest is only available for a public upcoming tournament.' };
    }
    const user = await getOptionalUser();
    let anonymousHash: string | null = null;
    if (!user) {
      const store = await cookies();
      let raw = store.get(DEMAND_COOKIE)?.value;
      if (!raw || !/^[A-Za-z0-9_-]{32,128}$/.test(raw)) {
        raw = randomBytes(32).toString('base64url');
        store.set(DEMAND_COOKIE, raw, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 365,
        });
      }
      anonymousHash = hashAnonymousDemand(raw);
      if (!anonymousHash)
        return { error: 'Interest is temporarily unavailable. Please try again later.' };
      const limit = await loadSettingNumber('tournament_demand_anonymous_daily_limit', 12);
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await svc
        .from('tournament_demand_interests')
        .select('id', { count: 'exact', head: true })
        .eq('anonymous_key_hash', anonymousHash)
        .gte('created_at', since);
      if ((count ?? 0) >= limit)
        return { error: 'You have reached today’s interest limit. Please try again tomorrow.' };
    }
    const { error } = await svc.rpc('submit_tournament_demand_interest', {
      p_tournament_id: tournamentId,
      p_player_id: user?.id ?? null,
      p_anonymous_key_hash: anonymousHash,
      p_division_key: divisionKey,
    });
    if (error) return { error: 'Could not record your interest. Please try again.' };
    invalidate(slug, tournamentId);
    return {
      ok: true,
      message: 'Your interest has been counted. This is not registration or a reserved slot.',
    };
  } catch {
    return { error: 'Interest is temporarily unavailable. Please try again shortly.' };
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

    // Fan out to the audience (§27.1). Map audience -> registration statuses, then team members.
    const ALL_STATUSES = [
      'confirmed',
      'waitlisted',
      'payment_pending',
      'payment_submitted',
      'under_review',
    ];
    const AUDIENCE_STATUSES: Record<string, string[]> = {
      all: ALL_STATUSES,
      confirmed: ['confirmed'],
      waitlisted: ['waitlisted'],
      pending: ['payment_pending', 'payment_submitted', 'under_review'],
    };
    const statuses = AUDIENCE_STATUSES[a.audience] ?? ALL_STATUSES;
    const { data: regRows } = await svc
      .from('registrations')
      .select('team_id')
      .eq('tournament_id', tournamentId)
      .in('status', statuses);
    const teamIds = Array.from(
      new Set(((regRows ?? []) as { team_id: string }[]).map((r) => r.team_id)),
    );
    if (teamIds.length > 0) {
      const { data: memRows } = await svc
        .from('team_members')
        .select('player_id')
        .in('team_id', teamIds);
      const recipients = Array.from(
        new Set(((memRows ?? []) as { player_id: string }[]).map((m) => m.player_id)),
      );
      const tm = await getTournamentMini(tournamentId);
      await notifyMany(recipients, {
        type: 'tournament_announcement',
        actorId: user.id,
        params: { tournamentName: tm.name, extra: a.title, reason: a.body },
        link: slug ? `/tournaments/${slug}` : '/tournaments',
        entityType: 'tournament',
        entityId: tournamentId,
      });
    }
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true, message: 'Announcement posted.' };
}

// ---------------------------------------------------------------------------
// Co-organizers (§17.4) - owner only
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
