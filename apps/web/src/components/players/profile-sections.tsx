import type { ReactNode } from 'react';
import Link from 'next/link';
import { SKILL_BANDS } from '@vouchplay/config';
import { formatShortMonthYear } from '@/lib/format-date';
import { SectionCard } from './section-card';

export { SectionCard };

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-foreground-muted text-sm">{children}</p>;
}

/**
 * Skill distribution by band (handover §9.2). Shows vouch counts per band from the computed
 * snapshot; anonymous vs public voucher identities are handled elsewhere (icons are a later add).
 */
export function SkillDistribution({
  distribution,
  total,
}: {
  distribution: Record<string, number>;
  total: number;
}) {
  const max = Math.max(1, ...SKILL_BANDS.map((b) => distribution[String(b.ordinal)] ?? 0));
  return (
    <SectionCard title="Community skill distribution">
      {total === 0 ? (
        <EmptyNote>
          No community vouches yet. Once players vouch for this profile, their skill ratings appear
          here by band - the community skill level is the weighted median of those vouches.
        </EmptyNote>
      ) : (
        <ul className="space-y-1.5">
          {[...SKILL_BANDS].reverse().map((band) => {
            const count = distribution[String(band.ordinal)] ?? 0;
            return (
              <li key={band.key} className="flex items-center gap-3">
                <span className="text-foreground-muted w-32 shrink-0 text-xs">{band.label}</span>
                <span className="bg-surface-muted h-2 flex-1 overflow-hidden rounded-full">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(count / max) * 100}%`, backgroundColor: band.color }}
                  />
                </span>
                <span className="text-foreground-muted w-6 text-right text-xs">{count}</span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

export function ContributionProgress({
  progress,
}: {
  progress: {
    score: number;
    level: number;
    distinctPlayersHelped: number;
    newcomerPlayersHelped: number;
    currentStreakWeeks: number;
    badges: string[];
  } | null;
}) {
  return (
    <SectionCard title="Community contribution">
      {!progress ? (
        <EmptyNote>
          Nothing here yet. This grows when you vouch for players you have genuinely played with.
        </EmptyNote>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <strong className="text-foreground text-2xl">Level {progress.level}</strong>
            <span className="text-foreground-muted text-sm">
              {progress.score.toFixed(1)} points
            </span>
          </div>
          <p className="text-foreground-muted text-sm">
            This is how much you have helped the community by vouching for others. It is not a skill
            score.
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-foreground-muted text-xs">Players helped</dt>
              <dd className="text-foreground font-semibold">{progress.distinctPlayersHelped}</dd>
            </div>
            <div>
              <dt className="text-foreground-muted text-xs">Newcomers supported</dt>
              <dd className="text-foreground font-semibold">{progress.newcomerPlayersHelped}</dd>
            </div>
            <div>
              <dt className="text-foreground-muted text-xs">Current streak</dt>
              <dd className="text-foreground font-semibold">{progress.currentStreakWeeks} weeks</dd>
            </div>
          </dl>
          {progress.badges.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Contribution badges">
              {progress.badges.map((badge) => (
                <li
                  key={badge}
                  className="border-primary/30 bg-primary/10 text-primary rounded-full border px-3 py-1 text-xs font-semibold"
                >
                  {badge.replaceAll('_', ' ')}
                </li>
              ))}
            </ul>
          )}
          {/* The old line named the internal algorithm (CONTRIB_V1) and its dampening terms, which
              meant nothing to a player. Same rules, said plainly. */}
          <p className="text-foreground-muted text-xs leading-relaxed">
            Helping someone new counts for more, vouching for the same person again adds little, and
            older activity slowly fades. Anonymous vouchers are never shown here.
          </p>
        </div>
      )}
    </SectionCard>
  );
}

const HISTORY_STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  waitlisted: 'Waitlisted',
  payment_submitted: 'Payment submitted',
  under_review: 'Under review',
};

/** Playing history (handover §49) - derived from the player's tournament registrations. */
export function PlayingHistory({
  history,
}: {
  history: {
    tournamentName: string;
    tournamentSlug: string | null;
    divisionName: string;
    status: string;
    date: string | null;
  }[];
}) {
  if (history.length === 0) {
    return (
      <SectionCard title="Playing history">
        <EmptyNote>No tournament history yet.</EmptyNote>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Playing history">
      <ul className="space-y-2">
        {history.map((h, i) => (
          <li
            key={`${h.tournamentSlug}-${h.divisionName}-${i}`}
            className="border-border bg-background flex items-center justify-between gap-2 rounded-xl border p-3"
          >
            <div className="min-w-0">
              <span className="text-foreground text-sm font-medium">
                {h.tournamentSlug ? (
                  <Link href={`/tournaments/${h.tournamentSlug}`} className="text-primary">
                    {h.tournamentName}
                  </Link>
                ) : (
                  h.tournamentName
                )}
              </span>
              <p className="text-foreground-muted mt-0.5 text-xs">{h.divisionName}</p>
            </div>
            <div className="shrink-0 text-right">
              <span className="text-foreground-muted text-xs">
                {HISTORY_STATUS_LABELS[h.status] ?? h.status}
              </span>
              {h.date && (
                <p className="text-foreground-muted text-[11px]">{formatShortMonthYear(h.date)}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
