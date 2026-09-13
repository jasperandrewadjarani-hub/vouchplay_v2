'use server';

import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { LEGAL } from '@vouchplay/config';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { loadSettingFlag } from '@/lib/settings';
import { writeAudit } from '@/lib/moderation/audit';
import { resolveActor, setGuestCookie, clearGuestCookie } from '@/lib/guest/session';
import { doRegisterSolo, doEnterDoublesSolo } from '@/lib/registrations/entry-core';
import {
  getViewerRegistrationState,
  type ViewerRegistrationState,
} from '@/lib/tournaments/registration-queries';

/**
 * Register before an account ("guest entry", master_plan §2AU). A visitor can pick a division, name a
 * partner, and pay - all BEFORE creating an account. The account is created silently from their email
 * at step one (`startGuestEntry`); "creating an account" at the end is only verifying that email
 * (`verifyGuestOtpInline`). Every row a guest produces already belongs to a real profile, so nothing is
 * ever orphaned and recovery is simply "sign in with the email you used" (§2AU E).
 *
 * Guests NEVER go through the partner-invite-by-email path (`doEnterWithPendingPartner`) - inviting a
 * THIRD PARTY by email would create an account on their behalf, which is explicitly deferred to phase
 * 2 (§2AU "Deferred"). A guest's doubles partner is only ever a free-text note on the registration
 * (`partner_note`, migration 0046), shown as "to be invited" until the guest verifies and can send a
 * real invite.
 */

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .email('Enter a valid email address')
  .max(254);

const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your email');

const guestEntrySchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  sex: z.enum(['male', 'female'], { message: 'Select a sex' }),
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date of birth'),
  selfRatedSkill: z.number().int().min(0, 'Select your skill level').max(6, 'Invalid skill level'),
  acceptedTerms: z.boolean().refine((v) => v === true, {
    message: 'Please agree to the Terms of Service and Privacy Policy to continue.',
  }),
  divisionId: z.string().uuid('Invalid division').nullable(),
  partnerNote: z.string().trim().max(80).nullable(),
  acknowledgedPlayDown: z.boolean(),
  /** Honeypot - a hidden field a human never fills; a bot that fills every field trips it (§2AU G). */
  website: z.string().optional(),
});

export interface StartGuestEntryInput {
  email: string;
  firstName: string;
  lastName: string;
  sex: 'male' | 'female';
  dateOfBirth: string;
  selfRatedSkill: number;
  acceptedTerms: boolean;
  divisionId: string | null;
  partnerNote: string | null;
  acknowledgedPlayDown: boolean;
  website?: string;
}

export interface StartGuestEntryResult {
  ok?: boolean;
  error?: string;
  /** Set when the email already has an account - the wizard switches to the "enter the code we just
   *  sent" branch (`requestGuestOtp` + `verifyGuestOtpInline`) instead of showing an error. */
  existingAccount?: boolean;
  registrationId?: string;
  teamId?: string;
  status?: string;
  profileId?: string;
}

/** Same slugify + uniqueness approach as `completeOnboarding` in `actions/profile.ts` (kept in sync by
 *  hand - both need to be identical so a guest's slug looks like anyone else's). */
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

/** Whole years old today - the wizard's own quick door check before the real eligibility engine runs
 *  (which uses `ageAtDate` against the tournament's start date, not "today"). */
