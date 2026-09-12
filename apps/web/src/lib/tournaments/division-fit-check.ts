import 'server-only';
import { SKILL_BANDS } from '@vouchplay/config';
import { describeDivisionFit, evaluateDivisionFit } from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';
import { getActiveSkillVersion } from '@/lib/settings';
import {
  pickActiveSkill,
  selectSkillProfiles,
  type SkillProfileRow,
} from '@/lib/vouches/active-skill';
import { getTournamentRules } from './queries';
import { divisionName } from './dto';

/**
 * Server-side gate: may these players enter this division? (master_plan §2D)
 *
 * The rule itself is pure and lives in `@vouchplay/core`; the SQL twin `player_fits_division()` is
 * the backstop. This is the layer that turns a refusal into a sentence, so an action can say what is
 * wrong instead of "That action failed."
 *
 * Checked on EVERY path that puts a player into a division - naming a partner, entering, replacing a
 * declined partner - because a rule enforced on only some of them is not a rule.
 */

interface DivisionRuleRow {
  id: string;
  tournament_id: string;
  name_override: string | null;
  skill_policy: string;
  minimum_skill: number | null;
  maximum_skill: number | null;
  format: string;
  sex_classification: string;
  minimum_age: number | null;
  maximum_age: number | null;
}

function bandLabel(row: DivisionRuleRow): string | null {
  if (row.skill_policy === 'open') return null;
  const label = (o: number | null) =>
    o == null ? null : (SKILL_BANDS.find((b) => b.ordinal === o)?.label ?? null);
  const min = label(row.minimum_skill);
  const max = label(row.maximum_skill);
  if (min && max) return min === max ? min : `${min} to ${max}`;
  return min ?? max;
}

function levelLabel(ordinal: number | null): string | null {
  if (ordinal == null) return null;
  return SKILL_BANDS.find((b) => b.ordinal === ordinal)?.label ?? null;
}

export interface FitCandidate {
  playerId: string;
  /** 'you' when this is the person acting, 'partner' for the player they named. */
  subject: 'you' | 'partner';
  /** Shown in the message when the subject is a partner. */
  name?: string | null;
  /**
   * The sex of the OTHER seat on this team, when this candidate is being checked against a specific
   * partner (master_plan §2AM decision 1). Composition (one male + one female in a mixed division) is
   * a property of the PAIR, so pass this only when a real partner is known; omitting it leaves the
   * per-player sex/skill check unchanged.
   */
  partnerSex?: 'male' | 'female' | null;
}

/**
 * Returns a player-facing sentence for the first candidate who does not fit, or null when everyone
 * does. Null is the success case, so callers read `if (msg) return { error: msg };`.
 *
 * A division that cannot be read is NOT treated as a pass: refusing is the safe direction when the
 * rule is unknown, and the caller's own "division not found" check will usually have fired first.
 */
export async function checkDivisionFit(
  divisionId: string,
  candidates: FitCandidate[],
): Promise<string | null> {
  if (candidates.length === 0) return null;
  const svc = createServiceClient();

  const { data: divRow, error: divError } = await svc
    .from('divisions')
    .select(
      'id, tournament_id, name_override, skill_policy, minimum_skill, maximum_skill, format, sex_classification, minimum_age, maximum_age',
    )
    .eq('id', divisionId)
    .maybeSingle();
  if (divError) return 'Could not check this division. Please try again.';
  const div = divRow as DivisionRuleRow | null;
  if (!div) return 'That division is no longer available.';

  const ids = Array.from(new Set(candidates.map((c) => c.playerId)));
  const skillVersion = await getActiveSkillVersion();
  const [{ data: profileRows, error: profileError }, { rows: skillRows }] = await Promise.all([
    svc.from('profiles').select('id, sex, self_rated_skill').in('id', ids),
    // Effective skill honours the public skill-algorithm switch (§2AF rollout step 2) - falls open to
    // V1 columns when migration 0034 is not applied yet.
    selectSkillProfiles<SkillProfileRow & { player_id: string }>(
      skillVersion,
      (columns) => svc.from('player_skill_profiles').select(columns).in('player_id', ids),
      'player_id',
    ),
  ]);
  // A failed lookup is a failed lookup, never a silent pass (v1.31).
  if (profileError) return 'Could not check player details. Please try again.';

  const profiles = new Map(
    (
      (profileRows ?? []) as { id: string; sex: string | null; self_rated_skill: number | null }[]
    ).map((p) => [p.id, p]),
  );
  const community = new Map(
    skillRows.map((row) => [row.player_id, pickActiveSkill(row, skillVersion).communitySkillLevel]),
  );

  // The skill rule is the organizer's to switch on: "Only allow players at each division's level
  // or higher". Off means skill never blocks (§2F). `allowPlayDownOneLevel` (§2AO decision C) widens
  // that floor by exactly one level rather than switching it off.
  const { enforceSkillFloor, allowPlayDownOneLevel } = await getTournamentRules(div.tournament_id);

  const name = divisionName(div as Parameters<typeof divisionName>[0]);
  const band = bandLabel(div);

  for (const c of candidates) {
    const p = profiles.get(c.playerId);
    if (!p) return 'Could not check player details. Please try again.';
    const effectiveSkill = community.get(c.playerId) ?? p.self_rated_skill ?? null;
    const verdict = evaluateDivisionFit({
      playerSex: p.sex,
      effectiveSkill,
      sexClassification: div.sex_classification,
      skillPolicy: div.skill_policy,
      divisionMinimumSkill: div.minimum_skill,
      divisionMaximumSkill: div.maximum_skill,
      enforceSkillFloor,
      allowPlayDownOneLevel,
      partnerSex: c.partnerSex,
      format: div.format,
    });
    if (!verdict.fits && verdict.reason) {
      return describeDivisionFit(verdict.reason, {
        subject: c.subject,
        partnerName: c.name ?? null,
        divisionName: name,
        bandLabel: band,
        playerLevel: levelLabel(effectiveSkill),
      });
    }
  }
  return null;
}
