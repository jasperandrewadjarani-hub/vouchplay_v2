'use client';

import { useActionState } from 'react';
import { SKILL_BANDS } from '@vouchplay/config';
import { completeOnboarding, type ProfileFormState } from '@/lib/actions/profile';
import { Field, Input, Select, FormError } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: ProfileFormState = {};

export function OnboardingForm({
  defaultFirstName = '',
  next,
}: {
  defaultFirstName?: string;
  next?: string;
}) {
  const [state, action] = useActionState(completeOnboarding, empty);

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <FormError>{state.error}</FormError>

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="firstName" required>
          <Input id="firstName" name="firstName" defaultValue={defaultFirstName} required />
        </Field>
        <Field label="Last name" htmlFor="lastName" required>
          <Input id="lastName" name="lastName" required />
        </Field>
      </div>

      <Field label="Nickname / IGN" htmlFor="nickname" required hint="How you're known on court.">
        <Input id="nickname" name="nickname" required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Sex" htmlFor="sex" required>
          <Select id="sex" name="sex" defaultValue="" required>
            <option value="" disabled>
              Select…
            </option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </Select>
        </Field>
        <Field label="City" htmlFor="city" required>
          <Input id="city" name="city" required />
        </Field>
      </div>

      <Field
        label="Self-rated skill"
        htmlFor="selfRatedSkill"
        required
        hint="Your own estimate. The community's rating builds from vouches."
      >
        <Select id="selfRatedSkill" name="selfRatedSkill" defaultValue="" required>
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
        />
      </Field>

      <Field label="Short bio" htmlFor="bio" hint="Optional, up to 300 characters.">
        <Input id="bio" name="bio" maxLength={300} />
      </Field>

      <SubmitButton pendingLabel="Saving…">Finish setup</SubmitButton>
    </form>
  );
}
