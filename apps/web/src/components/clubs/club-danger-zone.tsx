'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setClubActivity, deleteClub, type ClubActionState } from '@/lib/actions/club';

/** Owner-only club controls: activate/deactivate + soft-delete (handover §15.7). */
export function ClubDangerZone({
  clubId,
  slug,
  clubName,
  activityStatus,
}: {
  clubId: string;
  slug: string;
  clubName: string;
  activityStatus: string;
}) {
  const router = useRouter();
  const [confirmName, setConfirmName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<ClubActionState>) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      setMsg(res.error ?? res.message ?? null);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-foreground text-sm font-medium">
            {activityStatus === 'active' ? 'Club is active' : 'Club is inactive'}
          </p>
          <p className="text-foreground-muted text-xs">
            Inactive clubs stay visible but signal they&apos;re not currently operating.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() =>
              setClubActivity(clubId, slug, activityStatus === 'active' ? 'inactive' : 'active'),
            )
          }
          className="border-border text-foreground hover:bg-surface-muted rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {activityStatus === 'active' ? 'Set inactive' : 'Set active'}
        </button>
      </div>

      <div className="border-danger/40 rounded-xl border border-dashed p-3">
        <p className="text-danger text-sm font-semibold">Delete this club</p>
        <p className="text-foreground-muted mt-0.5 text-xs">
          This soft-deletes the club and removes it from the directory. Type the club name (
          <span className="text-foreground font-medium">{clubName}</span>) to confirm.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder="Club name"
            className="border-border bg-background flex-1 rounded-lg border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <button
            type="button"
            disabled={pending || confirmName.trim() !== clubName}
            onClick={() => run(() => deleteClub(clubId, slug, confirmName))}
            className="bg-danger/90 hover:bg-danger rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Delete club
          </button>
        </div>
      </div>

      {msg && <p className="text-foreground-muted text-xs">{msg}</p>}
    </div>
  );
}
