import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { DEFAULT_SYSTEM_SETTINGS } from '@vouchplay/config';
import {
  evaluatePlayerEligibility,
  evaluateTeamEligibility,
  ELIGIBILITY_ALGORITHM_VERSION,
  BANNED_ELIGIBILITY_TERMS,
  type DivisionEligibilityRules,
  type EligibilityThresholds,
  type PlayerEligibilityInput,
} from './index';

// Thresholds sourced from the shipped config defaults so these tests also assert the seeded
// eligibility settings (migration 0011) match the locked spec (§25.4). Admin settings override at
// runtime; the ELIG_V1 algorithm stays version-locked.
const TH: EligibilityThresholds = {
  minEvidenceVouchers: DEFAULT_SYSTEM_SETTINGS.eligibility_min_unique_vouchers,
  reviewBelowSts: DEFAULT_SYSTEM_SETTINGS.eligibility_review_below_sts,
};

// A permissive band division: Beginner(1)..Low Intermediate(3), doubles, mixed, no age/STS/verified rule.
const band: DivisionEligibilityRules = {
  skillPolicy: 'band',
  minimumSkill: 1,
  maximumSkill: 3,
  sexClassification: 'mixed',
  minimumAge: null,
  maximumAge: null,
  teamSize: 2,
  skillVerifiedRequired: false,
  minimumSts: null,
};

// A well-evidenced, confident, in-band player (the "clean" baseline).
const strongPlayer = (over: Partial<PlayerEligibilityInput> = {}): PlayerEligibilityInput => ({
  playerId: 'p1',
  communitySkillLevel: 2,
  sts: 4.0,
  skillVerified: true,
  selfRatedSkill: 2,
  uniqueVoucherCount: 5,
  sex: 'male',
  ageAtStart: 30,
  accountActive: true,
  ...over,
});

describe('evaluatePlayerEligibility (ELIG_V1)', () => {
  it('in-band, well-evidenced, confident -> ELIGIBLE with no reasons/flags', () => {
    const r = evaluatePlayerEligibility(strongPlayer(), band, TH);
    expect(r.result).toBe('ELIGIBLE');
    expect(r.reasonCodes).toEqual([]);
    expect(r.flags).toEqual([]);
    expect(r.hardRuleCodes).toEqual([]);
  });

  it('below the division-required STS -> REVIEW (STS_BELOW_REQUIRED)', () => {
    const r = evaluatePlayerEligibility(
      strongPlayer({ sts: 4.0 }),
      { ...band, minimumSts: 4.5 },
      TH,
    );
    expect(r.result).toBe('REVIEW');
    expect(r.reasonCodes).toContain('STS_BELOW_REQUIRED');
  });

  it('community skill above the division max -> SKILL_MISMATCH', () => {
    const r = evaluatePlayerEligibility(strongPlayer({ communitySkillLevel: 4 }), band, TH);
    expect(r.result).toBe('SKILL_MISMATCH');
    expect(r.reasonCodes).toContain('SKILL_ABOVE_DIVISION_MAX');
  });

  it('exactly at the division max is NOT a mismatch (boundary)', () => {
    const r = evaluatePlayerEligibility(strongPlayer({ communitySkillLevel: 3 }), band, TH);
    expect(r.result).toBe('ELIGIBLE');
  });

  it('unrated (no community skill) -> REVIEW (UNRATED)', () => {
    const r = evaluatePlayerEligibility(
      strongPlayer({ communitySkillLevel: null, sts: 0, uniqueVoucherCount: 0 }),
      band,
      TH,
    );
    expect(r.result).toBe('REVIEW');
    expect(r.reasonCodes).toContain('UNRATED');
  });

  it('too few vouches -> REVIEW (INSUFFICIENT_EVIDENCE)', () => {
    const r = evaluatePlayerEligibility(strongPlayer({ uniqueVoucherCount: 1 }), band, TH);
    expect(r.result).toBe('REVIEW');
    expect(r.reasonCodes).toContain('INSUFFICIENT_EVIDENCE');
  });

  it('STS below the admin confidence threshold -> REVIEW (LOW_CONFIDENCE)', () => {
    const r = evaluatePlayerEligibility(strongPlayer({ sts: 2.5 }), band, TH);
    expect(r.result).toBe('REVIEW');
    expect(r.reasonCodes).toContain('LOW_CONFIDENCE');
  });

  it('Skill-Verified required but missing -> REVIEW', () => {
    const r = evaluatePlayerEligibility(
      strongPlayer({ skillVerified: false }),
      { ...band, skillVerifiedRequired: true },
      TH,
    );
    expect(r.result).toBe('REVIEW');
    expect(r.reasonCodes).toContain('SKILL_VERIFIED_REQUIRED_MISSING');
  });

  it('an advisory flag alone forces at least REVIEW', () => {
    const r = evaluatePlayerEligibility(strongPlayer({ unusualVouchActivity: true }), band, TH);
    expect(r.result).toBe('REVIEW');
    expect(r.flags).toContain('UNUSUAL_VOUCH_ACTIVITY');
  });

  it('open policy never yields SKILL_MISMATCH even for a high skill', () => {
    const r = evaluatePlayerEligibility(
      strongPlayer({ communitySkillLevel: 6 }),
      {
        ...band,
        skillPolicy: 'open',
        minimumSkill: null,
        maximumSkill: null,
      },
      TH,
    );
    expect(r.result).toBe('ELIGIBLE');
  });
});

