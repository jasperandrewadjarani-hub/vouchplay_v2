import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/moderation/staff';
import { searchUsers } from '@/lib/admin/user-queries';
import { nameInitials } from '@/lib/storage';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { AdminUserSearch } from '@/components/admin/user-search';
import { LinkSpinner } from '@/components/ui/link-spinner';

export const metadata: Metadata = { title: 'Users & roles' };

const STATUS_STYLE: Record<string, string> = {
  active: 'text-emerald-600 dark:text-emerald-400',
  restricted: 'text-amber-600 dark:text-amber-400',
  suspended: 'text-amber-600 dark:text-amber-400',
  banned: 'text-red-600 dark:text-red-400',
  deactivated: 'text-foreground-muted',
};

interface Props {
  searchParams: Promise<{ q?: string }>;
}

/** Admin user directory + search (handover §30.1). */
export default async function AdminUsersPage({ searchParams }: Props) {
  await requireAdminPage('/admin/users');
  const { q } = await searchParams;
  const users = await searchUsers(q ?? '');

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/admin" className="text-foreground-muted hover:text-foreground text-sm">
          ← Admin
        </Link>
        <h1 className="text-foreground mt-2 text-xl font-semibold tracking-tight">Users & roles</h1>
      </div>

      <AdminUserSearch initialQ={q ?? ''} />

      {users.length === 0 ? (
        <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-6 text-center text-sm">
          {q ? 'No users match that search.' : 'No users yet.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li key={u.id}>
              <Link
                href={`/admin/users/${u.id}`}
                className="border-border bg-surface vp-card relative flex items-center gap-3 rounded-2xl border p-3"
              >
                <PlayerAvatar
                  url={u.avatarUrl}
                  initials={nameInitials(u.name)}
                  name={u.name}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground truncate text-sm font-semibold">{u.name}</span>
                    {u.roles.map((r) => (
                      <span
                        key={r}
                        className="border-primary/40 text-primary rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase"
                      >
                        {r.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                  <div className="text-foreground-muted flex flex-wrap items-center gap-x-2 text-xs">
                    {u.slug && <span>@{u.slug}</span>}
                    {u.city && <span>· {u.city}</span>}
                    <span className={STATUS_STYLE[u.accountStatus] ?? ''}>· {u.accountStatus}</span>
                    {!u.onboarded && <span>· not onboarded</span>}
                  </div>
                </div>
                <LinkSpinner />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
