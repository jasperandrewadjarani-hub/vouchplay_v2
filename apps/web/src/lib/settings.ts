import { unstable_cache } from 'next/cache';
import {
  DEFAULT_SYSTEM_SETTINGS,
  STS_CONSTANTS,
  type SystemSettingsKey,
} from '@vouchplay/config';
import { createPublicClient } from '@/lib/supabase/public';

export const SYSTEM_SETTINGS_TAG = 'system_settings';

/**
 * Live operational settings (handover §30.7): read from `system_settings` (public read) with the
 * canonical config values as fallback. Business numbers are NEVER hardcoded in domain logic — this
 * is the single runtime source. STS algorithm constants come from @vouchplay/config (they are
 * version-locked with STS_V1, not admin-tunable), everything else is admin-configurable.
 */
const loadSettings = unstable_cache(
  async (): Promise<Record<string, unknown>> => {
    const merged: Record<string, unknown> = { ...DEFAULT_SYSTEM_SETTINGS };
    try {
      const supabase = createPublicClient();
      const { data } = await supabase.from('system_settings').select('key, value');
      for (const row of data ?? []) {
        const r = row as { key: string; value: unknown };
        merged[r.key] = r.value;
      }
    } catch {
      // fall back to config defaults
    }
    return merged;
  },
  ['system-settings'],
  { revalidate: 300, tags: [SYSTEM_SETTINGS_TAG] },
);

function num(map: Record<string, unknown>, key: SystemSettingsKey): number {
  const v = map[key];
  return typeof v === 'number' ? v : Number(DEFAULT_SYSTEM_SETTINGS[key]);
}

export interface VouchSettings {
  weights: { normal: number; identityVerified: number; coach: number; identityVerifiedCoach: number };
  limits: {
    playerPer24h: number;
    coachPer24h: number;
    requestsPer24h: number;
    updateCooldownDays: number;
  };
  skillVerified: { minSts: number; minUniqueVouchers: number };
  stsConstants: {
    countDivisor: number;
    weightDivisor: number;
    dispersionDivisor: number;
    countCoefficient: number;
    weightCoefficient: number;
    agreementCoefficient: number;
    scale: number;
  };
}

export async function getVouchSettings(): Promise<VouchSettings> {
  const m = await loadSettings();
  return {
    weights: {
      normal: num(m, 'weight_normal'),
      identityVerified: num(m, 'weight_identity_verified'),
      coach: num(m, 'weight_coach'),
      identityVerifiedCoach: num(m, 'weight_identity_verified_coach'),
    },
    limits: {
      playerPer24h: num(m, 'player_vouches_per_24h'),
      coachPer24h: num(m, 'coach_vouches_per_24h'),
      requestsPer24h: num(m, 'vouch_requests_per_24h'),
      updateCooldownDays: num(m, 'vouch_update_cooldown_days'),
    },
    skillVerified: {
      minSts: num(m, 'skill_verified_min_sts'),
      minUniqueVouchers: num(m, 'skill_verified_min_unique_vouchers'),
    },
    stsConstants: {
      countDivisor: STS_CONSTANTS.countDivisor,
      weightDivisor: STS_CONSTANTS.weightDivisor,
      dispersionDivisor: STS_CONSTANTS.dispersionDivisor,
      countCoefficient: STS_CONSTANTS.countCoefficient,
      weightCoefficient: STS_CONSTANTS.weightCoefficient,
      agreementCoefficient: STS_CONSTANTS.agreementCoefficient,
      scale: STS_CONSTANTS.scale,
    },
  };
}
