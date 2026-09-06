import { describe, it, expect } from 'vitest';
import { DEFAULT_SYSTEM_SETTINGS } from './settings';
import {
  SETTINGS_CATALOG,
  SETTINGS_BY_KEY,
  SETTING_GROUPS,
  validateSettingValue,
  settingCurrentValue,
} from './settings-catalog';

describe('settings catalog', () => {
  it('covers exactly every key in DEFAULT_SYSTEM_SETTINGS', () => {
    const catalogKeys = SETTINGS_CATALOG.map((f) => f.key).sort();
    const defaultKeys = Object.keys(DEFAULT_SYSTEM_SETTINGS).sort();
    expect(catalogKeys).toEqual(defaultKeys);
  });

  it('has no duplicate keys', () => {
    const keys = SETTINGS_CATALOG.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('references only declared groups', () => {
    const groups = new Set(SETTING_GROUPS.map((g) => g.key));
    for (const f of SETTINGS_CATALOG) expect(groups.has(f.group)).toBe(true);
  });

  it("every field's default value validates against its own rule", () => {
    for (const f of SETTINGS_CATALOG) {
      const res = validateSettingValue(f.key, DEFAULT_SYSTEM_SETTINGS[f.key]);
      expect(res.ok, `${f.key} default should be valid`).toBe(true);
    }
  });
});

describe('validateSettingValue', () => {
  it('rejects an unknown key', () => {
    expect(validateSettingValue('nope', 1).ok).toBe(false);
  });

  it('coerces int from string and enforces integer-ness', () => {
    expect(validateSettingValue('player_vouches_per_24h', '5')).toEqual({ ok: true, value: 5 });
    const bad = validateSettingValue('player_vouches_per_24h', '5.5');
    expect(bad.ok).toBe(false);
  });

  it('enforces numeric bounds', () => {
    expect(validateSettingValue('default_max_clubs_per_player', 11).ok).toBe(false);
    expect(validateSettingValue('default_max_clubs_per_player', 0).ok).toBe(false);
    expect(validateSettingValue('default_max_clubs_per_player', 3)).toEqual({ ok: true, value: 3 });
  });

  it('parses floats within range', () => {
    expect(validateSettingValue('skill_verified_min_sts', '3.5')).toEqual({ ok: true, value: 3.5 });
    expect(validateSettingValue('skill_verified_min_sts', '6').ok).toBe(false);
  });

  it('coerces booleans from checkbox-style values', () => {
    expect(validateSettingValue('maintenance_mode', 'on')).toEqual({ ok: true, value: true });
    expect(validateSettingValue('maintenance_mode', undefined)).toEqual({ ok: true, value: false });
    expect(validateSettingValue('maintenance_mode', true)).toEqual({ ok: true, value: true });
  });

  it('trims text and enforces maxLength', () => {
    expect(validateSettingValue('announcement_banner', '  hi  ')).toEqual({
      ok: true,
      value: 'hi',
    });
    const long = 'x'.repeat(281);
    expect(validateSettingValue('announcement_banner', long).ok).toBe(false);
  });

  it('rejects non-numeric input for a number field', () => {
    expect(validateSettingValue('slot_hold_minutes', 'abc').ok).toBe(false);
  });
});

describe('settingCurrentValue', () => {
  it('returns the stored value when present and correctly typed', () => {
    expect(settingCurrentValue('player_vouches_per_24h', { player_vouches_per_24h: 8 })).toBe(8);
  });

  it('falls back to the default when absent', () => {
    expect(settingCurrentValue('player_vouches_per_24h', {})).toBe(
      DEFAULT_SYSTEM_SETTINGS.player_vouches_per_24h,
    );
  });

  it('falls back to the default when the stored type is wrong', () => {
    expect(settingCurrentValue('maintenance_mode', { maintenance_mode: 'yes' })).toBe(false);
  });
});

describe('SETTINGS_BY_KEY', () => {
  it('indexes every field', () => {
    expect(Object.keys(SETTINGS_BY_KEY).length).toBe(SETTINGS_CATALOG.length);
  });
});
