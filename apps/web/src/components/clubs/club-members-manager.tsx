'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PlayerAvatar } from '@/components/players/player-avatar';
import {
  approveMember,
  rejectMember,
  removeMember,
  setMemberRole,
  transferOwnership,
  type ClubActionState,
} from '@/lib/actions/club';

interface Member {
  userId: string;
  name: string;
  slug: string | null;
  initials: string;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'member';
  status: string;
}

const smallBtn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50';

/** Club member management (handover §15.3–§15.4). Owner-only controls are gated by `isOwner`. */
export function ClubMembersManager({
  clubId,
  slug,
  members,
  isOwner,
}: {
  clubId: string;
  slug: string;
  members: Member[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<ClubActionState>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setMsg(null);
    start(async () => {
      const res = await fn();
      setMsg(res.error ?? res.message ?? null);
      if (res.ok) router.refresh();
    });
  }

  const pendingMembers = members.filter((m) => m.status === 'requested' || m.status === 'invited');
  const active = members.filter((m) => m.status === 'active');

  return (
    <div className="space-y-5">
      {msg && <p className="text-foreground-muted text-sm">{msg}</p>}

      <div>
        <h3 className="text-foreground mb-2 text-sm font-semibold">
          Pending requests ({pendingMembers.length})
        </h3>
        {pendingMembers.length === 0 ? (
          <p className="text-foreground-muted text-sm">No pending requests.</p>
        ) : (
          <ul className="space-y-2">
            {pendingMembers.map((m) => (
              <li
                key={m.userId}
                className="border-border flex items-center gap-3 rounded-xl border p-2.5"
              >
                <PlayerAvatar url={m.avatarUrl} initials={m.initials} name={m.name} size="sm" />
                <span className="text-foreground flex-1 truncate text-sm font-medium">
                  {m.name}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => approveMember(clubId, slug, m.userId))}
                  className={`${smallBtn} vp-gradient text-white`}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => rejectMember(clubId, slug, m.userId))}
                  className={`${smallBtn} border-border text-foreground border`}
                >
                  Reject
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-foreground mb-2 text-sm font-semibold">Members ({active.length})</h3>
        <ul className="space-y-2">
          {active.map((m) => (
            <li
              key={m.userId}
              className="border-border flex flex-wrap items-center gap-2 rounded-xl border p-2.5"
            >
              <PlayerAvatar url={m.avatarUrl} initials={m.initials} name={m.name} size="sm" />
              <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
                {m.name}
                {m.role !== 'member' && (
                  <span className="text-primary ml-1.5 text-xs capitalize">· {m.role}</span>
                )}
              </span>
              {m.role === 'owner' ? (
                <span className="text-foreground-muted text-xs">Owner</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {isOwner && m.role === 'member' && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setMemberRole(clubId, slug, m.userId, 'admin'))}
                      className={`${smallBtn} border-border text-foreground border`}
                    >
                      Make admin
                    </button>
                  )}
                  {isOwner && m.role === 'admin' && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setMemberRole(clubId, slug, m.userId, 'member'))}
                      className={`${smallBtn} border-border text-foreground border`}
                    >
                      Remove admin
                    </button>
                  )}
                  {isOwner && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => transferOwnership(clubId, slug, m.userId),
                          `Transfer ownership to ${m.name}? You'll become an admin.`,
                        )
                      }
                      className={`${smallBtn} border-border text-foreground border`}
                    >
                      Make owner
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => removeMember(clubId, slug, m.userId),
                        `Remove ${m.name} from the club?`,
                      )
                    }
                    className={`${smallBtn} text-danger border-border border`}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
