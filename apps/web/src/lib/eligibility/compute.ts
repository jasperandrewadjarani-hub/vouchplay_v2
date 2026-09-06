import 'server-only';
import { revalidateTag } from 'next/cache';
import {
  evaluateTeamEligibility,
  type PlayerEligibilityInput,
  type DivisionEligibilityRules,
  type EligibilityResult,
} from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';
import { getEligibilitySettings } from '@/lib/settings';
import { tournamentTag } from '@/lib/tournaments/queries';

/**
 * Eligibility compute-on-write (handover §25, ELIG_V1). Decision-SUPPORT only: this fills
 * registrations.eligibility_status + eligibility_snapshot from the pure @vouchplay/core engine. It
 * NEVER blocks registration and NEVER labels a person (§25.6). Runs after a team registers and again
 * when a member's community skill changes (called from the vouch recompute path).
 *
 * The stored snapshot is the audit-able evidence the organizer UI renders (neutral facts + codes),
 * so the panel is a cheap read - it does not recompute on render.
 */

const RESULT_TO_ENUM: Record<EligibilityResult, string> = {
  ELIGIBLE: 'eligible',
  REVIEW: 'review',
  SKILL_MISMATCH: 'skill_mismatch',
  INELIGIBLE_HARD_RULE: 'ineligible_hard_rule',
};

