'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Award, BadgeCheck, ThumbsUp, Trash2 } from 'lucide-react';
import {
  addCommunityAchievement,
  removeCommunityAchievement,
  toggleEndorsement,
} from '@/lib/actions/achievements';
import type { AchievementView } from '@/lib/players/profile-extras';

/** Achievements (handover §9.4): official (verified issuer) + community claims (peer-endorsed). */
export function AchievementsPanel({
  authed,
  isOwnProfile,
  official,
  community,
}: {
  authed: boolean;
  isOwnProfile: boolean;
  official: AchievementView[];
  community: AchievementView[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      setMsg(res.error ?? res.message ?? null);
      if (res.ok) router.refresh();
    });
  }

  function submitClaim() {
    if (title.trim().length < 2) return;
    run(async () => {
      const res = await addCommunityAchievement(title, desc);
      if (res.ok) {
        setTitle('');
        setDesc('');
        setShowAdd(false);
      }
      return res;
    });
  }

  const empty = official.length === 0 && community.length === 0;

  return (
    <section className="border-border bg-surface rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-foreground text-base font-semibold">Achievements</h2>
        {isOwnProfile && authed && (
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="text-primary text-xs font-medium"
          >
            {showAdd ? 'Cancel' : 'Add a claim'}
          </button>
        )}
      </div>

      {showAdd && (
        <div className="border-border mb-3 space-y-2 rounded-xl border p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Claim title (e.g. Club league finalist)"
            maxLength={80}
            className="border-border bg-background w-full rounded-lg border px-2.5 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Optional detail"
            rows={2}
            className="border-border bg-background w-full rounded-lg border px-2.5 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending || title.trim().length < 2}
              onClick={submitClaim}
              className="vp-gradient rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Add claim
            </button>
            <span className="text-foreground-muted text-[11px]">
              Community claims are labeled as such, not official records.
            </span>
          </div>
        </div>
      )}

      {empty ? (
        <p className="text-foreground-muted text-sm">
          No achievements yet. Official achievements (tournament results, MVP, sportsmanship) are
          issued by verified organizers; players can add community claims for others to endorse.
        </p>
      ) : (
        <div className="space-y-4">
          {official.length > 0 && (
            <ul className="space-y-2">
              {official.map((a) => (
                <li
                  key={a.id}
                  className="border-border bg-background flex items-start gap-2.5 rounded-xl border p-3"
                >
                  <Award size={18} className="text-primary mt-0.5 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-foreground text-sm font-semibold">{a.title}</span>
                      {a.placement && (
                        <span className="vp-label bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
                          {a.placement}
                        </span>
                      )}
                      <span className="text-success inline-flex items-center gap-0.5 text-[11px] font-medium">
                        <BadgeCheck size={12} aria-hidden />
                        Verified organizer
                      </span>
                    </div>
                    <p className="text-foreground-muted mt-0.5 text-xs">
                      {a.tournamentSlug ? (
                        <Link href={`/tournaments/${a.tournamentSlug}`} className="text-primary">
                          {a.tournamentName}
                        </Link>
                      ) : (
                        a.tournamentName
                      )}
                      {a.divisionName ? ` · ${a.divisionName}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {community.length > 0 && (
            <div>
              <p className="text-foreground-muted mb-1.5 text-xs font-medium">Community claims</p>
              <ul className="space-y-2">
                {community.map((a) => (
                  <li
                    key={a.id}
                    className="border-border bg-background flex items-start justify-between gap-2.5 rounded-xl border border-dashed p-3"
                  >
                    <div className="min-w-0">
                      <span className="text-foreground text-sm font-medium">{a.title}</span>
                      {a.description && (
                        <p className="text-foreground-muted mt-0.5 text-xs">{a.description}</p>
                      )}
                      <span className="text-foreground-muted mt-0.5 inline-block text-[11px]">
                        Community claim - not an official record
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {authed && !isOwnProfile && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => toggleEndorsement(a.id))}
                          aria-pressed={a.endorsedByViewer}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs disabled:opacity-50 ${
                            a.endorsedByViewer
                              ? 'border-primary text-primary bg-primary/10'
                              : 'border-border text-foreground hover:bg-surface-muted'
                          }`}
                        >
                          <ThumbsUp size={12} aria-hidden />
                          {a.endorsements}
                        </button>
                      )}
                      {(!authed || isOwnProfile) && a.endorsements > 0 && (
                        <span className="text-foreground-muted inline-flex items-center gap-1 text-xs">
                          <ThumbsUp size={12} aria-hidden />
                          {a.endorsements}
                        </span>
                      )}
                      {isOwnProfile && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => removeCommunityAchievement(a.id))}
                          className="text-danger hover:bg-surface-muted rounded-lg p-1 disabled:opacity-50"
                          aria-label="Remove claim"
                        >
                          <Trash2 size={13} aria-hidden />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {msg && <p className="text-foreground-muted mt-2 text-xs">{msg}</p>}
    </section>
  );
}
