'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { runRemindersNow } from '@/lib/actions/admin-ops';
import { formatDateTime } from '@/lib/format-date';

/** Mirrors `getLastReminderRun()`'s return shape (master_plan §2AQ Decision G, `@/lib/tournaments/
 *  reminders`, a parallel lane) structurally rather than by import. */
export interface LastReminderRun {
  at: string;
  counts: Record<string, number> | null;
  outcome: string;
}

function summarizeCounts(counts: Record<string, number> | null | undefined): string | null {
  if (!counts) return null;
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return entries.map(([key, value]) => `${key}: ${value}`).join(' · ');
}

/**
 * Admin "Run reminders now" (master_plan §2AQ Decision G) - a manual trigger for the same
 * `runReminders()` the nightly cron calls, next to a plain-language line about the last run.
 */
export function OperationsPanel({ lastRun }: { lastRun: LastReminderRun | null }) {
  const router = useRouter();
  const [result, setResult] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setResult(null);
    start(async () => {
      const response = await runRemindersNow();
      if (!response.ok) {
        setResult({ kind: 'danger', text: response.error ?? 'Could not run reminders.' });
        return;
      }
      setResult({
        kind: 'success',
        text: summarizeCounts(response.counts) ?? 'Reminders run complete.',
      });
      router.refresh();
    });
  };

  const lastRunSummary = lastRun ? (summarizeCounts(lastRun.counts) ?? lastRun.outcome) : null;

  return (
    <section
      className="border-border bg-surface rounded-2xl border p-4"
      aria-labelledby="operations-heading"
    >
      <h2 id="operations-heading" className="text-foreground font-semibold">
        Operations
      </h2>
      <p className="text-foreground-muted mt-2 flex items-start gap-2 text-sm">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Reminders · last run {lastRun ? formatDateTime(lastRun.at) : 'never'}
          {lastRunSummary ? ` · ${lastRunSummary}` : ''}
        </span>
      </p>
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="border-border text-foreground hover:bg-surface-muted mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition-colors disabled:opacity-60"
      >
        {pending ? 'Running…' : 'Run reminders now'}
      </button>
      {result && (
        <p
          role={result.kind === 'danger' ? 'alert' : undefined}
          className={`mt-2 text-xs ${result.kind === 'danger' ? 'text-danger' : 'text-success'}`}
        >
          {result.text}
        </p>
      )}
    </section>
  );
}
