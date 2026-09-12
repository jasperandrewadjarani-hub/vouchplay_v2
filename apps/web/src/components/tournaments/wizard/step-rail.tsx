import { Check } from 'lucide-react';
import type { WizardStep } from './types';

/** The rail's steps, in order. 'partner' is omitted entirely for singles by the caller. */
const RAIL: { key: WizardStep; label: string }[] = [
  { key: 'division', label: 'Division' },
  { key: 'partner', label: 'Partner' },
  { key: 'pay', label: 'Pay' },
  { key: 'receipt', label: 'Receipt' },
];

/**
 * "Division · Partner · Pay · Receipt" (master_plan §2AO B) - one decision per screen, and always
 * visible so a player always knows how many taps are left. 'done' has no rail position of its own;
 * it renders the rail fully complete.
 */
export function StepRail({
  step,
  includePartner,
}: {
  step: WizardStep;
  /** False for singles - the partner step never happens, so it never appears in the rail. */
  includePartner: boolean;
}) {
  const steps = includePartner ? RAIL : RAIL.filter((s) => s.key !== 'partner');
  const activeIndex = step === 'done' ? steps.length : steps.findIndex((s) => s.key === step);

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
