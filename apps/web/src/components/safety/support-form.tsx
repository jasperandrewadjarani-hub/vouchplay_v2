'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SUPPORT_TICKET_CATEGORIES, SUPPORT_TICKET_CATEGORY_LABELS } from '@vouchplay/config';
import { submitSupportTicket } from '@/lib/actions/support';
import type { SafetyActionState } from '@/lib/actions/report';
import { Field, Select, Input, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: SafetyActionState = {};

/**
 * Support / appeal submission form (handover §36.38, §47). Appeals for material account actions
 * (suspension/ban) come through here.
 */
export function SupportForm({ defaultCategory }: { defaultCategory?: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(submitSupportTicket, empty);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
      <FormError>{state.error}</FormError>

      <Field label="Category" htmlFor="category" required>
        <Select id="category" name="category" defaultValue={defaultCategory ?? ''} required>
          <option value="" disabled>
            Select…
          </option>
          {SUPPORT_TICKET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {SUPPORT_TICKET_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Subject" htmlFor="subject" required>
        <Input id="subject" name="subject" maxLength={200} required placeholder="Short summary" />
      </Field>

      <Field label="Message" htmlFor="body" required>
        <textarea
          id="body"
          name="body"
          maxLength={4000}
          rows={5}
          required
          className="border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          placeholder="Tell us what's going on…"
        />
      </Field>

      <SubmitButton pendingLabel="Submitting…">Submit request</SubmitButton>
    </form>
  );
}
