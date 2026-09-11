'use client';

import { useActionState } from 'react';
import { SKILL_BANDS, PH_CITIES } from '@vouchplay/config';
import { completeOnboarding, updateProfile, type ProfileFormState } from '@/lib/actions/profile';
import { Field, Input, Select, FormError } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: ProfileFormState = {};

export function OnboardingForm({
  initial = {},
  next,
  mode = 'onboarding',
}: {
  initial?: {
    firstName?: string;
    lastName?: string;
    nickname?: string;
    sex?: string;
    selfRatedSkill?: number | null;
    city?: string;
    facebookUrl?: string;
    bio?: string;
    lookingForPartner?: boolean;
    openForSponsorship?: boolean;
  };
  next?: string;
  mode?: 'onboarding' | 'edit';
}) {
  const [state, action] = useActionState(
    mode === 'edit' ? updateProfile : completeOnboarding,
    empty,
  );

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <FormError>{state.error}</FormError>

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="firstName" required>
          <Input id="firstName" name="firstName" defaultValue={initial.firstName ?? ''} required />
        </Field>
        <Field label="Last name" htmlFor="lastName" required>
          <Input id="lastName" name="lastName" defaultValue={initial.lastName ?? ''} required />
        </Field>
      </div>

      <Field label="Nickname / IGN" htmlFor="nickname" required hint="How you're known on court.">
        <Input id="nickname" name="nickname" defaultValue={initial.nickname ?? ''} required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Sex" htmlFor="sex" required>
          <Select id="sex" name="sex" defaultValue={initial.sex ?? ''} required>
            <option value="" disabled>
              Select…
            </option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </Select>
        </Field>
        <Field label="City" htmlFor="city" required>
          <Input
            id="city"
            name="city"
            list="ph-cities"
            autoComplete="off"
            defaultValue={initial.city ?? ''}
            required
          />
          {/* Native <datalist> autocomplete (§2AG Phase B): zero-JS, works on every phone; the input
              still accepts free text for a place not on the list. */}
          <datalist id="ph-cities">
            {PH_CITIES.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
        </Field>
      </div>

      <Field
        label="Self-rated skill"
        htmlFor="selfRatedSkill"
        required
        hint="Your own estimate. The community's rating builds from vouches."
      >
        <Select
          id="selfRatedSkill"
          name="selfRatedSkill"
          defaultValue={initial.selfRatedSkill != null ? String(initial.selfRatedSkill) : ''}
          required
        >
          <option value="" disabled>
            Select…
          </option>
          {SKILL_BANDS.map((band) => (
            <option key={band.key} value={band.ordinal}>
              {band.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Facebook profile" htmlFor="facebookUrl" hint="Optional. Does not affect skill.">
        <Input
          id="facebookUrl"
          name="facebookUrl"
          type="url"
          placeholder="https://facebook.com/…"
          defaultValue={initial.facebookUrl ?? ''}
        />
      </Field>

      <Field label="Short bio" htmlFor="bio" hint="Optional, up to 300 characters.">
        <Input id="bio" name="bio" maxLength={300} defaultValue={initial.bio ?? ''} />
      </Field>

      <Field
        label="Profile photo"
        htmlFor="avatar"
        hint={
          mode === 'edit'
            ? 'Optional. Leave blank to keep your current photo. PNG, JPG or WebP, up to 2 MB. Photos are optimized for fast loading.'
            : 'Optional. PNG, JPG or WebP, up to 2 MB. Photos are optimized for fast loading.'
        }
      >
        <input
          id="avatar"
          name="avatar"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="text-foreground-muted file:border-border file:bg-surface file:text-foreground hover:file:bg-surface-muted block w-full text-sm file:mr-3 file:rounded-lg file:border file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
      </Field>

      {/* Availability the player controls, shown as a badge and filterable in the directory (§2L).
          Checkboxes, styled as clear rows: the whole row is the target and the state is the label,
          not colour alone. */}
      <fieldset className="border-border space-y-2 rounded-xl border p-3">
        <legend className="text-foreground-muted px-1 text-xs font-medium">
          Let people find you
        </legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="lookingForPartner"
            defaultChecked={initial.lookingForPartner ?? false}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            <span className="text-foreground block font-medium">
              I&rsquo;m looking for a partner
            </span>
            <span className="text-foreground-muted block text-xs">
              Shows a badge on your profile and puts you in the &ldquo;Looking for partner&rdquo;
              filter.
            </span>
          </span>
        </label>
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="openForSponsorship"
            defaultChecked={initial.openForSponsorship ?? false}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            <span className="text-foreground block font-medium">Open to sponsorship</span>
            <span className="text-foreground-muted block text-xs">
              Lets clubs and sponsors find you in the directory.
            </span>
          </span>
        </label>
      </fieldset>

      {/* Consent captured at collection (§2AB). Onboarding is the single funnel BOTH email and
          Google sign-ups pass through, so the authoritative Terms/Privacy agreement lives here (the
          server refuses to finish, and records nothing, unless it is checked). Never shown in edit
          mode - existing players already accepted. Plain language + a 44px row for a wide age range. */}
      {mode === 'onboarding' && (
        <label className="border-border bg-surface-muted flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm">
          <input type="checkbox" name="agree" required className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="text-foreground">
            I agree to VouchPlay&rsquo;s{' '}
            <a
              href="/terms"
              target="_blank"
              rel="noreferrer"
              className="text-primary font-medium underline underline-offset-2"
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="text-primary font-medium underline underline-offset-2"
            >
              Privacy Policy
            </a>
            .
          </span>
        </label>
      )}

      <SubmitButton pendingLabel="Saving…">
        {mode === 'edit' ? 'Save changes' : 'Finish setup'}
      </SubmitButton>
    </form>
  );
}
