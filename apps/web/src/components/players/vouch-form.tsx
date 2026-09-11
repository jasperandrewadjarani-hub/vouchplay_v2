'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { SKILL_BANDS } from '@vouchplay/config';
import { submitVouch, type VouchActionState } from '@/lib/actions/vouch';
import { VOUCH_INTERACTION_OPTIONS } from '@/lib/vouches/interaction';
import { Field, Select, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: VouchActionState = {};

/**
 * Vouch modal (handover §10.1). Skill, played with/against, optional coach weight (only rendered for
 * approved coaches), anonymous toggle (default ON - public attribution of the rating), optional
 * always-attributed comment. The server enforces every locked rule; this is the entry surface.
 */
export function VouchForm({
  targetId,
  targetName,
  viewerIsCoach,
  newcomerLimit = 0,
  minimalPower = false,
  onClose,
}: {
  targetId: string;
  targetName: string;
  viewerIsCoach: boolean;
  /** > 0 when the viewer is a newcomer (master_plan §2AJ) and a newcomer cap is in force: shows the
   *  one-line rule up front so the cap is never a surprise. 0 = nothing shown. */
  newcomerLimit?: number;
  /** True when the VIEWER (the person about to vouch) is currently a minimal account (master_plan
   *  §2AN decision 5, v1.67 - no photo, no approved ID, no vouch received yet). Shows one muted line
   *  explaining why their vouch counts for less right now. Caller-supplied; this component does not
   *  fetch it itself. */
  minimalPower?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(submitVouch, empty);

  // Refresh the profile behind the dialog, but do not auto-close: the confirmation is where the
  // next useful action lives (§1S).
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

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
            <p className="text-foreground-muted text-sm">
              Rate the skill you&apos;ve actually seen.
            </p>
            {newcomerLimit > 0 && (
              <p className="text-foreground-muted mt-1 text-xs">
                New here? You can vouch for up to {newcomerLimit} players a day until other players
                vouch for you, or you register for a tournament or verify your ID.
              </p>
            )}
            {minimalPower && (
              <p className="text-foreground-muted mt-1 text-xs">
                Your vouch counts at half strength until you add a photo, verify your ID, or receive
                a vouch.
              </p>
            )}
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

        {state.ok ? (
          /*
           * Growth without manufacturing reciprocal pairs. A "request a vouch back" button here
           * would produce exactly the repeat pairs CONTRIB_V1 discounts, and a vouch given while
           * asking for one back is not independent evidence (§1S). Sending people to vouch for
           * someone ELSE grows the graph in the direction that makes ratings more trustworthy, and
           * is what the scoring actually rewards: distinct players supported.
           */
          <div className="space-y-4 text-center" role="status">
            <span className="bg-success/15 text-success mx-auto flex h-14 w-14 items-center justify-center rounded-full">
              <Check size={28} aria-hidden />
            </span>
            <div>
              {state.held ? (
                <>
                  <p className="text-foreground text-lg font-bold">Thanks – your vouch is saved.</p>
                  <p className="text-foreground-muted mt-1 text-sm">
                    It will count after a quick review. You don&apos;t need to do anything.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-foreground text-lg font-bold">Thank you. Your vouch is in.</p>
                  <p className="text-foreground-muted mt-1 text-sm">
                    It strengthens {targetName}&apos;s skill level and how confident the community
                    is about it.
                  </p>
                </>
              )}
            </div>
            <p className="text-foreground-muted text-sm">
              Who else have you played with? Vouching for more people you genuinely know is what
              makes everyone&apos;s profile more trustworthy.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href="/players"
                onClick={onClose}
                className="vp-gradient flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-white"
              >
                Vouch for someone else
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="text-foreground-muted hover:text-foreground min-h-[44px] text-sm font-medium"
              >
                Done for now
              </button>
            </div>
          </div>
        ) : (
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

            {/* "Watched them play" lets an honest voucher say what they actually saw instead of
              picking a play relationship that never happened. It is a context label only - it does
              not change vouch weight (§10.5, LOCKED). */}
            <Field
              label="How do you know their game?"
              htmlFor="interactionType"
              required
              hint="Answer honestly. This is shown as context, and it does not change how much your vouch counts."
            >
              <Select id="interactionType" name="interactionType" defaultValue="with" required>
                {VOUCH_INTERACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
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
                  Hides your identity on the public rating. VouchPlay admins may still inspect it
                  for safety. Any comment you add is never anonymous.
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
        )}
      </div>
    </div>
  );
}
