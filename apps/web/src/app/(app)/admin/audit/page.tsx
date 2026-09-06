import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/moderation/staff';
import { listAuditLogs, listAuditEntityTypes, type AuditLogItem } from '@/lib/admin/audit-queries';

export const metadata: Metadata = { title: 'Audit log' };

interface Props {
  searchParams: Promise<{
    action?: string;
    entity?: string;
    actor?: string;
    since?: string;
    until?: string;
    cursor?: string;
  }>;
}

/** Read-only audit-log viewer (handover §30.8). Append-only; admin + aal2 only. */
export default async function AuditLogPage({ searchParams }: Props) {
  await requireAdminPage('/admin/audit');
  const sp = await searchParams;
  const filters = {
    action: sp.action?.trim() || undefined,
    entityType: sp.entity?.trim() || undefined,
    actorId: sp.actor?.trim() || undefined,
    since: sp.since ? new Date(sp.since).toISOString() : undefined,
    until: sp.until ? new Date(`${sp.until}T23:59:59`).toISOString() : undefined,
  };
  const [{ items, nextCursor }, entityTypes] = await Promise.all([
    listAuditLogs(filters, sp.cursor),
    listAuditEntityTypes(),
  ]);

  const nextParams = new URLSearchParams();
  if (sp.action) nextParams.set('action', sp.action);
  if (sp.entity) nextParams.set('entity', sp.entity);
  if (sp.actor) nextParams.set('actor', sp.actor);
  if (sp.since) nextParams.set('since', sp.since);
  if (sp.until) nextParams.set('until', sp.until);
  if (nextCursor) nextParams.set('cursor', nextCursor);

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/admin" className="text-foreground-muted hover:text-foreground text-sm">
          ← Admin
        </Link>
        <h1 className="text-foreground mt-2 text-xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-foreground-muted mt-1 text-sm">
          Every sensitive action, immutable. Read-only.
        </p>
      </div>

      <form
        method="get"
        className="border-border bg-surface grid grid-cols-2 gap-2 rounded-2xl border p-3 sm:grid-cols-4"
      >
        <input
          name="action"
          defaultValue={sp.action ?? ''}
          placeholder="Action contains…"
          className="border-border bg-background col-span-2 rounded-lg border px-3 py-2 text-sm"
        />
        <select
          name="entity"
          defaultValue={sp.entity ?? ''}
          className="border-border bg-background rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">All entities</option>
          {entityTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            className="vp-gradient vp-glow flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white"
          >
            Filter
          </button>
          <Link
            href="/admin/audit"
            className="border-border text-foreground-muted hover:text-foreground rounded-lg border px-3 py-2 text-sm"
          >
            Reset
          </Link>
        </div>
        <input
          type="date"
          name="since"
          defaultValue={sp.since ?? ''}
          aria-label="From date"
          className="border-border bg-background rounded-lg border px-3 py-2 text-sm"
        />
        <input
          type="date"
          name="until"
          defaultValue={sp.until ?? ''}
          aria-label="To date"
          className="border-border bg-background rounded-lg border px-3 py-2 text-sm"
        />
      </form>

      {items.length === 0 ? (
        <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-6 text-center text-sm">
          No audit entries match these filters.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <AuditRow key={it.id} item={it} />
          ))}
        </ul>
      )}

      {nextCursor && (
        <Link
          href={`/admin/audit?${nextParams.toString()}`}
          className="border-border bg-surface hover:border-primary block rounded-2xl border px-4 py-3 text-center text-sm font-medium"
        >
          Load older entries →
        </Link>
      )}
    </section>
  );
}

function AuditRow({ item }: { item: AuditLogItem }) {
  const when = new Date(item.createdAt).toLocaleString();
  const hasSnapshot = item.before != null || item.after != null;
  return (
    <li className="border-border bg-surface rounded-2xl border p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <code className="text-primary text-xs font-semibold">{item.action}</code>
        {item.entityType && (
          <span className="border-border text-foreground-muted rounded-full border px-2 py-0.5 text-[11px]">
            {item.entityType}
          </span>
        )}
        <span className="text-foreground-muted ml-auto text-[11px]">{when}</span>
      </div>
      <p className="text-foreground-muted mt-1 text-xs">
        by{' '}
        {item.actorSlug ? (
          <Link href={`/players/${item.actorSlug}`} className="text-foreground font-medium">
            {item.actorName}
          </Link>
        ) : (
          <span className="text-foreground font-medium">{item.actorName}</span>
        )}
        {item.actorRole ? (
          <span className="capitalize"> · {item.actorRole.replace('_', ' ')}</span>
        ) : null}
      </p>
      {item.reason && <p className="text-foreground mt-1 text-sm">“{item.reason}”</p>}
      {hasSnapshot && (
        <details className="mt-2">
          <summary className="text-foreground-muted cursor-pointer text-xs select-none">
            Before / after
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Snapshot label="Before" data={item.before} />
            <Snapshot label="After" data={item.after} />
          </div>
        </details>
      )}
    </li>
  );
}

function Snapshot({ label, data }: { label: string; data: unknown }) {
  return (
    <div className="border-border bg-background overflow-x-auto rounded-lg border p-2">
      <div className="text-foreground-muted mb-1 text-[11px] font-medium">{label}</div>
      <pre className="text-foreground text-[11px] whitespace-pre-wrap">
        {data == null ? '—' : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
