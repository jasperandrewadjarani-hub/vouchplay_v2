'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { TournamentActionState } from '@/lib/actions/tournament';
import { Field, Input, Select, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: TournamentActionState = {};

export interface TournamentFormInitial {
  name?: string;
  city?: string;
  venueName?: string;
  description?: string;
  visibility?: string;
  startAt?: string;
  endAt?: string;
  registrationOpenAt?: string;
  registrationCloseAt?: string;
  contact?: string;
  termsText?: string;
  paymentInstructions?: string;
  paymentMethods?: string;
}

const textarea =
  'border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2';

/** Shared create/edit tournament form (handover §17.3). The parent binds the server action. */
export function TournamentForm({
  action,
  initial = {},
  submitLabel,
  refreshOnSuccess = false,
  minimal = false,
}: {
  action: (state: TournamentActionState, formData: FormData) => Promise<TournamentActionState>;
  initial?: TournamentFormInitial;
  submitLabel: string;
  refreshOnSuccess?: boolean;
  /** Minimal mode (create): just the essentials; the rest is edited later on Manage. */
  minimal?: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, empty);

  useEffect(() => {
    if (state.ok && refreshOnSuccess) router.refresh();
  }, [state.ok, refreshOnSuccess, router]);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
      <FormError>{state.error}</FormError>

      <Field label="Tournament name" htmlFor="name" required>
        <Input id="name" name="name" required maxLength={120} defaultValue={initial.name ?? ''} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="City" htmlFor="city">
          <Input id="city" name="city" maxLength={120} defaultValue={initial.city ?? ''} />
        </Field>
        {!minimal && (
          <Field label="Venue" htmlFor="venueName">
            <Input
              id="venueName"
              name="venueName"
              maxLength={200}
              defaultValue={initial.venueName ?? ''}
            />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Start date" htmlFor="startAt" hint="Time is optional; a date is enough.">
          <Input id="startAt" name="startAt" type="date" defaultValue={initial.startAt ?? ''} />
        </Field>
        <Field label="End date" htmlFor="endAt">
          <Input id="endAt" name="endAt" type="date" defaultValue={initial.endAt ?? ''} />
        </Field>
      </div>
      <Field label="Visibility" htmlFor="visibility" required>
        <Select
          id="visibility"
          name="visibility"
          defaultValue={initial.visibility ?? 'public'}
          required
        >
          <option value="public">Public (listed in discovery)</option>
          <option value="unlisted">Unlisted (reachable by link only)</option>
        </Select>
      </Field>
      {minimal && (
        <p className="text-foreground-muted text-xs">
          You can add divisions, venue, registration dates, and payment details after creating the
          tournament.
        </p>
      )}
      {!minimal && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Registration opens" htmlFor="registrationOpenAt">
            <Input
              id="registrationOpenAt"
              name="registrationOpenAt"
              type="datetime-local"
              defaultValue={initial.registrationOpenAt ?? ''}
            />
          </Field>
          <Field label="Registration closes" htmlFor="registrationCloseAt">
            <Input
              id="registrationCloseAt"
              name="registrationCloseAt"
              type="datetime-local"
              defaultValue={initial.registrationCloseAt ?? ''}
            />
          </Field>
        </div>
      )}
      {!minimal && (
        <>
          <Field label="Description" htmlFor="description">
            <textarea
              id="description"
              name="description"
              rows={3}
              maxLength={4000}
              defaultValue={initial.description ?? ''}
              className={textarea}
            />
          </Field>
          <Field
            label="Contact"
            htmlFor="contact"
            hint="A page link, email, or phone for enquiries."
          >
            <Input
              id="contact"
              name="contact"
              maxLength={200}
              defaultValue={initial.contact ?? ''}
            />
          </Field>
          <Field label="Terms / rules" htmlFor="termsText">
            <textarea
              id="termsText"
              name="termsText"
              rows={3}
              maxLength={8000}
              defaultValue={initial.termsText ?? ''}
              className={textarea}
            />
          </Field>
          <Field
            label="Payment instructions"
            htmlFor="paymentInstructions"
            hint="Shown to registrants (payments come in a later phase)."
          >
            <textarea
              id="paymentInstructions"
              name="paymentInstructions"
              rows={2}
              maxLength={2000}
              defaultValue={initial.paymentInstructions ?? ''}
              className={textarea}
            />
          </Field>
          <Field
            label="Accepted payment methods"
            htmlFor="paymentMethods"
            hint="Comma-separated labels, e.g. GCash, Maya, bank transfer."
          >
            <Input
              id="paymentMethods"
              name="paymentMethods"
              maxLength={300}
              defaultValue={initial.paymentMethods ?? ''}
            />
          </Field>
          <Field
            label="Cover photo (optional)"
            htmlFor="cover"
            hint="PNG, JPG or WebP, up to 4 MB."
          >
            <input
              id="cover"
              name="cover"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="text-foreground-muted file:border-border file:bg-surface file:text-foreground text-sm file:mr-3 file:rounded-lg file:border file:px-3 file:py-1.5 file:text-sm"
            />
          </Field>
        </>
      )}

      <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