/** Whole years from date-of-birth to the tournament start date (§18.5). Null if either is missing. */
function ageAt(dob: string | null, atIso: string | null): number | null {
  if (!dob || !atIso) return null;
  const born = new Date(dob);
  const at = new Date(atIso);
  if (Number.isNaN(born.getTime()) || Number.isNaN(at.getTime())) return null;
  let age = at.getUTCFullYear() - born.getUTCFullYear();
  const m = at.getUTCMonth() - born.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < born.getUTCDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

interface RegRow {
  id: string;
  tournament_id: string;
  division_id: string;
  team_id: string;
  status: string;
}

const TERMINAL = new Set(['withdrawn', 'cancelled', 'rejected']);

/**
 * Recompute + persist eligibility for a single registration. Silent no-op for terminal registrations
 * or when required rows are missing (defensive - never throws into the caller's write path).
 */
export async function computeRegistrationEligibility(registrationId: string): Promise<void> {
  const svc = createServiceClient();
  try {
    const { data: regData } = await svc
      .from('registrations')
      .select('id, tournament_id, division_id, team_id, status')
      .eq('id', registrationId)
      .maybeSingle();
    const reg = regData as RegRow | null;
    if (!reg || TERMINAL.has(reg.status)) return;
    await computeForReg(svc, reg);
  } catch {
    // Eligibility is advisory - a failure here must never break the registration action.
  }
}

/**
 * Recompute eligibility for every active registration a player is part of. Called when the player's
 * community skill changes (vouch write) so stored snapshots stay fresh (§25 "recompute when relevant
 * inputs change"). Best-effort and self-contained.
 */
export async function recomputeEligibilityForPlayer(playerId: string): Promise<void> {
  const svc = createServiceClient();
  try {
    const { data: memberRows } = await svc
      .from('team_members')
      .select('team_id')
      .eq('player_id', playerId);
    const teamIds = ((memberRows ?? []) as { team_id: string }[]).map((r) => r.team_id);
    if (teamIds.length === 0) return;

    const { data: regs } = await svc
      .from('registrations')
      .select('id, tournament_id, division_id, team_id, status')
      .in('team_id', teamIds)
      .not('status', 'in', '(withdrawn,cancelled,rejected)');
    const regRows = (regs ?? []) as RegRow[];
    for (const reg of regRows) await computeForReg(svc, reg);
  } catch {
    // best-effort
  }
}

type Svc = ReturnType<typeof createServiceClient>;

async function computeForReg(svc: Svc, reg: RegRow): Promise<void> {
  const settings = await getEligibilitySettings();

  const [{ data: divData }, { data: tournData }, { data: memberData }] = await Promise.all([
    svc
      .from('divisions')
      .select(
        'skill_policy, minimum_skill, maximum_skill, sex_classification, minimum_age, maximum_age, team_size, skill_verified_required, minimum_sts',
      )
      .eq('id', reg.division_id)
      .maybeSingle(),
    svc.from('tournaments').select('start_at').eq('id', reg.tournament_id).maybeSingle(),
    svc.from('team_members').select('player_id, member_order').eq('team_id', reg.team_id),
  ]);

  const div = divData as {
    skill_policy: string;
    minimum_skill: number | null;
    maximum_skill: number | null;
    sex_classification: string;
    minimum_age: number | null;
    maximum_age: number | null;
    team_size: number;
    skill_verified_required: boolean;
    minimum_sts: number | null;
  } | null;
  if (!div) return;

  const startAt = (tournData as { start_at: string | null } | null)?.start_at ?? null;
  const members = ((memberData ?? []) as { player_id: string; member_order: number }[]).sort(
    (a, b) => a.member_order - b.member_order,
  );
  const memberIds = members.map((m) => m.player_id);
  if (memberIds.length === 0) return;

  const [{ data: profileData }, { data: skillData }, { data: fraudData }] = await Promise.all([
    svc
      .from('profiles')
      .select('id, sex, date_of_birth, account_status, self_rated_skill')
      .in('id', memberIds),
    svc
      .from('player_skill_profiles')
      .select('player_id, community_skill_level, sts, unique_voucher_count, skill_verified')
      .in('player_id', memberIds),
    svc
      .from('fraud_flags')
      .select('subject_id, flag_type, status')
      .eq('subject_type', 'user')
      .in('subject_id', memberIds)
      .in('status', ['open', 'reviewing']),
  ]);

  const profileById = new Map(
    (
      (profileData ?? []) as {
        id: string;
        sex: 'male' | 'female' | null;
        date_of_birth: string | null;
        account_status: string;
        self_rated_skill: number | null;
      }[]
    ).map((p) => [p.id, p]),
  );
  const skillById = new Map(
    (
      (skillData ?? []) as {
        player_id: string;
        community_skill_level: number | null;
        sts: number | string;
        unique_voucher_count: number;
        skill_verified: boolean;
      }[]
    ).map((s) => [s.player_id, s]),
  );
  const unusualByPlayer = new Set(
    ((fraudData ?? []) as { subject_id: string; flag_type: string }[])
      .filter((f) => f.flag_type.toLowerCase().includes('vouch'))
      .map((f) => f.subject_id),
  );

  const rules: DivisionEligibilityRules = {
    skillPolicy: (div.skill_policy as DivisionEligibilityRules['skillPolicy']) ?? 'band',
    minimumSkill: div.minimum_skill,
    maximumSkill: div.maximum_skill,
    sexClassification:
      (div.sex_classification as DivisionEligibilityRules['sexClassification']) ?? 'mixed',
    minimumAge: div.minimum_age,
    maximumAge: div.maximum_age,
    teamSize: div.team_size,
    skillVerifiedRequired: div.skill_verified_required,
    minimumSts: div.minimum_sts != null ? Number(div.minimum_sts) : null,
  };

  const players: PlayerEligibilityInput[] = members.map((m) => {
    const prof = profileById.get(m.player_id);
    const skill = skillById.get(m.player_id);
    return {
      playerId: m.player_id,
      communitySkillLevel: skill?.community_skill_level ?? null,
      sts: skill ? Number(skill.sts) : 0,
      skillVerified: skill?.skill_verified ?? false,
      selfRatedSkill: prof?.self_rated_skill ?? null,
      uniqueVoucherCount: skill?.unique_voucher_count ?? 0,
      sex: prof?.sex ?? null,
      ageAtStart: ageAt(prof?.date_of_birth ?? null, startAt),
      accountActive: (prof?.account_status ?? 'active') === 'active',
      unusualVouchActivity: unusualByPlayer.has(m.player_id),
      historicalSkillMismatch: false, // Phase 12 - no history source yet.
    };
  });

  const outcome = evaluateTeamEligibility({ players, rules, thresholds: settings.thresholds });

  const snapshot = {
    algorithmVersion: outcome.algorithmVersion,
    evaluatedAt: new Date().toISOString(),
    result: outcome.result,
    hardRuleCodes: outcome.hardRuleCodes,
    reasonCodes: outcome.reasonCodes,
    flags: outcome.flags,
    thresholds: settings.thresholds,
    players: outcome.players.map((p) => ({
      playerId: p.playerId,
      result: p.result,
      communitySkillLevel: p.communitySkillLevel,
      sts: p.sts,
      uniqueVoucherCount: p.uniqueVoucherCount,
      skillVerified: p.skillVerified,
      hardRuleCodes: p.hardRuleCodes,
      reasonCodes: p.reasonCodes,
      flags: p.flags,
    })),
  };

  await svc
    .from('registrations')
    .update({
      eligibility_status: RESULT_TO_ENUM[outcome.result],
      eligibility_snapshot: snapshot,
    })
    .eq('id', reg.id);

  const { data: t } = await svc
    .from('tournaments')
    .select('slug')
    .eq('id', reg.tournament_id)
    .maybeSingle();
  const slug = (t as { slug: string } | null)?.slug;
  if (slug) revalidateTag(tournamentTag(slug));
}
