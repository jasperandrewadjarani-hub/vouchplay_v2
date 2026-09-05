'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { REPORT_REASON_CODES, REPORT_REASON_LABELS } from '@vouchplay/config';
import { submitReport, type SafetyActionState } from '@/lib/actions/report';
import { Modal } from '@/components/ui/modal';
import { Field, Select, Input, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: SafetyActionState = {};

/**
 * Report modal (handover §14.2). Works for any reportable UGC — a player profile or a vouch comment.
 * Reporter identity is always stored server-side (never anonymous to Admin).
 */
export function ReportModal({
  targetType,
  targetId,
  targetLabel,
  onClose,
}: {
  targetType: 'player' | 'comment';
  targetId: string;
  targetLabel: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(submitReport, empty);

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
      title={`Report ${targetLabel}`}
      subtitle="Our team reviews every report."
      onClose={onClose}
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="targetType" value={targetType} />
        <input type="hidden" name="targetId" value={targetId} />

        <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
        <FormError>{state.error}</FormError>

        <Field label="Reason" htmlFor="reasonCode" required>
          <Select id="reasonCode" name="reasonCode" defaultValue="" required>
            <option value="" disabled>
              Select a reason…
            </option>
            {REPORT_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {REPORT_REASON_LABELS[code]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Details (optional)" htmlFor="details" hint="What happened? Be specific.">
          <textarea
            id="details"
            name="details"
            maxLength={2000}
            rows={3}
            className="border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            placeholder="Describe the issue…"
          />
        </Field>

        <Field
          label="Evidence link (optional)"
          htmlFor="evidenceLink"
          hint="A link to a screenshot or post, if any."
        >
          <Input id="evidenceLink" name="evidenceLink" type="url" placeholder="https://…" />
        </Field>

        <SubmitButton pendingLabel="Submitting…" variant="primary">
          Submit report
        </SubmitButton>
        <p className="text-foreground-muted text-center text-xs">
          False or abusive reports may themselves be actioned.
        </p>
      </form>
    </Modal>
  );
}
