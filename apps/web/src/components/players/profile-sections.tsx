import type { ReactNode } from 'react';
import Link from 'next/link';
import { SKILL_BANDS } from '@vouchplay/config';
import { PlayerAvatar } from './player-avatar';

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
          here by band — the community skill level is the weighted median of those vouches.
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

export function VouchComments({ comments }: { comments: CommentView[] }) {
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
          <li key={c.id} className="border-border flex gap-3 border-b pb-3 last:border-b-0 last:pb-0">
            <PlayerAvatar url={c.authorAvatarUrl} initials={c.authorInitials} name={c.authorName} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                {c.authorSlug ? (
                  <Link href={`/players/${c.authorSlug}`} className="hover:text-primary text-sm font-medium">
                    {c.authorName}
                  </Link>
                ) : (
                  <span className="text-sm font-medium">{c.authorName}</span>
                )}
                <time className="text-foreground-muted text-xs">
                  {new Date(c.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </time>
              </div>
              <p className="text-foreground mt-0.5 text-sm">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function Achievements() {
  return (
    <SectionCard title="Achievements">
      <EmptyNote>
        No achievements yet. Official achievements (tournament results, MVP, sportsmanship) are issued
        by verified organizers or admins; players can also add community claims for others to endorse.
      </EmptyNote>
    </SectionCard>
  );
}

export function SkillTags() {
  return (
    <SectionCard title="Skill tags">
      <EmptyNote>
        No skill tags yet. Community-endorsed traits like Dinking, Court IQ or Strong Defense show
        here. Skill tags don&apos;t affect the community skill level.
      </EmptyNote>
    </SectionCard>
  );
}
