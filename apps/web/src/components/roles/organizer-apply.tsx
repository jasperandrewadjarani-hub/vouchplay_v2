'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { applyForOrganizer } from '@/lib/actions/roles';
import type { SafetyActionState } from '@/lib/actions/report';
import { Field, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: SafetyActionState = {};

/**
 * Apply-for-Organizer entry point (handover §17.1). Rendered on /me. Shows current state (organizer /
 * pending / can apply) and a short application form.
 */
export function OrganizerApply({
  isOrganizer,
  hasPending,
  defaultOpen = false,
}: {
  isOrganizer: boolean;
  hasPending: boolean;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [state, action] = useActionState(applyForOrganizer, empty);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (isOrganizer) {
    return (
      <div className="border-border bg-surface flex items-center gap-2 rounded-2xl border p-4 text-sm">
        <Trophy size={16} className="text-primary" aria-hidden />
        <span className="text-foreground">
          You&apos;re an approved organizer — create tournaments anytime.
        </span>
      </div>
    );
  }

  if (hasPending || state.ok) {
    return (
      <div className="border-border bg-surface rounded-2xl border p-4 text-sm">
        <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
        {!state.ok && (
          <span className="text-foreground-muted">
            Your organizer application is under review. We&apos;ll be in touch.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="border-border bg-surface rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-primary" aria-hidden />
          <span className="text-foreground text-sm font-medium">Become an organizer</span>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-primary text-sm font-semibold"
          >
            Apply
          </button>
        )}
      </div>
      {open && (
        <form action={action} className="mt-3 space-y-3">
          <FormError>{state.error}</FormError>
          <Field label="Tell us about your organizing experience" htmlFor="motivation" required>
            <textarea
              id="motivation"
              name="motivation"
              rows={3}
              required
              maxLength={2000}
              className="border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              placeholder="Events you've run, your club, why you want to organize on VouchPlay…"
            />
          </Field>
          <SubmitButton pendingLabel="Submitting…">Submit application</SubmitButton>
        </form>
      )}
    </div>
  );
}
