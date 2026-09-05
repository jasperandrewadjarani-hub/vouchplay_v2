import type { ReactNode } from 'react';
import { SKILL_BANDS } from '@vouchplay/config';

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
 * Skill distribution by band (handover §9.2). The vouch data arrives in Phase 3; until then this
 * shows the band scaffold with an explanatory empty state so the layout is real and testable.
 */
export function SkillDistribution() {
  return (
    <SectionCard title="Community skill distribution">
      <EmptyNote>
        No community vouches yet. Once players vouch for this profile, their skill ratings appear here
        by band — the community skill level is the weighted median of those vouches.
      </EmptyNote>
      <ul className="mt-3 space-y-1.5">
        {[...SKILL_BANDS]
          .slice()
          .reverse()
          .map((band) => (
            <li key={band.key} className="flex items-center gap-3">
              <span className="text-foreground-muted w-32 shrink-0 text-xs">{band.label}</span>
              <span className="bg-surface-muted h-2 flex-1 overflow-hidden rounded-full">
                <span className="block h-full rounded-full" style={{ width: 0, backgroundColor: band.color }} />
              </span>
              <span className="text-foreground-muted w-6 text-right text-xs">0</span>
            </li>
          ))}
      </ul>
    </SectionCard>
  );
}

export function VouchComments() {
  return (
    <SectionCard title="Vouch comments">
      <EmptyNote>
        No comments yet. Vouch comments are always attributed to their author, even when the skill
        rating itself is anonymous.
      </EmptyNote>
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
