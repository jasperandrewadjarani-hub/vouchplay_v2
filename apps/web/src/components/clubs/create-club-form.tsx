'use client';

import { useActionState } from 'react';
import { createClub, type ClubActionState } from '@/lib/actions/club';
import { Field, Input, Select, FormError } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: ClubActionState = {};

/** Create-club form (handover §15.2). On success the action redirects to the new club page. */
export function CreateClubForm() {
  const [state, action] = useActionState(createClub, empty);

  return (
    <form action={action} className="space-y-4">
      <FormError>{state.error}</FormError>

      <Field label="Club name" htmlFor="name" required>
        <Input
          id="name"
          name="name"
          required
          maxLength={80}
          placeholder="e.g. Zamboanga Smashers"
        />
      </Field>

      <Field label="City" htmlFor="city" hint="Where the club is based.">
        <Input id="city" name="city" maxLength={120} placeholder="City" />
      </Field>

      <Field label="Description" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          className="border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          placeholder="What's your club about?"
        />
      </Field>

      <Field label="Who can join?" htmlFor="privacy" required>
        <Select id="privacy" name="privacy" defaultValue="public" required>
          <option value="public">Public — anyone can join instantly</option>
          <option value="approval_required">Approval required — admins approve requests</option>
        </Select>
      </Field>

      <Field
        label="Contact (optional)"
        htmlFor="contact"
        hint="A page link, email, or phone for enquiries."
      >
        <Input
          id="contact"
          name="contact"
          maxLength={200}
          placeholder="e.g. facebook.com/yourclub"
        />
      </Field>

      <Field label="Logo (optional)" htmlFor="logo" hint="PNG, JPG or WebP, up to 2 MB.">
        <input
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="text-foreground-muted file:border-border file:bg-surface file:text-foreground text-sm file:mr-3 file:rounded-lg file:border file:px-3 file:py-1.5 file:text-sm"
        />
      </Field>

      <SubmitButton pendingLabel="Creating…">Create club</SubmitButton>
      <p className="text-foreground-muted text-center text-xs">
        You&apos;ll be the owner. New clubs are reviewed by our team for the verified badge.
      </p>
    </form>
  );
}
