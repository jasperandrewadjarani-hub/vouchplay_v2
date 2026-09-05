import type { TournamentStatus } from '@vouchplay/db';

const LABELS: Record<TournamentStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  registration_open: 'Registration open',
  registration_closed: 'Registration closed',
  locked: 'Locked',
  live: 'Live',
  completed: 'Completed',
  archived: 'Archived',
  cancelled: 'Cancelled',
};

// Restrained tone classes (uses the theme tokens; registration_open + live get emphasis).
const TONE: Record<TournamentStatus, string> = {
  draft: 'bg-surface-muted text-foreground-muted',
  published: 'bg-surface-muted text-foreground',
  registration_open: 'bg-success/15 text-success',
  registration_closed: 'bg-surface-muted text-foreground',
  locked: 'bg-surface-muted text-foreground',
  live: 'bg-primary/15 text-primary',
  completed: 'bg-surface-muted text-foreground-muted',
  archived: 'bg-surface-muted text-foreground-muted',
  cancelled: 'bg-danger/15 text-danger',
};

export function TournamentStatusPill({ status }: { status: TournamentStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[status]}`}>
      {LABELS[status]}
    </span>
  );
}

export function tournamentStatusLabel(status: TournamentStatus): string {
  return LABELS[status];
}
