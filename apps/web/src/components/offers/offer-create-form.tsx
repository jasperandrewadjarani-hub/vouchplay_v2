'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SKILL_BANDS } from '@vouchplay/config';
import { createOffer, type OfferActionState } from '@/lib/actions/offer';
import { Field, Input, Select, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: OfferActionState = {};
const textarea =
  'border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2';

/** Create a draft club offer (Phase 14A). Publishing is a separate step in the offers list. */
export function OfferCreateForm({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(createOffer.bind(null, clubId), empty);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
      <FormError>{state.error}</FormError>
      <Field label="Type" htmlFor="type" required>
        <Select id="type" name="type" defaultValue="recruitment">
          <option value="recruitment">Recruitment (looking for players)</option>
          <option value="sponsorship">Sponsorship (offering support)</option>
        </Select>
      </Field>
      <Field label="Title" htmlFor="title" required>
        <Input
          id="title"
          name="title"
          required
          maxLength={120}
          placeholder="e.g. Looking for mixed doubles players"
        />
      </Field>
      <Field label="Details" htmlFor="description" hint="What are you offering or looking for?">
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          className={textarea}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="City" htmlFor="city">
          <Input id="city" name="city" maxLength={120} />
        </Field>
        <Field label="From level" htmlFor="minSkill">
          <Select id="minSkill" name="minSkill" defaultValue="">
            <option value="">Any</option>
            {SKILL_BANDS.map((b) => (
              <option key={b.key} value={b.ordinal}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="To level" htmlFor="maxSkill">
          <Select id="maxSkill" name="maxSkill" defaultValue="">
            <option value="">Any</option>
            {SKILL_BANDS.map((b) => (
              <option key={b.key} value={b.ordinal}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="text-foreground-muted text-xs">
        Levels help players find relevant offers. They never block a response.
      </p>
      <SubmitButton pendingLabel="Creating…">Create draft</SubmitButton>
    </form>
  );
}
