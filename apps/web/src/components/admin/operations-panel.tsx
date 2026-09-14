'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Bell } from 'lucide-react';
import { runRemindersNow } from '@/lib/actions/admin-ops';
import { sendTestPush } from '@/lib/actions/push';
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
export function OperationsPanel({
  lastRun,
  pushDeviceCount,
}: {
  lastRun: LastReminderRun | null;
  /** Active `push_subscriptions` rows (master_plan §2AY Decision G) - null when not yet known. */
  pushDeviceCount?: number | null;
}) {
  const router = useRouter();
  const [result, setResult] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [pushResult, setPushResult] = useState<{ kind: 'success' | 'danger'; text: string } | null>(
    null,
  );
  const [pushPending, startPush] = useTransition();

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

  const submitTestPush = () => {
    setPushResult(null);
    startPush(async () => {
      const response = await sendTestPush();
      if (!response.ok) {
        setPushResult({ kind: 'danger', text: response.error ?? 'Could not send a test push.' });
        return;
      }
      setPushResult({
        kind: 'success',
        text: `Sent to ${response.sent ?? 0} device${response.sent === 1 ? '' : 's'}.`,
      });
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

      {/* master_plan §2AY Decision G: push device count + a self-test, same pattern as reminders. */}
      <p className="text-foreground-muted mt-4 flex items-start gap-2 text-sm">
        <Bell className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>Push · {pushDeviceCount ?? 0} devices on</span>
      </p>
      <button
        type="button"
        onClick={submitTestPush}
        disabled={pushPending}
        className="border-border text-foreground hover:bg-surface-muted mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition-colors disabled:opacity-60"
      >
        {pushPending ? 'Sending…' : 'Send me a test push'}
      </button>
      {pushResult && (
        <p
          role={pushResult.kind === 'danger' ? 'alert' : undefined}
          className={`mt-2 text-xs ${pushResult.kind === 'danger' ? 'text-danger' : 'text-success'}`}
        >
          {pushResult.text}
        </p>
      )}
    </section>
  );
}
