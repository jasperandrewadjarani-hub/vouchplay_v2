import 'server-only';
import {
  DEFAULT_SYSTEM_SETTINGS,
  SETTINGS_CATALOG,
  SETTING_GROUPS,
  settingCurrentValue,
  type SettingValue,
} from '@vouchplay/config';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Admin read of the live `system_settings` table (handover §30.7). Reads via the service client so
 * the Admin Control Center always shows the freshest values (bypassing the 5-minute public cache in
 * lib/settings.ts, which is for domain reads). Merges with the seed defaults so a key that has never
 * been written still shows its canonical default. Authorization is enforced by the page guard
 * (requireAdminPage); this is read-only.
 */

export interface SettingRowMeta {
  key: string;
  value: SettingValue;
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface AdminSettingsView {
  /** current value per key (stored or default), keyed for the form */
  values: Record<string, SettingValue>;
  /** metadata (who/when last changed) per stored key */
  meta: Record<string, SettingRowMeta>;
}

export async function getAdminSettings(): Promise<AdminSettingsView> {
  const merged: Record<string, unknown> = { ...DEFAULT_SYSTEM_SETTINGS };
  const meta: Record<string, SettingRowMeta> = {};
  try {
    const svc = createServiceClient();
    const { data } = await svc.from('system_settings').select('key, value, updated_at, updated_by');
    const rows = (data ?? []) as {
      key: string;
      value: unknown;
      updated_at: string | null;
      updated_by: string | null;
    }[];
    for (const r of rows) merged[r.key] = r.value;

    // Resolve editor display names for the "last changed by" column (one bulk query, no N+1).
    const editorIds = Array.from(
      new Set(rows.map((r) => r.updated_by).filter((v): v is string => !!v)),
    );
    const names = new Map<string, string>();
    if (editorIds.length > 0) {
      const { data: editors } = await svc
        .from('profiles')
        .select('id, first_name, last_name, nickname, slug')
        .in('id', editorIds);
      for (const e of (editors ?? []) as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        nickname: string | null;
        slug: string | null;
      }[]) {
        const name =
          [e.first_name, e.last_name].filter(Boolean).join(' ').trim() ||
          e.nickname ||
          e.slug ||
          'Admin';
        names.set(e.id, name);
      }
    }
    for (const r of rows) {
      meta[r.key] = {
        key: r.key,
        value: r.value as SettingValue,
        updatedAt: r.updated_at,
        updatedByName: r.updated_by ? (names.get(r.updated_by) ?? 'Admin') : null,
      };
    }
  } catch {
    // fall back to defaults only
  }

  const values: Record<string, SettingValue> = {};
  for (const f of SETTINGS_CATALOG) values[f.key] = settingCurrentValue(f.key, merged);
  return { values, meta };
}

export { SETTINGS_CATALOG, SETTING_GROUPS };