function ageToday(dobIso: string): number | null {
  const born = new Date(`${dobIso}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const m = now.getUTCMonth() - born.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < born.getUTCDate())) age--;
  return age;
}

function emailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/** True when a Supabase Admin `createUser` refusal means "this email already has an account" - checked
 *  by both the (newer) error code and a message substring, since the exact shape has changed across
 *  supabase-js versions. */
function isDuplicateEmailError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const code = (err.code ?? '').toLowerCase();
  const message = (err.message ?? '').toLowerCase();
  return code === 'email_exists' || message.includes('already');
}

/**
 * Step 0 → (optional) division entry, in one call (master_plan §2AU B/D). Honeypot and the kill switch
 * are checked first (silently and with a friendly error respectively); then the shadow account is
 * created from the email - or, if that email already has an account, `existingAccount: true` is
 * returned so the wizard can switch to the OTP branch instead. On success the profile is filled with
 * the five facts step 0 collected, the guest cookie is set, and - if a division was chosen - the same
 * entry path a signed-in player would use runs under the new guest profile id.
 */
export async function startGuestEntry(
  tournamentId: string,
  input: StartGuestEntryInput,
): Promise<StartGuestEntryResult> {
  // Honeypot (§2AU G): a bot fills every field, including this hidden one no human sees. Return success
  // with nothing created, so the bot gets no signal it was caught.
  if (input.website && input.website.trim().length > 0) return { ok: true };

  const parsed = guestEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check your input.' };
  }
  const v = parsed.data;
  const age = ageToday(v.dateOfBirth);
  if (age === null || age < 5 || age > 100) return { error: 'Enter a valid date of birth.' };

  const svc = createServiceClient();

  try {
    const [enabled, tournRow] = await Promise.all([
      loadSettingFlag('guest_registration_enabled', true),
      svc.from('tournaments').select('status').eq('id', tournamentId).maybeSingle(),
    ]);
    const tournStatus = (tournRow.data as { status: string } | null)?.status ?? null;
    if (!enabled) return { error: 'Registering before an account is not available right now.' };
    if (tournStatus !== 'registration_open') {
      return { error: 'Registration is not open for this tournament.' };
    }

    // Rate limit (§2AU G): at most 2 guest-entry starts per email per 24h, via the append-only audit
    // log - no new table. `email_hash` is sha256(email lower), so raw emails never sit in audit rows.
    const hash = emailHash(v.email);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentStarts } = await svc
      .from('audit_logs')
      .select('id')
      .eq('action', 'guest.entry_started')
      .eq('after_snapshot->>email_hash', hash)
      .gte('created_at', since)
      .limit(2);
    if ((recentStarts ?? []).length >= 2) {
      return { error: 'Too many attempts for this email today - sign in instead.' };
    }

    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email: v.email,
      email_confirm: false,
      user_metadata: { source: 'guest_wizard' },
    });
    if (createErr) {
      if (isDuplicateEmailError(createErr as { message?: string; code?: string })) {
        // master_plan §2AU B: no error text - the UI switches to the "enter the code we just sent"
        // branch instead of showing this as a failure.
        return { ok: false, existingAccount: true };
      }
      return { error: 'Could not start your entry. Please try again.' };
    }
    const profileId = created.user?.id;
    if (!profileId) return { error: 'Could not start your entry. Please try again.' };

    // `handle_new_user` (migration 0001) inserts the profile row on auth user insert. If it has not
    // landed yet (replication lag), insert it ourselves once rather than fail the whole flow.
    const { data: existingProfile } = await svc
      .from('profiles')
      .select('id')
      .eq('id', profileId)
      .maybeSingle();
    if (!existingProfile) {
      await svc.from('profiles').insert({ id: profileId });
    }

    const base = slugify(v.firstName) || slugify(`${v.firstName}-${v.lastName}`) || 'player';
    const slug = `${base}-${randomUUID().slice(0, 6)}`;

    const { error: updateErr } = await svc
      .from('profiles')
      .update({
        first_name: v.firstName,
        last_name: v.lastName,
        nickname: v.firstName,
        sex: v.sex,
        date_of_birth: v.dateOfBirth,
        self_rated_skill: v.selfRatedSkill,
        slug,
        terms_accepted_version: LEGAL.version,
        terms_accepted_at: new Date().toISOString(),
      })
      .eq('id', profileId);
    if (updateErr) return { error: 'Could not save your details. Please try again.' };

    // Defensive (migration 0046 unapplied): a missing `guest_created_at` column must not fail the
    // whole entry - only this stamp is skipped, and it is logged so a stuck rollout is visible.
    try {
      const { error } = await svc
        .from('profiles')
        .update({ guest_created_at: new Date().toISOString() })
        .eq('id', profileId);
      if (error) throw error;
    } catch (e) {
      await writeAudit({
        actorId: profileId,
        action: 'guest.guest_created_at_write_failed',
        entityType: 'profile',
        entityId: profileId,
        after: { error: e instanceof Error ? e.message : String(e) },
      });
    }

    await setGuestCookie(profileId, tournamentId);
    await writeAudit({
      actorId: profileId,
      action: 'guest.entry_started',
      entityType: 'tournament',
      entityId: tournamentId,
      after: { email_hash: hash, tournament_id: tournamentId },
    });

    if (!v.divisionId) {
      return { ok: true, profileId };
    }

    const { data: divisionRow } = await svc
      .from('divisions')
      .select('format')
      .eq('id', v.divisionId)
      .maybeSingle();
    const format = (divisionRow as { format: string } | null)?.format ?? null;
    if (!format) return { ok: true, profileId, error: 'That division is unavailable.' };

    // NEVER `doEnterWithPendingPartner` for a guest (§2AU D) - a doubles partner is only ever a
    // free-text note here, invited for real after the guest verifies their email.
    const outcome =
      format === 'singles'
        ? await doRegisterSolo(tournamentId, v.divisionId, profileId)
        : await doEnterDoublesSolo(tournamentId, v.divisionId, profileId);
    if (outcome.error) return { ok: true, profileId, error: outcome.error };

    const registrationId = outcome.registrationId;
    if (registrationId && v.partnerNote) {
      // Defensive (migration 0046 unapplied): a missing `partner_note` column must not fail the entry
      // that already succeeded - only the note is dropped.
      try {
        const { error } = await svc
          .from('registrations')
          .update({ partner_note: v.partnerNote })
          .eq('id', registrationId);
        if (error) throw error;
      } catch (e) {
        await writeAudit({
          actorId: profileId,
          action: 'guest.partner_note_write_failed',
          entityType: 'registration',
          entityId: registrationId,
          after: { error: e instanceof Error ? e.message : String(e) },
        });
      }
    }

    if (registrationId && v.acknowledgedPlayDown) {
      await svc.from('registration_events').insert({
        registration_id: registrationId,
        actor_id: profileId,
        event_type: 'play_down_acknowledged',
        from_status: outcome.status ?? null,
        to_status: outcome.status ?? null,
      });
    }

    return {
      ok: true,
      profileId,
      registrationId,
      teamId: outcome.teamId,
      status: outcome.status,
    };
  } catch {
    return { error: 'Registration is temporarily unavailable. Please try again shortly.' };
  }
}

/** Step 1 of the "you already have an account" branch (master_plan §2AU B): send a login code to an
 *  email that already has an account. Never creates one (`shouldCreateUser: false`) - a guest who
 *  reaches this branch already failed `startGuestEntry`'s create-user call for that reason. */
export async function requestGuestOtp(email: string): Promise<{ ok?: boolean; error?: string }> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a valid email address' };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { shouldCreateUser: false },
    });
    if (error) return { error: error.message };
    return { ok: true };
  } catch {
    return { error: 'Sign-in is not available yet. Please try again shortly.' };
  }
}

/**
 * Step 2 of the "you already have an account" branch, AND the end of the ordinary guest flow's own
 * "verify your email" step (master_plan §2AU D): verify the emailed code, which establishes the
 * session. Unlike `verifyEmailOtp` in `actions/auth.ts`, this never redirects - the wizard stays in
 * place and reloads its own state as signed-in once this resolves `ok: true`.
 */
export async function verifyGuestOtpInline(
  email: string,
  token: string,
): Promise<{ ok?: boolean; error?: string }> {
  const emailParsed = emailSchema.safeParse(email);
  if (!emailParsed.success) {
    return { error: emailParsed.error.issues[0]?.message ?? 'Enter a valid email address' };
  }
  const tokenParsed = otpSchema.safeParse(token);
  if (!tokenParsed.success) {
    return {
      error: tokenParsed.error.issues[0]?.message ?? 'Enter the 6-digit code from your email',
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: emailParsed.data,
      token: tokenParsed.data,
      type: 'email',
    });
    if (error) return { error: error.message };
  } catch {
    return { error: 'Verification is not available yet. Please try again shortly.' };
  }

  await clearGuestCookie();
  return { ok: true };
}

/**
 * The wizard's own registration-state read while acting as a guest (master_plan §2AU C): resolves the
 * guest cookie (not a session - use `getViewerRegistrationState` directly for a signed-in viewer) and
 * returns the same `ViewerRegistrationState` shape the signed-in wizard already renders from, so the
 * UI needs no guest-specific branch once it has this. Null when there is no live guest cookie.
 */
export async function getGuestState(tournamentId: string): Promise<ViewerRegistrationState | null> {
  const actor = await resolveActor();
  if (!actor || !actor.guest) return null;
  return getViewerRegistrationState(tournamentId, actor.id);
}
