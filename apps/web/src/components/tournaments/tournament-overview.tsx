import type { OrganizerOverview } from '@/lib/tournaments/overview';

/**
 * Organizer overview tiles (handover §26.1). A compact KPI row computed from the registrations the
 * manage page already loaded. Neutral, theme-aware; the eligibility tile links the §25 review work.
 */
function Tile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'warning' | 'success';
}) {
  const valueColor =
    tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-foreground';
  return (
    <div className="border-border bg-background rounded-xl border p-3">
      <div className={`text-lg font-semibold tracking-tight ${valueColor}`}>{value}</div>
      <div className="text-foreground-muted mt-0.5 text-xs">{label}</div>
      {hint && <div className="text-foreground-muted mt-0.5 text-[11px]">{hint}</div>}
    </div>
  );
}

export function TournamentOverview({ overview }: { overview: OrganizerOverview }) {
  const money =
    overview.currency && overview.revenueCollected > 0
      ? `${overview.currency} ${overview.revenueCollected.toLocaleString()}`
      : overview.revenueCollected > 0
        ? overview.revenueCollected.toLocaleString()
        : '-';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Tile label="Active registrations" value={overview.totalRegistrations} />
        <Tile label="Confirmed teams" value={overview.confirmedTeams} tone="success" />
        <Tile
          label="Payments to review"
          value={overview.paymentsToReview}
          tone={overview.paymentsToReview > 0 ? 'warning' : 'default'}
        />
        <Tile label="Waitlisted" value={overview.waitlistCount} />
        <Tile
          label="Eligibility to review"
          value={overview.eligibilityReviewCount}
          tone={overview.eligibilityReviewCount > 0 ? 'warning' : 'default'}
        />
        <Tile label="Revenue collected" value={money} />
      </div>

      {overview.nearingCapacity.length > 0 && (
        <div className="border-warning/30 bg-warning/5 rounded-xl border p-3">
          <p className="text-foreground text-xs font-semibold">Divisions nearing capacity</p>
          <ul className="mt-1 space-y-0.5">
            {overview.nearingCapacity.map((d) => (
              <li key={d.name} className="text-foreground-muted text-xs">
                {d.name} - {d.active}/{d.capacity} slots
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
