'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { postAnnouncement, type TournamentActionState } from '@/lib/actions/tournament';
import { Field, Input, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: TournamentActionState = {};

/** Organizer announcement composer (handover §36.30). */
export function AnnouncementForm({ tournamentId, slug }: { tournamentId: string; slug: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const action = postAnnouncement.bind(null, tournamentId, slug);
  const [state, formAction] = useActionState(action, empty);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
      <FormError>{state.error}</FormError>
      <Field label="Title" htmlFor="title" required>
        <Input
          id="title"
          name="title"
          required
          maxLength={200}
          placeholder="e.g. Schedule released"
        />
      </Field>
      <Field label="Message" htmlFor="body" required>
        <textarea
          id="body"
          name="body"
          rows={3}
          required
          maxLength={4000}
          className="border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          placeholder="Share an update with everyone following this tournament."
        />
      </Field>
      <input type="hidden" name="audience" value="all" />
      <SubmitButton pendingLabel="Posting…">Post announcement</SubmitButton>
    </form>
  );
}
