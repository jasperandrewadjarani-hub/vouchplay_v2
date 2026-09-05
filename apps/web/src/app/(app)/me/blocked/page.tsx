import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listBlockedByViewer } from '@/lib/moderation/enforcement';
import { createServiceClient } from '@/lib/supabase/service';
import { avatarUrl } from '@/lib/storage';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { BlockControl } from '@/components/safety/block-control';

export const metadata: Metadata = { title: 'Blocked users' };

export default async function BlockedPage() {
  const user = await requireUser('/me/blocked');
  const blocks = await listBlockedByViewer(user.id);

  const ids = blocks.map((b) => b.blocked_id);
  const svc = createServiceClient();
  const { data } = ids.length
    ? await svc
        .from('profiles')
        .select('id, first_name, last_name, nickname, slug, avatar_path')
        .in('id', ids)
    : { data: [] };
  const byId = new Map(
    (data ?? []).map((r) => {
      const row = r as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        nickname: string | null;
        slug: string | null;
        avatar_path: string | null;
      };
      return [row.id, row];
    }),
  );

  return (
    <section className="mx-auto max-w-md space-y-5">
      <div>
        <Link href="/me" className="text-foreground-muted hover:text-foreground text-sm">
          ← Me
        </Link>
        <h1 className="text-foreground mt-2 text-xl font-semibold tracking-tight">Blocked users</h1>
        <p className="text-foreground-muted mt-1 text-sm">
          Blocked players can&apos;t send you vouch requests, partner invites, or recruitment
          offers. Existing public vouches are unaffected.
        </p>
      </div>

      {blocks.length === 0 ? (
        <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-5 text-sm">
          You haven&apos;t blocked anyone.
        </p>
      ) : (
        <ul className="border-border bg-surface divide-border divide-y rounded-2xl border">
          {blocks.map((b) => {
            const p = byId.get(b.blocked_id);
            const name =
              [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() ||
              p?.nickname ||
              'VouchPlay player';
            const initials =
              `${p?.first_name?.[0] ?? ''}${p?.last_name?.[0] ?? ''}`.toUpperCase() ||
              (p?.nickname?.[0] ?? '?').toUpperCase();
            return (
              <li key={b.blocked_id} className="flex items-center gap-3 p-3">
                <PlayerAvatar
                  url={avatarUrl(p?.avatar_path)}
                  initials={initials}
                  name={name}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  {p?.slug ? (
                    <Link
                      href={`/players/${p.slug}`}
                      className="hover:text-primary text-sm font-medium"
                    >
                      {name}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium">{name}</span>
                  )}
                  <p className="text-foreground-muted text-xs">
                    Blocked{' '}
                    {new Date(b.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <BlockControl
                  targetId={b.blocked_id}
                  slug={p?.slug ?? ''}
                  targetName={name}
                  initiallyBlocked
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
