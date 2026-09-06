import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Append-only audit trail (handover §30.8, §36.40, §47). Every sensitive moderation action writes one
 * immutable row here via the service role. `audit_logs` has no UPDATE/DELETE policy for any role
 * (migration 0001), so entries can never be altered. Never throws - auditing failure is logged but
 * must not silently swallow the action; callers should treat a false return as a hard failure.
 */
export interface AuditEntry {
  actorId: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  /** The affected entity's uuid, or null when the entity has no uuid (e.g. a settings key). */
  entityId: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}

export async function writeAudit(entry: AuditEntry): Promise<boolean> {
  try {
    const svc = createServiceClient();
    const { error } = await svc.from('audit_logs').insert({
      actor_id: entry.actorId,
      actor_role: entry.actorRole ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      before_snapshot: entry.before ?? null,
      after_snapshot: entry.after ?? null,
      reason: entry.reason ?? null,
    });
    return !error;
  } catch {
    return false;
  }
}
