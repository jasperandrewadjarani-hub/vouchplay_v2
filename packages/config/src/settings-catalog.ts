/**
 * Admin settings catalog (handover §30.7). The single source of truth describing each
 * admin-configurable `system_settings` key: its display metadata (label/group/help) and its
 * validation contract (kind + bounds). The Admin Control Center renders and validates the settings
 * form from this catalog, and the update action validates every incoming value against it
 * server-side, so operational values are always tunable through the UI and never hardcoded.
 *
 * Pure + framework-free so it can be unit-tested and shared by both the form and the server action.
 */

import { DEFAULT_SYSTEM_SETTINGS, type SystemSettingsKey } from './settings';

export type SettingKind = 'int' | 'float' | 'bool' | 'text';

export type SettingGroupKey =
  | 'vouch_limits'
  | 'vouch_weights'
  | 'skill_verified'
  | 'eligibility'
  | 'tournament'
  | 'timing'
  | 'privacy'
  | 'safety'
  | 'flags'
  | 'announcement';

export interface SettingGroup {
  key: SettingGroupKey;
  label: string;
  help?: string;
}

export interface SettingField {
  key: SystemSettingsKey;
  label: string;
  group: SettingGroupKey;
  kind: SettingKind;
  help?: string;
  /** Numeric bounds (inclusive) for int/float. */
  min?: number;
  max?: number;
  step?: number;
  /** Max length for text. */
  maxLength?: number;
  /** A flag whose toggle-on carries operational risk (shown with a warning in the UI). */
  sensitive?: boolean;
}

/** Display order of the groups in the settings UI. */
export const SETTING_GROUPS: readonly SettingGroup[] = [
  {
    key: 'vouch_limits',
    label: 'Vouch rate limits',
    help: 'Rolling 24-hour windows (§10, §30.7).',
  },
  {
    key: 'vouch_weights',
    label: 'Vouch weights',
    help: 'Effective weight model (§10.5). Skill-Verified and Facebook never affect weight.',
  },
  {
    key: 'skill_verified',
    label: 'Skill Verified rule',
    help: 'Community Skill-Verified (§10.8).',
  },
  {
    key: 'eligibility',
    label: 'Eligibility engine',
    help: 'Anti-sandbagging thresholds (ELIG_V1, §25.4). Decision-support by default.',
  },
  {
    key: 'tournament',
    label: 'Tournament defaults',
    help: 'Division/representation defaults (§21, §22).',
  },
  {
    key: 'timing',
    label: 'Slot & payment timing',
    help: 'Slot holds and payment review grace (§23, §24).',
  },
  { key: 'privacy', label: 'Privacy & retention', help: 'Sensitive-data retention (§13.3).' },
  {
    key: 'safety',
    label: 'Safety limits',
    help: 'Report / skill-review abuse limits (§14, §11.3).',
  },
  { key: 'flags', label: 'Feature flags', help: 'Platform-wide switches (§30.7, §61).' },
  {
    key: 'announcement',
    label: 'Announcement banner',
    help: 'A site-wide banner shown to every visitor when enabled (§30.7).',
  },
] as const;

/**
 * Every admin-editable setting. Keep in sync with DEFAULT_SYSTEM_SETTINGS (a unit test asserts this
 * catalog covers exactly the editable keys). STS algorithm constants are intentionally NOT here -
 * they are version-locked with STS_V1, not admin-tunable.
 */
