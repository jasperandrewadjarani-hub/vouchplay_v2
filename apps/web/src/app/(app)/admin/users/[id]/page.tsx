import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { requireAdminPage } from '@/lib/moderation/staff';
import { getUserAdminDetail } from '@/lib/admin/user-queries';
import { nameInitials } from '@/lib/storage';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { UserAdminPanel } from '@/components/admin/user-admin-panel';

export const metadata: Metadata = { title: 'User detail' };

interface Props {
  params: Promise<{ id: string }>;
}

function fmt(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleString() : null;
}

/** Admin user detail + actions (handover §30.1, §30.2). */
export default async function AdminUserDetailPage({ params }: Props) {
  const actor = await requireAdminPage('/admin/users');
  const { id } = await params;
  const user = await getUserAdminDetail(id);
  if (!user) notFound();

  const suspendedUntil = fmt(user.suspendedUntil);
  const restrictedUntil = fmt(user.vouchingRestrictedUntil);

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link href="/admin/users" className="text-foreground-muted hover:text-foreground text-sm">
          ← Users
        </Link>
      </div>

      <header className="border-border bg-surface vp-hero relative overflow-hidden rounded-2xl border p-4">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        <div className="flex items-center gap-3">
          <PlayerAvatar
            url={user.avatarUrl}
            initials={nameInitials(user.name)}
            name={user.name}
            size="md"
          />
          <div className="min-w-0">
            <h1 className="text-foreground truncate text-lg font-semibold">{user.name}</h1>
            <p className="text-foreground-muted text-xs">
              {user.email ?? 'no email'}
              {user.city ? ` · ${user.city}` : ''}
            </p>
            <p className="text-foreground-muted text-xs">
              Status: <span className="text-foreground font-medium">{user.accountStatus}</span>
              {' · '}Joined {new Date(user.createdAt).toLocaleDateString()}
              {!user.onboarded && ' · not onboarded'}
            </p>
          </div>
          {user.slug && (
            <Link
              href={`/players/${user.slug}`}
              className="text-primary ml-auto flex shrink-0 items-center gap-1 text-xs font-medium"
            >
              Public <ExternalLink size={13} />
            </Link>
          )}
        </div>

        {(user.statusReason || suspendedUntil || restrictedUntil) && (
          <div className="border-border mt-3 space-y-1 border-t pt-3 text-xs">
            {user.statusReason && (
              <p className="text-foreground-muted">
                Reason: <span className="text-foreground">{user.statusReason}</span>
              </p>
            )}
            {suspendedUntil && (
              <p className="text-foreground-muted">Suspended until {suspendedUntil}</p>
            )}
            {restrictedUntil && (
              <p className="text-foreground-muted">Vouching restricted until {restrictedUntil}</p>
            )}
          </div>
        )}
      </header>

      {/* Skill snapshot (info-only, never a ranking) */}
      <div className="border-border bg-surface grid grid-cols-3 gap-2 rounded-2xl border p-3 text-center">
        <Stat
          label="Community skill"
          value={user.skill.csl != null ? String(user.skill.csl) : '—'}
        />
        <Stat label="STS / 5" value={user.skill.sts != null ? user.skill.sts.toFixed(1) : '—'} />
        <Stat
          label="Skill-Verified"
          value={
            user.skill.skillVerified
              ? user.skill.verificationType === 'admin_override'
                ? 'Yes (admin)'
                : 'Yes'
              : 'No'
          }
        />
      </div>

      <UserAdminPanel
        userId={user.id}
        activeRoles={user.activeRoles}
        skillVerified={user.skill.skillVerified}
        canManagePrivileged={actor.role === 'super_admin'}
      />

      {/* Role history */}
      <section className="border-border bg-surface rounded-2xl border p-4">
        <h2 className="text-foreground mb-2 text-sm font-semibold">Role history</h2>
        {user.roleHistory.length === 0 ? (
          <p className="text-foreground-muted text-xs">No role grants recorded.</p>
        ) : (
          <ul className="space-y-2">
            {user.roleHistory.map((h) => (
              <li
                key={h.id}
                className="border-border border-b pb-2 text-xs last:border-b-0 last:pb-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-medium capitalize">
                    {h.role.replace('_', ' ')}
                  </span>
                  <span
                    className={
                      h.status === 'active'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-foreground-muted'
                    }
                  >
                    {h.status}
                  </span>
                  <span className="text-foreground-muted ml-auto">
                    {new Date(h.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {h.reason && <p className="text-foreground-muted mt-0.5">{h.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-foreground text-base font-semibold">{value}</div>
      <div className="text-foreground-muted text-[11px]">{label}</div>
    </div>
  );
}
