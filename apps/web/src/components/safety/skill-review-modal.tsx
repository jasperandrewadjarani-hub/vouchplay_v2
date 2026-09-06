'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { submitSkillReview } from '@/lib/actions/skill-review';
import type { SafetyActionState } from '@/lib/actions/report';
import { Modal } from '@/components/ui/modal';
import { Field, Input, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: SafetyActionState = {};

/**
 * Skill review modal (handover §14.1) - separate from a report. Flags that a player's displayed /
 * community skill looks materially inaccurate. Submitter identity is stored but never shown publicly.
 */
export function SkillReviewModal({
  targetPlayerId,
  targetName,
  onClose,
}: {
  targetPlayerId: string;
  targetName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(submitSkillReview, empty);

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => {
        router.refresh();
        onClose();
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [state.ok, router, onClose]);

  return (
    <Modal
      title={`Request a skill review`}
      subtitle={`For ${targetName}. This is not a report - use Report for policy issues.`}
      onClose={onClose}
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="targetPlayerId" value={targetPlayerId} />

        <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
        <FormError>{state.error}</FormError>

        <Field
          label="Why does the skill look inaccurate?"
          htmlFor="reason"
          required
          hint="Explain what you've observed. Organizers may add tournament context."
        >
          <textarea
            id="reason"
            name="reason"
            maxLength={2000}
            rows={4}
            required
            className="border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            placeholder="e.g. Consistently plays two bands above their community level in local events."
          />
        </Field>

        <Field
          label="Evidence link (optional)"
          htmlFor="evidenceLink"
          hint="Bracket, result sheet, or video, if any."
        >
          <Input id="evidenceLink" name="evidenceLink" type="url" placeholder="https://…" />
        </Field>

        <SubmitButton pendingLabel="Submitting…" variant="secondary">
          Submit skill review
        </SubmitButton>
        <p className="text-foreground-muted text-center text-xs">
          Reviews never auto-change scores. Our team investigates before any action.
        </p>
      </form>
    </Modal>
  );
}