export const SETTINGS_CATALOG: readonly SettingField[] = [
  // Vouch rate limits
  {
    key: 'player_vouches_per_24h',
    label: 'Player vouches / 24h',
    group: 'vouch_limits',
    kind: 'int',
    min: 0,
    max: 1000,
  },
  {
    key: 'coach_vouches_per_24h',
    label: 'Coach vouches / 24h',
    group: 'vouch_limits',
    kind: 'int',
    min: 0,
    max: 1000,
  },
  {
    key: 'vouch_requests_per_24h',
    label: 'Vouch requests / 24h',
    group: 'vouch_limits',
    kind: 'int',
    min: 0,
    max: 1000,
  },
  {
    key: 'vouch_update_cooldown_days',
    label: 'Vouch update cooldown (days)',
    group: 'vouch_limits',
    kind: 'int',
    min: 0,
    max: 365,
  },

  // Vouch weights
  {
    key: 'weight_normal',
    label: 'Normal weight',
    group: 'vouch_weights',
    kind: 'float',
    min: 0,
    max: 10,
    step: 0.05,
  },
  {
    key: 'weight_identity_verified',
    label: 'Identity-Verified weight',
    group: 'vouch_weights',
    kind: 'float',
    min: 0,
    max: 10,
    step: 0.05,
  },
  {
    key: 'weight_coach',
    label: 'Coach weight',
    group: 'vouch_weights',
    kind: 'float',
    min: 0,
    max: 10,
    step: 0.05,
  },
  {
    key: 'weight_identity_verified_coach',
    label: 'Identity-Verified Coach weight',
    group: 'vouch_weights',
    kind: 'float',
    min: 0,
    max: 10,
    step: 0.05,
  },

  // Skill Verified
  {
    key: 'skill_verified_min_sts',
    label: 'Minimum STS',
    group: 'skill_verified',
    kind: 'float',
    min: 0,
    max: 5,
    step: 0.1,
  },
  {
    key: 'skill_verified_min_unique_vouchers',
    label: 'Minimum unique vouchers',
    group: 'skill_verified',
    kind: 'int',
    min: 0,
    max: 100,
  },

  // Eligibility engine
  {
    key: 'eligibility_min_unique_vouchers',
    label: 'Min evidence vouchers',
    group: 'eligibility',
    kind: 'int',
    min: 0,
    max: 100,
  },
  {
    key: 'eligibility_review_below_sts',
    label: 'Review below STS',
    group: 'eligibility',
    kind: 'float',
    min: 0,
    max: 5,
    step: 0.1,
  },
  {
    key: 'eligibility_enforce_hard_rules',
    label: 'Enforce hard rules (block registration)',
    group: 'eligibility',
    kind: 'bool',
    help: 'Off keeps the engine decision-support only. On lets a hard-rule failure block registration outright.',
    sensitive: true,
  },

  // Tournament defaults
  {
    key: 'default_max_divisions_per_player',
    label: 'Max divisions / player',
    group: 'tournament',
    kind: 'int',
    min: 1,
    max: 50,
  },
  {
    key: 'default_max_clubs_per_player',
    label: 'Max clubs / player / tournament',
    group: 'tournament',
    kind: 'int',
    min: 1,
    max: 10,
  },
  {
    key: 'club_representation_required',
    label: 'Club representation required',
    group: 'tournament',
    kind: 'bool',
  },
  { key: 'verified_clubs_only', label: 'Verified clubs only', group: 'tournament', kind: 'bool' },

  // Timing
  {
    key: 'slot_hold_minutes',
    label: 'Slot hold (minutes)',
    group: 'timing',
    kind: 'int',
    min: 1,
    max: 1440,
  },
  {
    key: 'submitted_payment_review_grace_hours',
    label: 'Payment review grace (hours)',
    group: 'timing',
    kind: 'int',
    min: 1,
    max: 720,
  },

  // Privacy
  {
    key: 'identity_file_retention_days_after_decision',
    label: 'Identity file retention (days after decision)',
    group: 'privacy',
    kind: 'int',
    min: 1,
    max: 3650,
  },

  // Safety
  {
    key: 'reports_per_24h',
    label: 'Reports / 24h',
    group: 'safety',
    kind: 'int',
    min: 0,
    max: 1000,
  },
  {
    key: 'skill_reviews_per_24h',
    label: 'Skill reviews / 24h',
    group: 'safety',
    kind: 'int',
    min: 0,
    max: 1000,
  },

  // Feature flags
  {
    key: 'maintenance_mode',
    label: 'Maintenance mode',
    group: 'flags',
    kind: 'bool',
    help: 'When on, non-staff visitors see a maintenance screen. Staff keep full access.',
    sensitive: true,
  },
  {
    key: 'signup_enabled',
    label: 'Signups enabled',
    group: 'flags',
    kind: 'bool',
    sensitive: true,
  },
  {
    key: 'role_applications_enabled',
    label: 'Role applications enabled',
    group: 'flags',
    kind: 'bool',
  },
  { key: 'club_creation_enabled', label: 'Club creation enabled', group: 'flags', kind: 'bool' },

  // Announcement banner
  {
    key: 'announcement_banner_enabled',
    label: 'Show announcement banner',
    group: 'announcement',
    kind: 'bool',
  },
  {
    key: 'announcement_banner',
    label: 'Banner message',
    group: 'announcement',
    kind: 'text',
    maxLength: 280,
    help: 'Plain text, shown site-wide. Keep it short.',
  },
] as const;

/** Fast lookup of a field by key. */
export const SETTINGS_BY_KEY: Readonly<Record<string, SettingField>> = Object.freeze(
  Object.fromEntries(SETTINGS_CATALOG.map((f) => [f.key, f])),
);

export type SettingValue = number | boolean | string;

export type SettingValidation = { ok: true; value: SettingValue } | { ok: false; error: string };

/**
 * Validate + coerce a single incoming setting value against the catalog. `raw` may be the value
 * itself or its string form (as it arrives from a form/JSON). Pure and total - never throws.
 */
export function validateSettingValue(key: string, raw: unknown): SettingValidation {
  const field = SETTINGS_BY_KEY[key];
  if (!field) return { ok: false, error: `Unknown setting: ${key}` };

  if (field.kind === 'bool') {
    if (typeof raw === 'boolean') return { ok: true, value: raw };
    if (raw === 'true' || raw === 'on' || raw === '1') return { ok: true, value: true };
    if (raw === 'false' || raw === 'off' || raw === '0' || raw === '' || raw == null)
      return { ok: true, value: false };
    return { ok: false, error: `${field.label} must be true or false.` };
  }

  if (field.kind === 'text') {
    const s = raw == null ? '' : String(raw);
    if (field.maxLength != null && s.length > field.maxLength) {
      return { ok: false, error: `${field.label} must be ${field.maxLength} characters or fewer.` };
    }
    return { ok: true, value: s.trim() };
  }

  // int | float
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return { ok: false, error: `${field.label} must be a number.` };
  if (field.kind === 'int' && !Number.isInteger(n)) {
    return { ok: false, error: `${field.label} must be a whole number.` };
  }
  if (field.min != null && n < field.min) {
    return { ok: false, error: `${field.label} must be at least ${field.min}.` };
  }
  if (field.max != null && n > field.max) {
    return { ok: false, error: `${field.label} must be at most ${field.max}.` };
  }
  return { ok: true, value: n };
}

/** The current value of a setting from a merged map, falling back to the seed default. */
export function settingCurrentValue(
  key: SystemSettingsKey,
  merged: Record<string, unknown>,
): SettingValue {
  const v = merged[key];
  const def = DEFAULT_SYSTEM_SETTINGS[key] as SettingValue;
  if (v == null) return def;
  const field = SETTINGS_BY_KEY[key];
  if (!field) return v as SettingValue;
  if (field.kind === 'bool') return typeof v === 'boolean' ? v : def;
  if (field.kind === 'text') return typeof v === 'string' ? v : def;
  return typeof v === 'number' ? v : def;
}
