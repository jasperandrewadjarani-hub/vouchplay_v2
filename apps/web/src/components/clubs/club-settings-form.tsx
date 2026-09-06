'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateClub, type ClubActionState } from '@/lib/actions/club';
import { Field, Input, Select, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: ClubActionState = {};

interface Props {
  clubId: string;
  slug: string;
  initial: {
    name: string;
    city: string | null;
    description: string | null;
    privacy: 'public' | 'approval_required';
    contact: string | null;
    logoUrl: string | null;
  };
}

/** Club settings editor (handover §15.3 edit). Manager-gated server-side. */
export function ClubSettingsForm({ clubId, slug, initial }: Props) {
  const router = useRouter();
  const action = updateClub.bind(null, clubId, slug);
  const [state, formAction] = useActionState(action, empty);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
      <FormError>{state.error}</FormError>

      <Field label="Club name" htmlFor="name" required>
        <Input id="name" name="name" required maxLength={80} defaultValue={initial.name} />
      </Field>
      <Field label="City" htmlFor="city">
        <Input id="city" name="city" maxLength={120} defaultValue={initial.city ?? ''} />
      </Field>
      <Field label="Description" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={initial.description ?? ''}
          className="border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      </Field>
      <Field label="Who can join?" htmlFor="privacy" required>
        <Select id="privacy" name="privacy" defaultValue={initial.privacy} required>
          <option value="public">Public - anyone can join instantly</option>
          <option value="approval_required">Approval required - admins approve requests</option>
        </Select>
      </Field>
      <Field label="Contact" htmlFor="contact">
        <Input id="contact" name="contact" maxLength={200} defaultValue={initial.contact ?? ''} />
      </Field>
      <Field label="Replace logo (optional)" htmlFor="logo" hint="PNG, JPG or WebP, up to 2 MB.">
        <input
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="text-foreground-muted file:border-border file:bg-surface file:text-foreground text-sm file:mr-3 file:rounded-lg file:border file:px-3 file:py-1.5 file:text-sm"
        />
      </Field>

      <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
    </form>
  );
}
