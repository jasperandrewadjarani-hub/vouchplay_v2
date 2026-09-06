'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toggleSkillTag } from '@/lib/actions/achievements';
import type { SkillTagView } from '@/lib/players/profile-extras';

/** Community-endorsed skill tags (handover §9.5). Not part of the community skill level. */
export function SkillTagsPanel({
  playerId,
  slug,
  authed,
  isOwnProfile,
  tags,
}: {
  playerId: string;
  slug: string;
  authed: boolean;
  isOwnProfile: boolean;
  tags: SkillTagView[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const canEndorse = authed && !isOwnProfile;

  const withVotes = tags.filter((t) => t.count > 0);
  // Endorsers see the full catalog to add traits; others see only endorsed ones.
  const visible = canEndorse && expanded ? tags : withVotes;

  function toggle(tagId: string) {
    setBusy(tagId);
    start(async () => {
      await toggleSkillTag(playerId, tagId);
      setBusy(null);
      router.refresh();
    });
  }

  return (
    <section className="border-border bg-surface rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-foreground text-base font-semibold">Skill tags</h2>
        {canEndorse && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-primary text-xs font-medium"
          >
            {expanded ? 'Done' : 'Endorse traits'}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-foreground-muted text-sm">
          No skill tags yet. Community-endorsed traits like Dinking or Court IQ show here.
          {!authed && (
            <>
              {' '}
              <Link href={`/signup?next=/players/${slug}`} className="text-primary">
                Sign in
              </Link>{' '}
              to endorse.
            </>
          )}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {visible.map((t) => {
            const active = t.votedByViewer;
            const base =
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors';
            if (canEndorse) {
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={pending && busy === t.id}
                  onClick={() => toggle(t.id)}
                  aria-pressed={active}
                  className={`${base} disabled:opacity-50 ${
                    active
                      ? 'border-primary text-primary bg-primary/10'
                      : 'border-border text-foreground hover:bg-surface-muted'
                  }`}
                >
                  {t.name}
                  {t.count > 0 && <span className="text-foreground-muted">· {t.count}</span>}
                </button>
              );
            }
            return (
              <span key={t.id} className={`${base} border-border text-foreground`}>
                {t.name}
                <span className="text-foreground-muted">· {t.count}</span>
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}
