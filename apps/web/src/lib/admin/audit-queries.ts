import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Audit-log reader for the Admin Control Center (handover §30.8). Read-only; append-only table.
 * Authorization is enforced by the page guard (requireAdminPage). Explicit column projection (no
 * select(*)), actor names resolved in one bulk query (no N+1), keyset pagination by created_at.
 */

export interface AuditLogItem {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorSlug: string | null;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: string;
}

export interface AuditLogFilters {
  action?: string; // substring / prefix match on the action string
  entityType?: string;
  actorId?: string;
  since?: string; // ISO date
  until?: string; // ISO date
}

export interface AuditLogPage {
  items: AuditLogItem[];
  nextCursor: string | null;
}

const PAGE_SIZE = 40;

export async function listAuditLogs(
  filters: AuditLogFilters = {},
  cursor?: string,
): Promise<AuditLogPage> {
  try {
    const svc = createServiceClient();
    let q = svc
      .from('audit_logs')
      .select(
        'id, actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot, reason, created_at',
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (filters.action) q = q.ilike('action', `%${filters.action}%`);
    if (filters.entityType) q = q.eq('entity_type', filters.entityType);
    if (filters.actorId) q = q.eq('actor_id', filters.actorId);
    if (filters.since) q = q.gte('created_at', filters.since);
    if (filters.until) q = q.lte('created_at', filters.until);
    if (cursor) q = q.lt('created_at', cursor);

    const { data } = await q;
    const rows = (data ?? []) as {
      id: string;
      actor_id: string | null;
      actor_role: string | null;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      before_snapshot: unknown;
      after_snapshot: unknown;
      reason: string | null;
      created_at: string;
    }[];

    const hasMore = rows.length > PAGE_SIZE;
    const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    // Resolve actor display names in one query.
    const actorIds = Array.from(
      new Set(pageRows.map((r) => r.actor_id).filter((v): v is string => !!v)),
    );
    const names = new Map<string, { name: string; slug: string | null }>();
    if (actorIds.length > 0) {
      const { data: actors } = await svc
        .from('profiles')
        .select('id, first_name, last_name, nickname, slug')
        .in('id', actorIds);
      for (const a of (actors ?? []) as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        nickname: string | null;
        slug: string | null;
      }[]) {
        const name =
          [a.first_name, a.last_name].filter(Boolean).join(' ').trim() ||
          a.nickname ||
          a.slug ||
          'User';
        names.set(a.id, { name, slug: a.slug });
      }
    }

    const items: AuditLogItem[] = pageRows.map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      actorName: r.actor_id ? (names.get(r.actor_id)?.name ?? 'User') : 'System',
      actorSlug: r.actor_id ? (names.get(r.actor_id)?.slug ?? null) : null,
      actorRole: r.actor_role,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      before: r.before_snapshot,
      after: r.after_snapshot,
      reason: r.reason,
      createdAt: r.created_at,
    }));

    const lastRow = pageRows[pageRows.length - 1];
    return {
      items,
      nextCursor: hasMore && lastRow ? lastRow.created_at : null,
    };
  } catch {
    return { items: [], nextCursor: null };
  }
}

/** Distinct entity types present in the log, for the filter dropdown. */
export async function listAuditEntityTypes(): Promise<string[]> {
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from('audit_logs')
      .select('entity_type')
      .not('entity_type', 'is', null)
      .limit(1000);
    const set = new Set<string>();
    for (const r of (data ?? []) as { entity_type: string | null }[]) {
      if (r.entity_type) set.add(r.entity_type);
    }
    return Array.from(set).sort();
  } catch {
    return [];
  }
}
