import { CircleCheck, CircleDollarSign, Clock, ListChecks, TriangleAlert } from 'lucide-react';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';

/**
 * Default-collapsed "My registrations (N)" summary shown immediately after the tournament details
 * (handover Phase 13.5). One row per active entry with division, team, status, and the next valid
 * action. A player may hold entries in several distinct divisions; each is independent. Status is
 * always conveyed with an icon plus text, never colour alone, and the native details/summary keeps
 * it keyboard and screen reader operable.
 */

interface EntryView {
  divisionId: string;
  divisionName: string;
  teamLabel: string | null;
  statusLabel: string;
  nextAction: string;
  tone: 'action' | 'waiting' | 'done';
}

const ACTIVE = new Set([
  'payment_pending',
  'payment_submitted',
  'under_review',
  'waitlisted',
  'confirmed',
]);

function buildEntries(state: ViewerRegistrationState, divisions: DivisionDTO[]): EntryView[] {
  const byId = new Map(divisions.map((d) => [d.id, d]));
  const rows: EntryView[] = [];
  for (const [divisionId, reg] of Object.entries(state.registrationsByDivision)) {
    if (!ACTIVE.has(reg.status)) continue;
    const division = byId.get(divisionId);
    const team = state.teamsByDivision[divisionId];
    const statusLabel = reg.status.replace(/_/g, ' ');
    let nextAction = 'No action needed';
    let tone: EntryView['tone'] = 'done';
    if (reg.paymentStatus === 'rejected') {
      nextAction = 'Resubmit payment';
      tone = 'action';
    } else if (reg.status === 'payment_pending') {
      nextAction = (division?.feeAmount ?? 0) > 0 ? 'Complete payment' : 'Awaiting confirmation';
      tone = (division?.feeAmount ?? 0) > 0 ? 'action' : 'waiting';
    } else if (reg.status === 'payment_submitted' || reg.status === 'under_review') {
      nextAction = 'Payment under review';
      tone = 'waiting';
    } else if (reg.status === 'waitlisted') {
      nextAction = 'On the waitlist';
      tone = 'waiting';
    } else if (reg.status === 'confirmed') {
      nextAction = 'Confirmed';
      tone = 'done';
    }
    rows.push({
      divisionId,
      divisionName: division?.name ?? 'Division',
      teamLabel: team ? team.members.map((m) => m.name).join(' & ') : null,
      statusLabel,
      nextAction,
      tone,
    });
  }
  return rows;
}

function ToneIcon({ tone }: { tone: EntryView['tone'] }) {
  if (tone === 'action') return <CircleDollarSign size={15} className="text-warning" aria-hidden />;
  if (tone === 'waiting') return <Clock size={15} className="text-foreground-muted" aria-hidden />;
  return <CircleCheck size={15} className="text-success" aria-hidden />;
}

export function MyRegistrationsSummary({
  state,
  divisions,
}: {
  state: ViewerRegistrationState;
  divisions: DivisionDTO[];
}) {
  const entries = buildEntries(state, divisions);
  if (entries.length === 0) return null;
  const actionable = entries.filter((e) => e.tone === 'action').length;

  return (
    <details className="border-border bg-surface rounded-2xl border">
      <summary className="text-foreground flex cursor-pointer list-none items-center gap-2 p-4 text-base font-semibold">
        <ListChecks size={18} className="text-primary" aria-hidden />
        My registrations ({entries.length})
        {actionable > 0 && (
          <span className="text-warning ml-1 inline-flex items-center gap-1 text-xs font-medium">
            <TriangleAlert size={13} aria-hidden />
            {actionable} need{actionable === 1 ? 's' : ''} action
          </span>
        )}
        <span className="text-foreground-muted ml-auto text-xs font-normal">Show</span>
      </summary>
      <ul className="border-border border-t">
        {entries.map((e) => (
          <li
            key={e.divisionId}
            className="border-border flex flex-wrap items-center gap-x-3 gap-y-1 border-b p-4 last:border-b-0"
          >
            <span className="min-w-0">
              <span className="text-foreground block text-sm font-medium">{e.divisionName}</span>
              {e.teamLabel && (
                <span className="text-foreground-muted block text-xs">Team: {e.teamLabel}</span>
              )}
            </span>
            <span className="text-foreground-muted ml-auto inline-flex items-center gap-1.5 text-xs capitalize">
              <ToneIcon tone={e.tone} />
              {e.statusLabel}
            </span>
            <a
              href="#register"
              className="border-border text-foreground hover:bg-surface-muted rounded-lg border px-3 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {e.nextAction}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
