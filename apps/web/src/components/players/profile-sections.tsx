import type { ReactNode } from 'react';
import Link from 'next/link';
import { SKILL_BANDS } from '@vouchplay/config';
import { PlayerAvatar } from './player-avatar';
import { CommentReportButton } from '@/components/safety/comment-report-button';

/** Titled card wrapper for profile sections (handover §9). */
export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-border bg-surface rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-foreground text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

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

export interface CommentView {
  id: string;
  authorName: string;
  authorSlug: string | null;
  authorInitials: string;
  authorAvatarUrl: string | null;
  date: string;
  body: string;
}

export function VouchComments({
  comments,
  authed = false,
}: {
  comments: CommentView[];
  authed?: boolean;
}) {
  if (comments.length === 0) {
    return (
      <SectionCard title="Vouch comments">
        <EmptyNote>
          No comments yet. Vouch comments are always attributed to their author, even when the skill
          rating itself is anonymous.
        </EmptyNote>
      </SectionCard>
    );
  }
  return (
    <SectionCard title={`Vouch comments (${comments.length})`}>
      <ul className="space-y-3">
        {comments.map((c) => (
          <li
            key={c.id}
            className="border-border flex gap-3 border-b pb-3 last:border-b-0 last:pb-0"
          >
            <PlayerAvatar
              url={c.authorAvatarUrl}
              initials={c.authorInitials}
              name={c.authorName}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                {c.authorSlug ? (
                  <Link
                    href={`/players/${c.authorSlug}`}
                    className="hover:text-primary text-sm font-medium"
                  >
                    {c.authorName}
                  </Link>
                ) : (
                  <span className="text-sm font-medium">{c.authorName}</span>
                )}
                <time className="text-foreground-muted text-xs">
                  {new Date(c.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
              </div>
              <p className="text-foreground mt-0.5 text-sm">{c.body}</p>
              {authed && (
                <div className="mt-1">
                  <CommentReportButton commentId={c.id} authorName={c.authorName} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
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
                <p className="text-foreground-muted text-[11px]">
                  {new Date(h.date).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
