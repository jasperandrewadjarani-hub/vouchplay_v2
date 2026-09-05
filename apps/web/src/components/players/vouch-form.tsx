'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { SKILL_BANDS } from '@vouchplay/config';
import { submitVouch, type VouchActionState } from '@/lib/actions/vouch';
import { Field, Select, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: VouchActionState = {};

/**
 * Vouch modal (handover §10.1). Skill, played with/against, optional coach weight (only rendered for
 * approved coaches), anonymous toggle (default ON — public attribution of the rating), optional
 * always-attributed comment. The server enforces every locked rule; this is the entry surface.
 */
export function VouchForm({
  targetId,
  targetName,
  viewerIsCoach,
  onClose,
}: {
  targetId: string;
  targetName: string;
  viewerIsCoach: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(submitVouch, empty);

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
      aria-label={`Vouch for ${targetName}`}
      onClick={onClose}
    >
      <div
        className="border-border bg-surface max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-foreground text-lg font-semibold">Vouch for {targetName}</h2>
            <p className="text-foreground-muted text-sm">Rate the skill you&apos;ve actually seen.</p>
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
          <input type="hidden" name="targetId" value={targetId} />

          <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
          <FormError>{state.error}</FormError>

          <Field label="Their skill level" htmlFor="skillLevel" required>
            <Select id="skillLevel" name="skillLevel" defaultValue="" required>
              <option value="" disabled>
                Select…
              </option>
              {SKILL_BANDS.map((b) => (
                <option key={b.key} value={b.ordinal}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="How did you play with them?" htmlFor="interactionType" required>
            <Select id="interactionType" name="interactionType" defaultValue="with" required>
              <option value="with">Played with (partner)</option>
              <option value="against">Played against (opponent)</option>
            </Select>
          </Field>

          {viewerIsCoach && (
            <label className="border-border flex items-start gap-2 rounded-xl border p-3 text-sm">
              <input type="checkbox" name="asCoach" className="mt-0.5" />
              <span>
                <span className="text-foreground font-medium">Vouch as a Coach</span>
                <span className="text-foreground-muted block text-xs">
                  Applies coach weight. Off by default.
                </span>
              </span>
            </label>
          )}

          <label className="border-border flex items-start gap-2 rounded-xl border p-3 text-sm">
            <input type="checkbox" name="anonymous" defaultChecked className="mt-0.5" />
            <span>
              <span className="text-foreground font-medium">Keep my rating anonymous</span>
              <span className="text-foreground-muted block text-xs">
                Hides your identity on the public rating. VouchPlay admins may still inspect it for
                safety. Any comment you add is never anonymous.
              </span>
            </span>
          </label>

          <Field label="Comment (optional)" htmlFor="comment" hint="Always shown with your name.">
            <textarea
              id="comment"
              name="comment"
              maxLength={1000}
              rows={3}
              className="border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              placeholder="e.g. Great dinking and court awareness."
            />
          </Field>

          <SubmitButton pendingLabel="Saving…">Submit vouch</SubmitButton>
          <p className="text-foreground-muted text-center text-xs">
            One active vouch per player. Updating replaces your previous rating.
          </p>
        </form>
      </div>
    </div>
  );
}
