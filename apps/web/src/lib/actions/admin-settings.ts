'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import {
  SETTINGS_CATALOG,
  DEFAULT_SYSTEM_SETTINGS,
  validateSettingValue,
  type SettingValue,
} from '@vouchplay/config';
import { createServiceClient } from '@/lib/supabase/service';
import { assertAdminActor } from '@/lib/moderation/staff';
import { writeAudit } from '@/lib/moderation/audit';
import { SYSTEM_SETTINGS_TAG } from '@/lib/settings';
import type { SafetyActionState } from './report';

/**
 * Update system settings (handover §30.7, §30.8). Admin + aal2 only. Validates every incoming value
 * against the catalog server-side, writes ONLY the keys that actually changed via an upsert (so a
 * never-seeded key is created on first edit), and records one immutable audit row per change with a
 * before/after snapshot. Invalidates the settings cache tag so domain reads pick up new values.
 */
export async function updateSystemSettings(
  _prev: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const actor = await assertAdminActor();
  if (!actor) return { error: 'Admin access with a stepped-up (two-factor) session is required.' };

  // Coerce + validate every catalog field. Booleans absent from the form mean "false" (unchecked).
  const incoming: Record<string, SettingValue> = {};
  for (const f of SETTINGS_CATALOG) {
    const raw =
      f.kind === 'bool' ? (formData.has(f.key) ? formData.get(f.key) : false) : formData.get(f.key);
    // A field the form didn't submit at all (non-bool) is left unchanged.
    if (f.kind !== 'bool' && raw == null) continue;
    const res = validateSettingValue(f.key, raw);
    if (!res.ok) return { error: res.error };
    incoming[f.key] = res.value;
  }

  const svc = createServiceClient();
  try {
    // Read current stored values to compute the real diff (defaults for unseen keys).
    const { data } = await svc.from('system_settings').select('key, value');
    const stored: Record<string, unknown> = {};
    for (const r of (data ?? []) as { key: string; value: unknown }[]) stored[r.key] = r.value;

    const changed: { key: string; before: SettingValue; after: SettingValue }[] = [];
    for (const [key, after] of Object.entries(incoming)) {
      const before =
        key in stored
          ? (stored[key] as SettingValue)
          : (DEFAULT_SYSTEM_SETTINGS[key as keyof typeof DEFAULT_SYSTEM_SETTINGS] as SettingValue);
      if (before !== after) changed.push({ key, before, after });
    }

    if (changed.length === 0) return { ok: true, message: 'No changes to save.' };

    const now = new Date().toISOString();
    const { error } = await svc.from('system_settings').upsert(
      changed.map((c) => ({
        key: c.key,
        value: c.after,
        updated_by: actor.viewerId,
        updated_at: now,
      })),
      { onConflict: 'key' },
    );
    if (error) return { error: 'Could not save settings. Please try again.' };

    // One immutable audit row per changed setting (§30.8).
    for (const c of changed) {
      await writeAudit({
        actorId: actor.viewerId,
        actorRole: actor.role,
        action: `admin.setting.update.${c.key}`,
        entityType: 'system_setting',
        entityId: null, // a settings key has no uuid; it lives in the snapshot + action name
        before: { key: c.key, value: c.before },
        after: { key: c.key, value: c.after },
      });
    }

    revalidateTag(SYSTEM_SETTINGS_TAG);
    revalidatePath('/admin/settings');
    revalidatePath('/', 'layout'); // banner / maintenance flags affect the whole app shell
    return {
      ok: true,
      message: `Saved ${changed.length} change${changed.length === 1 ? '' : 's'}.`,
    };
  } catch {
    return { error: 'Could not save settings. Please try again.' };
  }
}