describe('hard rules (§25.2) short-circuit to INELIGIBLE_HARD_RULE', () => {
  it('wrong sex for a women-only division', () => {
    const r = evaluatePlayerEligibility(
      strongPlayer({ sex: 'male' }),
      {
        ...band,
        sexClassification: 'women',
      },
      TH,
    );
    expect(r.result).toBe('INELIGIBLE_HARD_RULE');
    expect(r.hardRuleCodes).toContain('WRONG_SEX');
  });

  it('age above the division maximum at the start date', () => {
    const r = evaluatePlayerEligibility(
      strongPlayer({ ageAtStart: 40 }),
      {
        ...band,
        maximumAge: 18,
      },
      TH,
    );
    expect(r.result).toBe('INELIGIBLE_HARD_RULE');
    expect(r.hardRuleCodes).toContain('AGE_ABOVE_MAX');
  });

  it('suspended/inactive account', () => {
    const r = evaluatePlayerEligibility(strongPlayer({ accountActive: false }), band, TH);
    expect(r.result).toBe('INELIGIBLE_HARD_RULE');
    expect(r.hardRuleCodes).toContain('ACCOUNT_NOT_ACTIVE');
  });

  it('a hard rule takes precedence over a skill mismatch', () => {
    // Above the band AND age-ineligible: the hard rule wins (not SKILL_MISMATCH).
    const r = evaluatePlayerEligibility(
      strongPlayer({ communitySkillLevel: 6, ageAtStart: 12 }),
      { ...band, minimumAge: 18 },
      TH,
    );
    expect(r.result).toBe('INELIGIBLE_HARD_RULE');
    expect(r.hardRuleCodes).toContain('AGE_BELOW_MIN');
  });

  it('age-restricted division with unknown DOB -> REVIEW (AGE_UNKNOWN), not a hard fail', () => {
    const r = evaluatePlayerEligibility(
      strongPlayer({ ageAtStart: null }),
      {
        ...band,
        minimumAge: 18,
      },
      TH,
    );
    expect(r.result).toBe('REVIEW');
    expect(r.reasonCodes).toContain('AGE_UNKNOWN');
  });
});

