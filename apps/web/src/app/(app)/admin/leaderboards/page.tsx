import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/moderation/staff';
import { createServiceClient } from '@/lib/supabase/service';
import { RebuildForm, ExclusionForm, ActivateForm } from '@/components/leaderboards/action-forms';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Leaderboard operations' };
export default async function AdminLeaderboardsPage() {
  await requireAdminPage('/admin/leaderboards');
  const db = createServiceClient();
  const [{ data: runs }, { data: requests }, { data: exclusions }] = await Promise.all([
    db
      .from('leaderboard_snapshot_runs')
      .select(
        'id, category, scope_type, scope_value, period, scoring_version, status, active, row_count, published_at, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(20),
    db
      .from('leaderboard_rebuild_requests')
      .select('id, status, reason, requested_at, completed_at, error_code')
      .order('requested_at', { ascending: false })
      .limit(10),
    db
      .from('leaderboard_exclusions')
      .select('id, entity_type, entity_id, category, reason, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(25),
  ]);
  return (
    <div className="space-y-5">
      <header>
        <p className="vp-label text-primary">AAL2 operations</p>
        <h1 className="text-foreground text-2xl font-bold">Leaderboard control center</h1>
        <p className="text-foreground-muted mt-1 text-sm">
          Every rebuild, exclusion, and activation is server-authorized and audited.
          Pause/weight/cadence controls live in System settings.
        </p>
        <ButtonLink href="/admin/settings" variant="secondary" className="mt-3">
          Open system settings
        </ButtonLink>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <RebuildForm />
        <ExclusionForm />
      </div>
      <section className="border-border bg-surface overflow-hidden rounded-2xl border">
        <h2 className="text-foreground border-border border-b p-4 font-semibold">
          Recent snapshots
        </h2>
        <div className="divide-border divide-y">
          {(runs ?? []).length === 0 ? (
            <p className="text-foreground-muted p-4 text-sm">No snapshots yet.</p>
          ) : (
            (runs ?? []).map((run) => {
              const r = run as Record<string, unknown>;
              return (
                <article key={String(r.id)} className="grid gap-3 p-4 sm:grid-cols-[1fr_15rem]">
                  <div>
                    <p className="text-foreground text-sm font-semibold">
                      {String(r.category)} · {String(r.scope_type)}
                      {r.scope_value ? `: ${String(r.scope_value)}` : ''} · {String(r.period)}
                    </p>
                    <p className="text-foreground-muted mt-1 text-xs">
                      {String(r.scoring_version)} · {String(r.row_count)} rows · {String(r.status)}
                      {r.active ? ' · ACTIVE' : ''}
                    </p>
                    <p className="text-foreground-muted text-xs">
                      {r.published_at
                        ? new Date(String(r.published_at)).toLocaleString()
                        : new Date(String(r.created_at)).toLocaleString()}
                    </p>
                  </div>
                  {!r.active && (r.status === 'published' || r.status === 'rolled_back') && (
                    <ActivateForm runId={String(r.id)} />
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border-border bg-surface rounded-2xl border p-4">
          <h2 className="text-foreground font-semibold">Rebuild history</h2>
          <ul className="mt-3 space-y-2 text-xs">
            {(requests ?? []).map((item) => {
              const r = item as Record<string, unknown>;
              return (
                <li key={String(r.id)} className="border-border rounded-xl border p-3">
                  <span className="text-foreground font-semibold">{String(r.status)}</span>
                  <span className="text-foreground-muted block">{String(r.reason)}</span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="border-border bg-surface rounded-2xl border p-4">
          <h2 className="text-foreground font-semibold">Active exclusions</h2>
          <ul className="mt-3 space-y-2 text-xs">
            {(exclusions ?? []).map((item) => {
              const r = item as Record<string, unknown>;
              return (
                <li key={String(r.id)} className="border-border rounded-xl border p-3">
                  <span className="text-foreground font-semibold">
                    {String(r.entity_type)} · {String(r.entity_id)}
                  </span>
                  <span className="text-foreground-muted block">
                    {String(r.category ?? 'all')} · {String(r.reason)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
