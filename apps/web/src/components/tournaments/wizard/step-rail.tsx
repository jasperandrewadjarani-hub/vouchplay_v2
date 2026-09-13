import { Check } from 'lucide-react';
import type { WizardMode, WizardStep } from './types';

type RailKey = 'about-you' | 'division' | 'partner' | 'pay' | 'verify';

/** The rail's steps, in order. 'partner' is omitted entirely for singles by the caller. Pay and
 *  Receipt are one decision - "how do I pay, and here is my receipt" - split across two screens for
 *  room, so they share this one circle (master_plan §2AS A2/Decision A). */
const PLAYER_RAIL: { key: RailKey; label: string }[] = [
  { key: 'division', label: 'Division' },
  { key: 'partner', label: 'Partner' },
  { key: 'pay', label: 'Pay' },
];

/** Guest rail (master_plan §2AU §1/Decision D): About you comes first (nothing is created yet), and
 *  Verify closes it out - creating the account is just confirming the email already given. */
const GUEST_RAIL: { key: RailKey; label: string }[] = [
  { key: 'about-you', label: 'About you' },
  { key: 'division', label: 'Division' },
  { key: 'partner', label: 'Partner' },
  { key: 'pay', label: 'Pay' },
  { key: 'verify', label: 'Verify' },
];

/**
 * "Division · Partner · Pay" (master_plan §2AS A2), or the guest's five-step "About you · Division ·
 * Partner · Pay · Verify" (master_plan §2AU) - one decision per screen, and always visible so a
 * player always knows how many taps are left. `pay` and `receipt` both render as the Pay circle
 * (internally still two screens); `done`, `existing-account` and `verify-later` have no rail position
 * of their own and render the rail fully complete.
 */
export function StepRail({
  step,
  includePartner,
  mode = 'player',
}: {
  step: WizardStep;
  /** False for singles - the partner step never happens, so it never appears in the rail. */
  includePartner: boolean;
  mode?: WizardMode;
}) {
  const rail = mode === 'guest' ? GUEST_RAIL : PLAYER_RAIL;
  const steps = includePartner ? rail : rail.filter((s) => s.key !== 'partner');
  const effectiveStep = step === 'receipt' ? 'pay' : step;
  const isTerminal =
    effectiveStep === 'done' ||
    effectiveStep === 'existing-account' ||
    effectiveStep === 'verify-later';
  const activeIndex = isTerminal ? steps.length : steps.findIndex((s) => s.key === effectiveStep);

  return (
    <ol className="mb-4 flex items-center gap-1.5" aria-label="Registration steps">
      {steps.map((s, i) => {
        const done = i < activeIndex;
        const current = i === activeIndex;
        return (
          <li key={s.key} className="flex flex-1 items-center gap-1.5">
            <span
              className={`flex items-center gap-1.5 text-xs font-semibold ${
                current ? 'text-foreground' : done ? 'text-primary' : 'text-foreground-muted'
              }`}
            >
              <span
                aria-hidden
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  done
                    ? 'vp-gradient text-white'
                    : current
                      ? 'border-primary text-primary border-2'
                      : 'border-border text-foreground-muted border'
                }`}
              >
                {done ? <Check size={12} aria-hidden /> : i + 1}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden className={`h-px flex-1 ${done ? 'bg-primary' : 'bg-border'}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