describe('evaluateTeamEligibility (§25.1 team = worst-of-members)', () => {
  it('worst member drives the team result', () => {
    const eligible = strongPlayer({ playerId: 'a' });
    const mismatch = strongPlayer({ playerId: 'b', communitySkillLevel: 5 });
    const t = evaluateTeamEligibility({
      players: [eligible, mismatch],
      rules: band,
      thresholds: TH,
    });
    expect(t.result).toBe('SKILL_MISMATCH');
    expect(t.players).toHaveLength(2);
    expect(t.algorithmVersion).toBe(ELIGIBILITY_ALGORITHM_VERSION);
  });

  it('a member hard-rule failure makes the whole team INELIGIBLE_HARD_RULE', () => {
    const ok = strongPlayer({ playerId: 'a' });
    const banned = strongPlayer({ playerId: 'b', accountActive: false });
    const t = evaluateTeamEligibility({ players: [ok, banned], rules: band, thresholds: TH });
    expect(t.result).toBe('INELIGIBLE_HARD_RULE');
  });

  it('wrong team size is a team-level hard rule', () => {
    const t = evaluateTeamEligibility({
      players: [strongPlayer()],
      rules: band,
      thresholds: TH,
    });
    expect(t.result).toBe('INELIGIBLE_HARD_RULE');
    expect(t.hardRuleCodes).toContain('INVALID_TEAM_SIZE');
  });

  it('team-level context: closed registration and duplicate are hard rules', () => {
    const t = evaluateTeamEligibility({
      players: [strongPlayer({ playerId: 'a' }), strongPlayer({ playerId: 'b' })],
      rules: band,
      thresholds: TH,
      hardContext: { registrationClosed: true, duplicateRegistration: true },
    });
    expect(t.result).toBe('INELIGIBLE_HARD_RULE');
    expect(t.hardRuleCodes).toEqual(
      expect.arrayContaining(['REGISTRATION_CLOSED', 'DUPLICATE_REGISTRATION']),
    );
  });

  it('all-clean team -> ELIGIBLE', () => {
    const t = evaluateTeamEligibility({
      players: [strongPlayer({ playerId: 'a' }), strongPlayer({ playerId: 'b' })],
      rules: band,
      thresholds: TH,
    });
    expect(t.result).toBe('ELIGIBLE');
  });
});

// ---------------------------------------------------------------------------
// §25.6 - No automated defamation. The system must never emit "sandbagger"/"smurf"/"cheater".
// This guard scans the whole source tree (packages + apps/web) and fails the build on any use in
// code. Only the files that legitimately define the ban list are allowed to contain the terms.
// ---------------------------------------------------------------------------
describe('§25.6 no defamatory labels in source', () => {
  const REPO_ROOT = resolve(process.cwd(), '..', '..');
  const SCAN_DIRS = ['packages', join('apps', 'web', 'src')];
  const ALLOWLIST = new Set(
    [
      join('packages', 'core', 'src', 'eligibility', 'labels.ts'),
      join('packages', 'core', 'src', 'eligibility', 'eligibility.test.ts'),
    ].map((p) => p.split('/').join(sep)),
  );
  const CODE_EXT = /\.(ts|tsx)$/;
  const SKIP_DIR = new Set(['node_modules', '.next', 'dist', 'build', '.turbo']);

  function walk(dir: string, acc: string[]): string[] {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return acc;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        if (!SKIP_DIR.has(name)) walk(full, acc);
      } else if (CODE_EXT.test(name)) {
        acc.push(full);
      }
    }
    return acc;
  }

  it('contains no banned eligibility term in any .ts/.tsx file', () => {
    const files = SCAN_DIRS.flatMap((d) => walk(join(REPO_ROOT, d), []));
    // Sanity: the guard actually found files to scan.
    expect(files.length).toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(REPO_ROOT, file);
      if (ALLOWLIST.has(rel)) continue;
      const text = readFileSync(file, 'utf8').toLowerCase();
      for (const term of BANNED_ELIGIBILITY_TERMS) {
        if (text.includes(term)) offenders.push(`${rel} :: ${term}`);
      }
    }
    expect(offenders, `Banned defamatory terms found in source:\n${offenders.join('\n')}`).toEqual(
      [],
    );
  });
});
