import { describe, expect, it } from 'vitest';
import { describeDivisionFit, evaluateDivisionFit } from './division-fit';
import type { DivisionFitInput } from './division-fit';

function input(over: Partial<DivisionFitInput> = {}): DivisionFitInput {
  return {
    playerSex: 'male',
    effectiveSkill: 2,
    sexClassification: 'men',
    skillPolicy: 'band',
    divisionMinimumSkill: 2,
    divisionMaximumSkill: 2,
    ...over,
  };
}

describe('evaluateDivisionFit - sex classification', () => {
  it("lets a man into a men's division", () => {
    expect(evaluateDivisionFit(input()).fits).toBe(true);
  });

  it("keeps a woman out of a men's division", () => {
    expect(evaluateDivisionFit(input({ playerSex: 'female' }))).toEqual({
      fits: false,
      reason: 'sex',
    });
  });

  it("keeps a man out of a women's division", () => {
    const r = evaluateDivisionFit(input({ sexClassification: 'women' }));
    expect(r).toEqual({ fits: false, reason: 'sex' });
  });

  it('lets anyone into a mixed division', () => {
    for (const playerSex of ['male', 'female', 'other', null]) {
      expect(evaluateDivisionFit(input({ sexClassification: 'mixed', playerSex })).fits).toBe(true);
    }
  });

  it('tells a player with no recorded gender to fill it in, not that they are the wrong one', () => {
    expect(evaluateDivisionFit(input({ playerSex: null })).reason).toBe('sex_unknown');
  });

  it('still lets a player with no recorded gender into a mixed division', () => {
    expect(evaluateDivisionFit(input({ playerSex: null, sexClassification: 'mixed' })).fits).toBe(
      true,
    );
  });

  it('reports sex before skill when both are wrong', () => {
    const r = evaluateDivisionFit(input({ playerSex: 'female', effectiveSkill: 5 }));
    expect(r.reason).toBe('sex');
  });
});

describe('evaluateDivisionFit - skill band', () => {
  it('accepts a player inside the band', () => {
    expect(evaluateDivisionFit(input({ effectiveSkill: 2 })).fits).toBe(true);
  });

  it('blocks a player below the band', () => {
    expect(evaluateDivisionFit(input({ effectiveSkill: 1 }))).toEqual({
      fits: false,
      reason: 'skill_below',
    });
  });

  it('blocks a player above the band', () => {
    expect(evaluateDivisionFit(input({ effectiveSkill: 4 }))).toEqual({
      fits: false,
      reason: 'skill_above',
    });
  });

  it('never blocks a player with no known skill', () => {
    expect(evaluateDivisionFit(input({ effectiveSkill: null })).fits).toBe(true);
  });

  it('never applies a band to an open division', () => {
    expect(evaluateDivisionFit(input({ skillPolicy: 'open', effectiveSkill: 6 })).fits).toBe(true);
  });

  it('accepts both ends of an inclusive range', () => {
    const wide = { divisionMinimumSkill: 2, divisionMaximumSkill: 4 };
    expect(evaluateDivisionFit(input({ ...wide, effectiveSkill: 2 })).fits).toBe(true);
    expect(evaluateDivisionFit(input({ ...wide, effectiveSkill: 4 })).fits).toBe(true);
    expect(evaluateDivisionFit(input({ ...wide, effectiveSkill: 5 })).reason).toBe('skill_above');
  });

  it('ignores an absent bound rather than treating it as zero', () => {
    const noMin = evaluateDivisionFit(
      input({ divisionMinimumSkill: null, divisionMaximumSkill: 4, effectiveSkill: 0 }),
    );
    expect(noMin.fits).toBe(true);
  });
});

describe('describeDivisionFit', () => {
  const base = {
    divisionName: "Women's Doubles Beginner",
    bandLabel: 'Beginner',
    playerLevel: 'Novice',
  };

  it('tells the reader which category a division is for', () => {
    const msg = describeDivisionFit('sex', { ...base, subject: 'you' });
    expect(msg).toContain('for women');
  });

  it('names the partner rather than saying "that player" when a name is known', () => {
    const msg = describeDivisionFit('sex', {
      ...base,
      subject: 'partner',
      partnerName: 'Maria',
    });
    expect(msg.startsWith('Maria')).toBe(true);
  });

  it('falls back to a neutral noun when the partner has no name', () => {
    const msg = describeDivisionFit('sex', { ...base, subject: 'partner', partnerName: '  ' });
    expect(msg.startsWith('That player')).toBe(true);
  });

  it('states the division band and the player level for a skill refusal', () => {
    const msg = describeDivisionFit('skill_above', { ...base, subject: 'you' });
    expect(msg).toContain('Beginner');
    expect(msg).toContain('Novice');
  });

  it('omits the level clause when the player has none recorded', () => {
    const msg = describeDivisionFit('skill_above', {
      ...base,
      subject: 'you',
      playerLevel: null,
    });
    expect(msg).not.toContain('level is');
  });

  it('points a player with no gender at their profile, which is the thing they can fix', () => {
    const msg = describeDivisionFit('sex_unknown', { ...base, subject: 'you' });
    expect(msg.toLowerCase()).toContain('profile');
  });

  it('always points somewhere: every message suggests what to do instead', () => {
    const reasons = ['sex', 'sex_unknown', 'skill_below', 'skill_above'] as const;
    for (const reason of reasons) {
      for (const subject of ['you', 'partner'] as const) {
        const msg = describeDivisionFit(reason, { ...base, subject, partnerName: 'Ana' });
        expect(msg.toLowerCase()).toMatch(/try|pick|look for|enter one|choose|add your|add it to/);
      }
    }
  });

  it('never uses jargon a player would not say out loud', () => {
    const reasons = ['sex', 'sex_unknown', 'skill_below', 'skill_above'] as const;
    for (const reason of reasons) {
      const msg = describeDivisionFit(reason, { ...base, subject: 'you' }).toLowerCase();
      for (const word of ['eligib', 'criteria', 'invalid', 'constraint', 'policy']) {
        expect(msg).not.toContain(word);
      }
    }
  });
});
