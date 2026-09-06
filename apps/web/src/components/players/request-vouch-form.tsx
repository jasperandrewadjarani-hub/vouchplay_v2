'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { requestVouch, type VouchActionState } from '@/lib/actions/vouch';
import { Field, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: VouchActionState = {};

/**
 * Request-a-vouch modal (handover §12). Sends an attributed request to another player asking them to
 * vouch for you. The server enforces block/duplicate/rate rules; one pending request per pair.
 */
export function RequestVouchForm({
  recipientId,
  recipientName,
  onClose,
}: {
  recipientId: string;
  recipientName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(requestVouch, empty);

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => {
        router.refresh();
        onClose();
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [state.ok, router, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Request a vouch from ${recipientName}`}
      onClick={onClose}
    >
      <div
        className="border-border bg-surface max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-foreground text-lg font-semibold">Request a vouch</h2>
            <p className="text-foreground-muted text-sm">
              Ask {recipientName} to vouch for your skill. They&apos;ll see who&apos;s asking.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-foreground-muted hover:text-foreground rounded-lg p-1"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <form action={action} className="space-y-4">
          <input type="hidden" name="recipientId" value={recipientId} />

          <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
          <FormError>{state.error}</FormError>

          <Field
            label="Add a note (optional)"
            htmlFor="message"
            hint="Shown with your name, e.g. how you know each other."
          >
            <textarea
              id="message"
              name="message"
              maxLength={500}
              rows={3}
              className="border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              placeholder="e.g. We played mixed doubles at the Saturday open plays."
            />
          </Field>

          <SubmitButton pendingLabel="Sending…">Send request</SubmitButton>
          <p className="text-foreground-muted text-center text-xs">
            One pending request per player. They decide whether to vouch.
          </p>
        </form>
      </div>
    </div>
  );
}
